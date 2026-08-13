import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Columns3, Download,
  Eye, EyeOff, FilePenLine, FilterX, GripVertical, Loader2, Pencil, Pin, Plus, Redo2,
  RefreshCw, RotateCcw, Search, Undo2, Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { useVirtualViewport } from "@/hooks/use-virtual-viewport";
import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { canWriteCatalog } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
  CatalogComponent, CatalogMetadataBatch, CatalogMetadataField, CatalogMetadataFieldType,
  CatalogMetadataGridPreferences, CatalogMetadataGridResponse, WorkflowStage,
} from "@/types/catalog";

const PAGE_SIZE = 100;
const DEFAULT_WIDTH = 180;
const IDENTITY_WIDTH = 330;
const GRID_ROW_HEIGHT = 36;
const GRID_OVERSCAN = 8;
const WORKFLOW_LABELS: Record<WorkflowStage, string> = {
  open: "Open", in_progress: "In progress", qa_review: "Awaiting QA", done: "Approved",
  released: "Released", archived: "Archived",
};
const AVAILABILITY_LABELS: Record<string, string> = { metadata_only: "Metadata only", files_partial: "Files partial", place_ready: "CAD complete" };
const VALIDATION_LABELS: Record<string, string> = { passed: "Passed", warning: "Warnings", failed: "Failed", skipped: "Skipped", not_run: "Not run" };

type StagedRows = Record<string, { expected_revision_id: string; patch: Record<string, string> }>;
type FieldDraft = { key: string; label: string; description: string; type: CatalogMetadataFieldType; unit: string; enumValues: string; required: boolean };

const EMPTY_FIELD: FieldDraft = { key: "", label: "", description: "", type: "text", unit: "", enumValues: "", required: false };

function cloneStaged(value: StagedRows): StagedRows {
  return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, { ...row, patch: { ...row.patch } }]));
}

function componentFieldValue(component: CatalogComponent, field: CatalogMetadataField): string {
  if (field.storage_kind === "extra") return String(component.extra_fields?.[field.storage_key] ?? "");
  return String((component as unknown as Record<string, unknown>)[field.storage_key] ?? "");
}

function validateCell(field: CatalogMetadataField, value: string): string {
  if (!value.trim()) return field.required ? "Required" : "";
  if (field.type === "number" && !Number.isFinite(Number(value))) return "Invalid number";
  if (field.type === "url") {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return "Use HTTP(S)";
    } catch { return "Invalid URL"; }
  }
  if (field.type === "enum" && !field.enum_values.includes(value)) return "Invalid option";
  return "";
}

function MetadataCell({
  value, field, readOnly, active, rowIndex, columnIndex, pinnedOffset, onCommit, onActivate, onNavigate,
}: {
  value: string;
  field: CatalogMetadataField;
  readOnly: boolean;
  active: boolean;
  rowIndex: number;
  columnIndex: number;
  pinnedOffset?: number;
  onCommit: (value: string) => void;
  onActivate: () => void;
  onNavigate: (rowDelta: number, columnDelta: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelCommit = useRef(false);
  const editorRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => { if (active) editorRef.current?.focus(); }, [active]);
  const error = validateCell(field, draft);
  const commit = () => {
    if (cancelCommit.current) { cancelCommit.current = false; return; }
    if (!readOnly && !error && draft !== value) onCommit(draft);
  };
  const pinnedClass = pinnedOffset === undefined ? "" : "sticky z-10 bg-background";
  const pinnedStyle = pinnedOffset === undefined ? undefined : { left: pinnedOffset };

  if (!active || readOnly) {
    const display = field.type === "boolean"
      ? (["true", "1", "yes"].includes(value.toLocaleLowerCase()) ? "True" : "False")
      : value || "—";
    return <div
      className={cn("flex h-9 min-w-0 items-center border-r px-2 text-xs outline-none focus:ring-1 focus:ring-inset focus:ring-ring", pinnedClass)}
      style={pinnedStyle}
      data-cell={`${rowIndex}:${columnIndex}`}
      tabIndex={0}
      title={field.description || display}
      onFocus={onActivate}
      onDoubleClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !readOnly) { event.preventDefault(); onActivate(); }
        if (event.key === "ArrowUp") { event.preventDefault(); onNavigate(-1, 0); }
        if (event.key === "ArrowDown") { event.preventDefault(); onNavigate(1, 0); }
        if (event.key === "ArrowLeft") { event.preventDefault(); onNavigate(0, -1); }
        if (event.key === "ArrowRight" || event.key === "Tab") { event.preventDefault(); onNavigate(0, event.shiftKey ? -1 : 1); }
      }}
    ><span className="truncate">{display}</span></div>;
  }

  if (field.type === "boolean") {
    return <div className={cn("flex h-9 items-center justify-center border-r px-2", pinnedClass)} style={pinnedStyle} data-cell={`${rowIndex}:${columnIndex}`}>
      <Checkbox ref={editorRef as React.Ref<HTMLButtonElement>} checked={["true", "1", "yes"].includes(value.toLocaleLowerCase())} onCheckedChange={(checked) => onCommit(checked ? "true" : "false")} />
    </div>;
  }
  if (field.type === "enum") {
    return <div className={cn("h-9 border-r p-1", pinnedClass)} style={pinnedStyle} data-cell={`${rowIndex}:${columnIndex}`}>
      <select
        ref={editorRef as React.Ref<HTMLSelectElement>}
        className="h-full w-full border-0 bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      >
        <option value="">—</option>
        {field.enum_values.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>;
  }
  return <div className={cn("h-9 border-r p-1", pinnedClass, error && "bg-destructive/10")} style={pinnedStyle} data-cell={`${rowIndex}:${columnIndex}`} title={error || field.description}>
    <input
      ref={editorRef as React.Ref<HTMLInputElement>}
      className="h-full w-full border-0 bg-transparent px-1 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-ring disabled:cursor-default"
      type={field.type === "number" ? "text" : field.type === "url" ? "url" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") { cancelCommit.current = true; setDraft(value); event.currentTarget.blur(); }
        if (event.key === "Enter") { event.preventDefault(); onNavigate(1, 0); }
        if (event.key === "ArrowUp") { event.preventDefault(); onNavigate(-1, 0); }
        if (event.key === "ArrowDown") { event.preventDefault(); onNavigate(1, 0); }
        if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) { event.preventDefault(); onNavigate(0, -1); }
        if (event.key === "ArrowRight" && event.currentTarget.selectionStart === draft.length && event.currentTarget.selectionEnd === draft.length) { event.preventDefault(); onNavigate(0, 1); }
      }}
      aria-invalid={Boolean(error)}
    />
  </div>;
}

function FieldDefinitionDialog({
  open, field, saving, onOpenChange, onSave,
}: {
  open: boolean;
  field: CatalogMetadataField | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: FieldDraft) => void;
}) {
  const [draft, setDraft] = useState<FieldDraft>(EMPTY_FIELD);
  useEffect(() => {
    setDraft(field ? {
      key: field.key, label: field.label, description: field.description, type: field.type,
      unit: field.unit, enumValues: field.enum_values.join(", "), required: field.required,
    } : EMPTY_FIELD);
  }, [field, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>{field ? "Edit custom field" : "Add custom field"}</DialogTitle><DialogDescription>Typed fields are validated in the grid, CSV imports, and release revisions.</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs"><span className="font-medium">Label</span><Input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Machine key</span><Input value={draft.key} disabled={Boolean(field)} onChange={(event) => setDraft({ ...draft, key: event.target.value })} placeholder="voltage_rating" /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Type</span><Select value={draft.type} onValueChange={(value) => setDraft({ ...draft, type: value as CatalogMetadataFieldType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["text", "number", "url", "boolean", "enum"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Unit</span><Input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="V, A, Ω…" /></label>
        {draft.type === "enum" ? <label className="space-y-1 text-xs sm:col-span-2"><span className="font-medium">Options</span><Input value={draft.enumValues} onChange={(event) => setDraft({ ...draft, enumValues: event.target.value })} placeholder="Active, NRND, Obsolete" /></label> : null}
        <label className="space-y-1 text-xs sm:col-span-2"><span className="font-medium">Description</span><Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2"><Checkbox checked={draft.required} onCheckedChange={(checked) => setDraft({ ...draft, required: checked === true })} />Required for every edited component</label>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={() => onSave(draft)} disabled={saving || !draft.label.trim() || (!field && !draft.key.trim())}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save field</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function BatchReviewDialog({
  open, batch, localCount, summary, busy, isAdmin, onSummaryChange, onOpenChange, onValidate, onApproveFields, onApply,
}: {
  open: boolean;
  batch: CatalogMetadataBatch | null;
  localCount: number;
  summary: string;
  busy: boolean;
  isAdmin: boolean;
  onSummaryChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onValidate: () => void;
  onApproveFields: () => void;
  onApply: (ids: string[]) => void;
}) {
  const valid = batch?.items.filter((item) => item.validation_status === "valid") || [];
  const validKey = valid.map((item) => item.id).join("|");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => setSelectedIds(validKey ? validKey.split("|") : []), [batch?.id, validKey]);
  const allSelected = valid.length > 0 && selectedIds.length === valid.length;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden">
      <DialogHeader><DialogTitle>Review metadata changes</DialogTitle><DialogDescription>Each valid component becomes one metadata-only revision in Awaiting QA. CAD assets remain unchanged.</DialogDescription></DialogHeader>
      {!batch ? <div className="space-y-4">
        <div className="border bg-muted/20 p-3 text-sm"><span className="font-medium">{localCount} components</span> have staged spreadsheet changes.</div>
        <label className="space-y-1 text-xs"><span className="font-medium">Required change summary</span><Input value={summary} onChange={(event) => onSummaryChange(event.target.value)} placeholder="Correct sourcing and engineering metadata" /></label>
      </div> : <>
        <div className="flex flex-wrap items-center gap-2 border-y py-3 text-xs">
          {valid.length ? <label className="flex items-center gap-2"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedIds(checked === true ? valid.map((item) => item.id) : [])} />Select all valid</label> : null}
          <Badge variant="outline">{batch.total_items} reviewed</Badge><Badge variant="success">{batch.valid_items} valid</Badge>
          {batch.skipped_unchanged_rows ? <Badge variant="secondary">{batch.skipped_unchanged_rows.toLocaleString()} unchanged skipped</Badge> : null}
          {batch.items.some((item) => item.validation_status === "invalid" || item.validation_status === "conflict") ? <Badge variant="destructive">{batch.items.filter((item) => ["invalid", "conflict"].includes(item.validation_status)).length} blocked</Badge> : null}
          {batch.unknown_fields.length ? <Badge variant="warning">{batch.unknown_fields.length} new fields</Badge> : null}
          <a className="ml-auto text-primary underline-offset-4 hover:underline" href={`/api/catalog/metadata/batches/${batch.id}/report.csv`}>Download report</a>
        </div>
        {batch.unknown_fields.length ? <div className="border border-warning/50 bg-warning/10 p-3 text-xs"><p className="font-medium">CSV proposes: {batch.unknown_fields.map((field) => field.label).join(", ")}</p><p className="mt-1 text-muted-foreground">These will be registered as text fields before the batch can run.</p>{isAdmin ? <Button className="mt-2" size="sm" variant="outline" onClick={onApproveFields} disabled={busy}>Approve new fields</Button> : <p className="mt-2 text-warning">An administrator must approve these definitions.</p>}</div> : null}
        <ScrollArea className="min-h-0 flex-1 border">
          <div className="divide-y">
            {batch.items.map((item) => <div key={item.id} className="p-3 text-xs">
              <div className="flex items-center gap-2">{item.validation_status === "valid" ? <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(checked) => setSelectedIds((current) => checked === true ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={`Select ${item.mpn || item.name}`} /> : null}<span className="font-medium">{item.mpn || item.name}</span><Badge variant={item.validation_status === "valid" || item.validation_status === "applied" ? "success" : item.validation_status === "noop" ? "secondary" : "destructive"}>{item.validation_status}</Badge></div>
              {item.error_message ? <p className="mt-1 text-destructive">{item.error_message}</p> : null}
              {item.diff.length ? <div className="mt-2 grid gap-1 sm:grid-cols-2">{item.diff.map((change) => <p key={change.field} className="truncate text-muted-foreground"><span className="font-medium text-foreground">{change.label}:</span> {change.before || "—"} → {change.after || "—"}</p>)}</div> : null}
            </div>)}
          </div>
        </ScrollArea>
      </>}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
        {!batch ? <Button onClick={onValidate} disabled={busy || !summary.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Validate changes</Button> : <Button onClick={() => onApply(selectedIds)} disabled={busy || batch.status === "needs_fields" || selectedIds.length === 0}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply {selectedIds.length} revisions</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function LibraryBulkEditWorkspace({ user }: { user: User | null }) {
  const [items, setItems] = useState<CatalogComponent[]>([]);
  const [fields, setFields] = useState<CatalogMetadataField[]>([]);
  const [preferences, setPreferences] = useState<CatalogMetadataGridPreferences>({ visible: [], order: [], widths: {}, pinned: [] });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [workflow, setWorkflow] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [validation, setValidation] = useState("all");
  const [category, setCategory] = useState("all");
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fieldQuery, setFieldQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  // Archiving a field hides it from every component; the dialog names it.
  const fieldArchiveTarget = useConfirmTarget<CatalogMetadataField>();
  const [staged, setStaged] = useState<StagedRows>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [batch, setBatch] = useState<CatalogMetadataBatch | null>(null);
  const [changeSummary, setChangeSummary] = useState("Bulk update component metadata");
  const [busy, setBusy] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CatalogMetadataField | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; column: number } | null>(null);
  const undoStack = useRef<StagedRows[]>([]);
  const redoStack = useRef<StagedRows[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const preferencesLoaded = useRef(false);
  const gridViewport = useVirtualViewport();
  const isAdmin = user?.role === "admin";
  const canEdit = canWriteCatalog(user?.role);
  // An empty grid means something different when filters are active than when the
  // catalog itself is empty, and the fix differs too.
  const bulkEditIsFiltered = Boolean(query.trim() || category !== "all" || showArchived);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadFieldsAndPreferences = useCallback(async () => {
    try {
      const [fieldResponse, layout, categoryResponse] = await Promise.all([
        fetchJson<{ items: CatalogMetadataField[] }>("/api/catalog/metadata/fields?include_archived=true"),
        fetchJson<CatalogMetadataGridPreferences>("/api/catalog/metadata/grid-preferences"),
        fetchJson<{ categories: Array<{ name: string; count: number }> }>("/api/catalog/categories"),
      ]);
      setFields(fieldResponse.items);
      setCategories(categoryResponse.categories);
      const activeKeys = fieldResponse.items.filter((field) => !field.archived).map((field) => field.key);
      setPreferences({
        visible: layout.visible?.length ? layout.visible.filter((key) => activeKeys.includes(key)) : activeKeys,
        order: layout.order?.length ? [...layout.order.filter((key) => activeKeys.includes(key)), ...activeKeys.filter((key) => !layout.order.includes(key))] : activeKeys,
        widths: layout.widths || {}, pinned: layout.pinned || [],
      });
      preferencesLoaded.current = true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load metadata fields"); }
  }, []);

  useEffect(() => { void loadFieldsAndPreferences(); }, [loadFieldsAndPreferences]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort_by: sortBy, sort_dir: sortDir });
    preferences.visible.forEach((fieldKey) => params.append("field", fieldKey));
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (workflow !== "all") params.set("workflow_stage", workflow);
    if (availability !== "all") params.set("availability_state", availability);
    if (validation !== "all") params.set("validation_status", validation);
    if (category !== "all") params.set("category", category === "uncategorized" ? "" : category);
    void fetchJson<CatalogMetadataGridResponse>(`/api/catalog/metadata/grid?${params.toString()}`, { signal: controller.signal })
      .then((response) => { setItems(response.items); setPages(response.pages); setTotal(response.total); })
      .catch((error) => { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Failed to load metadata grid"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [availability, category, debouncedQuery, page, preferences.visible, refreshKey, sortBy, sortDir, validation, workflow]);

  useEffect(() => {
    if (!preferencesLoaded.current) return;
    const timer = window.setTimeout(() => {
      void fetchJson("/api/catalog/metadata/grid-preferences", { method: "PUT", body: JSON.stringify(preferences) }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [preferences]);

  const activeFields = useMemo(() => fields.filter((field) => !field.archived), [fields]);
  const orderedFields = useMemo(() => {
    const rank = new Map(preferences.order.map((key, index) => [key, index]));
    return [...activeFields].sort((a, b) => (rank.get(a.key) ?? 10000 + a.display_order) - (rank.get(b.key) ?? 10000 + b.display_order));
  }, [activeFields, preferences.order]);
  const visibleFields = useMemo(() => {
    const visible = orderedFields.filter((field) => preferences.visible.includes(field.key));
    return [...visible.filter((field) => preferences.pinned.includes(field.key)), ...visible.filter((field) => !preferences.pinned.includes(field.key))];
  }, [orderedFields, preferences.pinned, preferences.visible]);
  const pinnedOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let left = IDENTITY_WIDTH;
    visibleFields.forEach((field) => {
      if (!preferences.pinned.includes(field.key)) return;
      offsets.set(field.key, left);
      left += preferences.widths[field.key] || DEFAULT_WIDTH;
    });
    return offsets;
  }, [preferences.pinned, preferences.widths, visibleFields]);
  const gridTemplate = useMemo(() => `${IDENTITY_WIDTH}px ${visibleFields.map((field) => `${preferences.widths[field.key] || DEFAULT_WIDTH}px`).join(" ")}`, [preferences.widths, visibleFields]);
  const filteredFieldList = useMemo(() => fields.filter((field) => (showArchived || !field.archived) && `${field.label} ${field.key} ${field.description}`.toLocaleLowerCase().includes(fieldQuery.toLocaleLowerCase())), [fieldQuery, fields, showArchived]);
  const groupedFieldList = useMemo(() => (["core", "engineering", "custom"] as const).map((group) => ({ group, items: filteredFieldList.filter((field) => field.group === group) })).filter((section) => section.items.length), [filteredFieldList]);
  const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, gridViewport.scrollTop - 40) / GRID_ROW_HEIGHT) - GRID_OVERSCAN);
  const lastVisibleRow = Math.min(items.length, Math.ceil((gridViewport.scrollTop + gridViewport.height) / GRID_ROW_HEIGHT) + GRID_OVERSCAN);
  const visibleRows = items.slice(firstVisibleRow, lastVisibleRow);

  const commitStaged = useCallback((next: StagedRows) => {
    setStaged((current) => { undoStack.current.push(cloneStaged(current)); if (undoStack.current.length > 100) undoStack.current.shift(); redoStack.current = []; return next; });
  }, []);
  const undo = () => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(cloneStaged(staged)); setStaged(previous); };
  const redo = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(cloneStaged(staged)); setStaged(next); };

  const applyCellValue = useCallback((component: CatalogComponent, field: CatalogMetadataField, value: string, base: StagedRows = staged) => {
    const next = cloneStaged(base);
    const row = next[component.id] || { expected_revision_id: component.revision_id, patch: {} };
    const original = componentFieldValue(component, field);
    if (value === original) delete row.patch[field.key]; else row.patch[field.key] = value;
    if (Object.keys(row.patch).length) next[component.id] = row; else delete next[component.id];
    return next;
  }, [staged]);

  const setCellValue = (component: CatalogComponent, field: CatalogMetadataField, value: string) => commitStaged(applyCellValue(component, field, value));
  const displayValue = (component: CatalogComponent, field: CatalogMetadataField) => staged[component.id]?.patch[field.key] ?? componentFieldValue(component, field);

  const navigateCell = (row: number, column: number) => {
    const nextRow = Math.max(0, Math.min(items.length - 1, row));
    const nextColumn = Math.max(0, Math.min(visibleFields.length - 1, column));
    setActiveCell({ row: nextRow, column: nextColumn });
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${nextRow}:${nextColumn}"]`)?.focus());
  };

  const handleGridPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!canEdit || !activeCell) return;
    const matrix = event.clipboardData.getData("text/plain").replace(/\r/g, "").split("\n").filter((line, index, rows) => line || index < rows.length - 1).map((line) => line.split("\t"));
    if (!matrix.length) return;
    event.preventDefault();
    let next = cloneStaged(staged);
    matrix.forEach((rowValues, rowOffset) => rowValues.forEach((value, columnOffset) => {
      const component = items[activeCell.row + rowOffset];
      const field = visibleFields[activeCell.column + columnOffset];
      if (component && field && !validateCell(field, value)) next = applyCellValue(component, field, value, next);
    }));
    commitStaged(next);
  };

  const resizeColumn = (key: string, startX: number, startWidth: number) => {
    const move = (event: PointerEvent) => setPreferences((current) => ({ ...current, widths: { ...current.widths, [key]: Math.max(80, Math.min(600, startWidth + event.clientX - startX)) } }));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };

  const toggleField = (key: string) => setPreferences((current) => ({ ...current, visible: current.visible.includes(key) ? current.visible.filter((item) => item !== key) : [...current.visible, key] }));
  const togglePinned = (key: string) => setPreferences((current) => ({ ...current, pinned: current.pinned.includes(key) ? current.pinned.filter((item) => item !== key) : [...current.pinned, key] }));
  const moveField = (key: string, delta: number) => setPreferences((current) => {
    const order = [...current.order]; const index = order.indexOf(key); const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]]; return { ...current, order };
  });

  const saveField = async (draft: FieldDraft) => {
    setBusy(true);
    try {
      const body = JSON.stringify({ key: draft.key, label: draft.label, description: draft.description, type: draft.type, unit: draft.unit, enum_values: draft.enumValues.split(",").map((value) => value.trim()).filter(Boolean), required: draft.required });
      await fetchJson(editingField ? `/api/catalog/metadata/fields/${editingField.id}` : "/api/catalog/metadata/fields", { method: editingField ? "PATCH" : "POST", body });
      setFieldDialogOpen(false); setEditingField(null); await loadFieldsAndPreferences(); toast.success("Metadata field saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to save metadata field"); } finally { setBusy(false); }
  };

  const archiveField = async (field: CatalogMetadataField) => {
    fieldArchiveTarget.clear();
    try { await fetchJson(`/api/catalog/metadata/fields/${field.id}/${field.archived ? "restore" : "archive"}`, { method: "POST" }); await loadFieldsAndPreferences(); } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to update field"); }
  };

  const validateSpreadsheet = async () => {
    setBusy(true);
    try {
      const created = await fetchJson<CatalogMetadataBatch>("/api/catalog/metadata/batches", { method: "POST", body: JSON.stringify({ change_summary: changeSummary, items: Object.entries(staged).map(([component_id, row]) => ({ component_id, ...row })) }) });
      setBatch(created);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to validate metadata changes"); } finally { setBusy(false); }
  };

  const uploadCsv = async (file: File) => {
    setBusy(true); setReviewOpen(true);
    try {
      const form = new FormData(); form.append("file", file); form.append("change_summary", `Import metadata from ${file.name}`);
      const response = await fetchApi("/api/catalog/metadata/import-csv/preview", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readApiError(response, "Failed to preview CSV"));
      const preview = await response.json() as CatalogMetadataBatch;
      setBatch(preview);
      if (preview.total_items === 0) {
        toast.info(`No metadata changes found. ${Number(preview.skipped_unchanged_rows || 0).toLocaleString()} unchanged rows were skipped.`);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to preview CSV"); setReviewOpen(false); } finally { setBusy(false); }
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      visibleFields.forEach((field) => params.append("field", field.key));
      const response = await fetchApi(`/api/catalog/metadata/export.csv?${params.toString()}`);
      if (!response.ok) throw new Error(await readApiError(response, "Failed to export metadata"));
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "prism-component-metadata.csv"; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to export metadata"); }
  };

  const approveFields = async () => {
    if (!batch) return; setBusy(true);
    try { setBatch(await fetchJson<CatalogMetadataBatch>(`/api/catalog/metadata/batches/${batch.id}/approve-fields`, { method: "POST" })); await loadFieldsAndPreferences(); } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to approve fields"); } finally { setBusy(false); }
  };

  const applyBatch = async (itemIds: string[]) => {
    if (!batch) return; setBusy(true);
    try {
      const queued = await fetchJson<{ job_id: string }>(`/api/catalog/metadata/batches/${batch.id}/apply`, { method: "POST", body: JSON.stringify({ item_ids: itemIds }) });
      const poll = async (): Promise<void> => {
        const job = await fetchJson<{ status: string; error_message?: string }>(`/api/catalog/metadata/jobs/${queued.job_id}`);
        if (job.status === "failed") throw new Error(job.error_message || "Metadata batch failed");
        if (job.status !== "completed") { await new Promise((resolve) => window.setTimeout(resolve, 800)); return poll(); }
      };
      await poll();
      const completed = await fetchJson<CatalogMetadataBatch>(`/api/catalog/metadata/batches/${batch.id}`);
      const appliedComponents = new Set(
        completed.items.filter((item) => itemIds.includes(item.id) && item.validation_status === "applied").map((item) => item.component_id),
      );
      setBatch(completed);
      setStaged((current) => Object.fromEntries(Object.entries(current).filter(([componentId]) => !appliedComponents.has(componentId))));
      undoStack.current = []; redoStack.current = []; setRefreshKey((value) => value + 1);
      toast.success(`${appliedComponents.size} component revisions moved to Awaiting QA`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to apply metadata batch"); } finally { setBusy(false); }
  };

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <input ref={csvInputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void uploadCsv(file); }} />
    <header className="shrink-0 border-b bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div><div className="flex items-center gap-2"><FilePenLine className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Bulk Edit Metadata</h2></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void exportCsv()}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
          {canEdit ? <Button size="sm" variant="outline" onClick={() => csvInputRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Import CSV</Button> : null}
          <Button size="sm" variant="outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh</Button>
          {canEdit ? <Button size="sm" onClick={() => { setBatch(null); setReviewOpen(true); }} disabled={!Object.keys(staged).length}><Check className="h-3.5 w-3.5" /> Review changes <Badge variant="secondary">{Object.keys(staged).length}</Badge></Button> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
        <div className="relative min-w-64 flex-1 lg:max-w-md"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input data-shortcut-search aria-label="Search components" className="h-8 pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search MPN, value, description, manufacturer…" /></div>
        <Select value={workflow} onValueChange={(value) => { setWorkflow(value); setPage(1); }}><SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All workflow stages</SelectItem>{Object.entries(WORKFLOW_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={availability} onValueChange={(value) => { setAvailability(value); setPage(1); }}><SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All CAD states</SelectItem>{Object.entries(AVAILABILITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={validation} onValueChange={(value) => { setValidation(value); setPage(1); }}><SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All validation</SelectItem>{Object.entries(VALIDATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="uncategorized">Uncategorized</SelectItem>{categories.filter((item) => item.name).map((item) => <SelectItem key={item.name} value={item.name}>{item.name} ({item.count})</SelectItem>)}</SelectContent></Select>
        <Select value={`${sortBy}:${sortDir}`} onValueChange={(value) => { const [key, direction] = value.split(":"); setSortBy(key); setSortDir(direction); setPage(1); }}><SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="updated_at:desc">Recently updated</SelectItem><SelectItem value="mpn:asc">MPN A–Z</SelectItem><SelectItem value="manufacturer:asc">Manufacturer A–Z</SelectItem><SelectItem value="category:asc">Category A–Z</SelectItem></SelectContent></Select>
        {workflow !== "all" || availability !== "all" || validation !== "all" || category !== "all" || query ? <Button size="sm" variant="ghost" onClick={() => { setWorkflow("all"); setAvailability("all"); setValidation("all"); setCategory("all"); setQuery(""); setPage(1); }}><FilterX className="h-3.5 w-3.5" /> Clear filters</Button> : null}
        <div className="ml-auto flex items-center gap-1"><Button size="icon-sm" variant="ghost" aria-label="Undo metadata edit" disabled={!undoStack.current.length} onClick={undo}><Undo2 className="h-4 w-4" /></Button><Button size="icon-sm" variant="ghost" aria-label="Redo metadata edit" disabled={!redoStack.current.length} onClick={redo}><Redo2 className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => setPanelOpen((value) => !value)}><Columns3 className="h-4 w-4" /> Fields</Button></div>
      </div>
    </header>

    <div className="flex min-h-0 flex-1">
      {panelOpen ? <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
        <div className="space-y-2 border-b p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fields</p>{isAdmin ? <Button size="icon-sm" variant="ghost" aria-label="Add custom field" onClick={() => { setEditingField(null); setFieldDialogOpen(true); }}><Plus className="h-4 w-4" /></Button> : null}</div><Input value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="Find a field" className="h-8" /><label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />Show archived fields</label></div>
        <ScrollArea className="min-h-0 flex-1"><div>
          {groupedFieldList.map((section) => <section key={section.group}><div className="sticky top-0 z-10 border-y bg-muted px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{section.group}</div><div className="divide-y">{section.items.map((field) => <div key={field.id} className={cn("group flex items-center gap-1 p-2", field.archived && "opacity-60")} draggable={!field.archived} onDragStart={(event) => event.dataTransfer.setData("text/plain", field.key)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const dragged = event.dataTransfer.getData("text/plain"); const from = preferences.order.indexOf(dragged); const to = preferences.order.indexOf(field.key); if (from >= 0 && to >= 0) setPreferences((current) => { const order = [...current.order]; order.splice(to, 0, order.splice(from, 1)[0]); return { ...current, order }; }); }}>
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <button className="p-1 text-muted-foreground hover:text-foreground" aria-label={`${preferences.visible.includes(field.key) ? "Hide" : "Show"} ${field.label}`} disabled={field.archived} onClick={() => toggleField(field.key)}>{preferences.visible.includes(field.key) && !field.archived ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{field.label}{field.unit ? ` (${field.unit})` : ""}</p><p className="truncate text-[10px] text-muted-foreground">{field.type} · {field.key}</p></div>
            {!field.archived ? <div className="hidden items-center group-hover:flex"><Button size="icon-xs" variant="ghost" aria-label={`Move ${field.label} up`} onClick={() => moveField(field.key, -1)}><ArrowUp className="h-3 w-3" /></Button><Button size="icon-xs" variant="ghost" aria-label={`Move ${field.label} down`} onClick={() => moveField(field.key, 1)}><ArrowDown className="h-3 w-3" /></Button></div> : null}
            {!field.archived && preferences.visible.includes(field.key) ? <Button size="icon-xs" variant={preferences.pinned.includes(field.key) ? "secondary" : "ghost"} aria-label={`${preferences.pinned.includes(field.key) ? "Unpin" : "Pin"} ${field.label}`} onClick={() => togglePinned(field.key)}><Pin className="h-3 w-3" /></Button> : null}
            {isAdmin && !field.built_in ? <><Button size="icon-xs" variant="ghost" aria-label={`Edit ${field.label}`} onClick={() => { setEditingField(field); setFieldDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button><Button size="icon-xs" variant="ghost" aria-label={`${field.archived ? "Restore" : "Archive"} ${field.label}`} onClick={() => fieldArchiveTarget.request(field)}>{field.archived ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}</Button></> : null}
          </div>)}</div></section>)}
        </div></ScrollArea>
        <div className="border-t p-2"><Button className="w-full" size="sm" variant="ghost" onClick={() => setPreferences((current) => ({ ...current, visible: activeFields.map((field) => field.key), order: activeFields.map((field) => field.key), widths: {}, pinned: [] }))}><RotateCcw className="h-3.5 w-3.5" /> Reset layout</Button></div>
      </aside> : null}

      <main className="flex min-w-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{loading ? "Loading components…" : `${items.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()}`}</span><span>{visibleFields.length} visible fields · {Object.keys(staged).length} staged components</span></div>
        <div ref={gridViewport.viewportRef} className={cn("min-h-0 flex-1 overflow-auto border", loading && "opacity-60")} onScroll={gridViewport.onScroll} onPaste={handleGridPaste} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "y") { event.preventDefault(); redo(); } }}>
          <div className="min-w-max" style={{ width: IDENTITY_WIDTH + visibleFields.reduce((sum, field) => sum + (preferences.widths[field.key] || DEFAULT_WIDTH), 0) }}>
            <div className="sticky top-0 z-20 grid h-10 border-b bg-muted text-xs font-medium" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="sticky left-0 z-30 flex items-center border-r bg-muted px-3">Component</div>
              {visibleFields.map((field) => <div key={field.key} className={cn("group relative flex items-center gap-1 border-r bg-muted px-2", pinnedOffsets.has(field.key) && "sticky z-20")} style={pinnedOffsets.has(field.key) ? { left: pinnedOffsets.get(field.key) } : undefined}><span className="truncate">{field.label}</span>{field.unit ? <span className="text-muted-foreground">({field.unit})</span> : null}{field.required ? <span className="text-destructive">*</span> : null}<button type="button" aria-label={`Resize ${field.label}`} className="absolute inset-y-0 right-0 w-2 cursor-col-resize opacity-0 hover:bg-primary/20 group-hover:opacity-100" onPointerDown={(event) => { event.preventDefault(); resizeColumn(field.key, event.clientX, preferences.widths[field.key] || DEFAULT_WIDTH); }} /></div>)}
            </div>
            {firstVisibleRow ? <div aria-hidden="true" style={{ height: firstVisibleRow * GRID_ROW_HEIGHT }} /> : null}
            {visibleRows.map((component, visibleRowIndex) => { const rowIndex = firstVisibleRow + visibleRowIndex; return <div key={component.id} className={cn("grid border-b last:border-b-0", staged[component.id] && "bg-primary/5")} style={{ gridTemplateColumns: gridTemplate }}>
              <div className="sticky left-0 z-10 flex h-9 min-w-0 items-center gap-2 border-r bg-background px-3"><span className="min-w-0 flex-1 truncate text-xs font-medium" title={component.name}>{component.mpn || component.name}</span><Badge variant={component.workflow_stage === "qa_review" ? "warning" : "outline"} className="shrink-0" title="Read-only workflow stage">{WORKFLOW_LABELS[component.workflow_stage]}</Badge><Badge variant="outline" className="shrink-0" title="Read-only revision">v{component.revision}</Badge></div>
              {visibleFields.map((field, columnIndex) => <MetadataCell key={field.key} value={displayValue(component, field)} field={field} readOnly={!canEdit} active={activeCell?.row === rowIndex && activeCell.column === columnIndex} rowIndex={rowIndex} columnIndex={columnIndex} pinnedOffset={pinnedOffsets.get(field.key)} onCommit={(value) => setCellValue(component, field, value)} onActivate={() => setActiveCell({ row: rowIndex, column: columnIndex })} onNavigate={(rowDelta, columnDelta) => navigateCell(rowIndex + rowDelta, columnIndex + columnDelta)} />)}
            </div>; })}
            {lastVisibleRow < items.length ? <div aria-hidden="true" style={{ height: (items.length - lastVisibleRow) * GRID_ROW_HEIGHT }} /> : null}
            {!loading && !items.length ? (
              <div className="sticky left-0 flex h-64 flex-col items-center justify-center gap-2 p-8 text-center">
                <FilePenLine className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {bulkEditIsFiltered ? "No components match the current filters" : "There is nothing to bulk edit yet"}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {bulkEditIsFiltered
                    ? "Search and filters run on the server. Clear them to edit the whole catalog."
                    : "Import components from a KiCad project or library folder, then return here to edit their metadata as a spreadsheet."}
                </p>
                {bulkEditIsFiltered ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => { setQuery(""); setCategory("all"); setShowArchived(false); setPage(1); }}
                  >
                    <FilterX className="h-3.5 w-3.5" /> Clear search and filters
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">Page {page} of {pages}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-3.5 w-3.5" /> Previous</Button><Button size="sm" variant="outline" disabled={page >= pages || loading} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next <ChevronRight className="h-3.5 w-3.5" /></Button></div></div>
      </main>
    </div>

    <FieldDefinitionDialog open={fieldDialogOpen} field={editingField} saving={busy} onOpenChange={(open) => { setFieldDialogOpen(open); if (!open) setEditingField(null); }} onSave={(draft) => void saveField(draft)} />
    <ConfirmDialog
      open={fieldArchiveTarget.open}
      onOpenChange={(open) => { if (!open) fieldArchiveTarget.clear(); }}
      title={fieldArchiveTarget.target?.archived ? "Restore field" : "Archive field"}
      description={fieldArchiveTarget.target?.archived
        ? `${fieldArchiveTarget.target.label} becomes editable again on every component. Values recorded while it was archived are unchanged.`
        : `${fieldArchiveTarget.target?.label ?? "This field"} disappears from the grid and from component metadata forms. Values already recorded on revisions are preserved, and the field can be restored later.`}
      confirmLabel={fieldArchiveTarget.target?.archived ? "Restore field" : "Hold to archive"}
      destructive={!fieldArchiveTarget.target?.archived}
      requireHold={!fieldArchiveTarget.target?.archived}
      onConfirm={() => { if (fieldArchiveTarget.target) void archiveField(fieldArchiveTarget.target); }}
    />
    <BatchReviewDialog open={reviewOpen} batch={batch} localCount={Object.keys(staged).length} summary={changeSummary} busy={busy} isAdmin={isAdmin} onSummaryChange={setChangeSummary} onOpenChange={(open) => { if (!busy) { setReviewOpen(open); if (!open) setBatch(null); } }} onValidate={() => void validateSpreadsheet()} onApproveFields={() => void approveFields()} onApply={(ids) => void applyBatch(ids)} />
  </div>;
}
