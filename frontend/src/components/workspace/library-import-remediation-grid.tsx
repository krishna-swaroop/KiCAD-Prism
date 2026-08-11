import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, Check, CheckCheck, Combine, Download, Loader2, Redo2, Save,
  Undo2, Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fetchApi, fetchJson, readApiError } from "@/lib/api";
import { PermissionHint } from "@/components/ui/permission-hint";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { cn } from "@/lib/utils";
import type {
  BulkAcceptResult, ImportProposalDraft, ProjectComponentImportProposal,
} from "@/types/catalog";
import { LibraryAssetLinkPicker } from "./library-asset-link-picker";

interface LibraryImportRemediationGridProps {
  sessionId: string;
  proposals: ProjectComponentImportProposal[];
  canWrite: boolean;
  onRefresh: () => Promise<void> | void;
}

type EditableField =
  | "value"
  | "manufacturer"
  | "manufacturer_part_number"
  | "description"
  | "datasheet"
  | "package_name";

interface ColumnDef {
  key: EditableField;
  label: string;
  width: number;
  required: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "value", label: "Value", width: 130, required: true },
  { key: "manufacturer", label: "Manufacturer", width: 150, required: true },
  { key: "manufacturer_part_number", label: "MPN", width: 170, required: true },
  { key: "description", label: "Description", width: 240, required: true },
  { key: "datasheet", label: "Datasheet", width: 220, required: true },
  { key: "package_name", label: "Package", width: 170, required: false },
];

/** Local edits keyed by proposal id. */
export type RowEdits = Record<
  string,
  { metadata: Partial<Record<EditableField, string>>; footprintAssetId?: string }
>;

function metadataValue(proposal: ProjectComponentImportProposal, field: EditableField): string {
  const source = proposal.metadata as Record<string, unknown>;
  if (field === "package_name") return String(source.footprint ?? "");
  return String(source[field] ?? "");
}

function draftOf(proposal: ProjectComponentImportProposal): ImportProposalDraft {
  return proposal.draft ?? {};
}

/** Effective value: local edit wins, then a saved draft, then the scanned metadata. */
function effectiveValue(
  proposal: ProjectComponentImportProposal,
  field: EditableField,
  edits: RowEdits
): string {
  const local = edits[proposal.id]?.metadata?.[field];
  if (local !== undefined) return local;
  const drafted = draftOf(proposal).metadata_overrides?.[field];
  if (drafted !== undefined) return drafted;
  return metadataValue(proposal, field);
}

function effectiveFootprintLink(
  proposal: ProjectComponentImportProposal,
  edits: RowEdits
): string {
  const local = edits[proposal.id]?.footprintAssetId;
  if (local !== undefined) return local;
  return draftOf(proposal).asset_links?.footprint ?? "";
}

function hasOwnAsset(proposal: ProjectComponentImportProposal, assetType: string): boolean {
  return proposal.assets.some((asset) => asset.asset_type === assetType);
}

/**
 * Blocking findings the grid cannot fix.
 *
 * Metadata and conflict findings are edited away in the cells. An
 * "<asset_type>_not_resolved" finding means the extractor could not locate that
 * asset in the project, which is precisely what linking an existing catalog asset
 * answers - so a supplied link clears it. The backend applies the same rule when
 * accepting, and the two must agree or a row would read as ready and then fail.
 */
function unresolvableFindings(
  proposal: ProjectComponentImportProposal,
  linkedAssetTypes: Set<string>
) {
  return proposal.findings.filter(
    (finding) =>
      finding.severity === "error" &&
      !finding.code.startsWith("missing_metadata_") &&
      !finding.code.startsWith("conflicting_") &&
      !linkedAssetTypes.has(finding.code.replace(/_not_resolved$/, ""))
  );
}

/**
 * Identity a row will import as.
 *
 * Scan-time dedupe only merges by MPN when the KiCad symbol already carried
 * manufacturer and MPN fields. When those are supplied during remediation instead,
 * the proposals stay separate even though the backend will resolve them to a single
 * catalog component. Grouping here shows the reviewer what will actually be created
 * and means the same part is edited once rather than once per reference.
 */
export function groupKeyFor(proposal: ProjectComponentImportProposal, edits: RowEdits): string {
  const manufacturer = effectiveValue(proposal, "manufacturer", edits).trim().toLowerCase();
  const mpn = effectiveValue(proposal, "manufacturer_part_number", edits).trim().toLowerCase();
  if (manufacturer && mpn) return `mpn:${manufacturer}\u0000${mpn}`;
  return `id:${proposal.id}`;
}

export interface ProposalGroup {
  key: string;
  /** Values are read from this member; edits are written to every member. */
  representative: ProjectComponentImportProposal;
  members: ProjectComponentImportProposal[];
  references: string[];
}

export function groupProposals(
  proposals: ProjectComponentImportProposal[],
  edits: RowEdits,
  enabled: boolean
): ProposalGroup[] {
  const groups = new Map<string, ProjectComponentImportProposal[]>();
  for (const proposal of proposals) {
    const key = enabled ? groupKeyFor(proposal, edits) : `id:${proposal.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(proposal);
    else groups.set(key, [proposal]);
  }

  return [...groups.entries()].map(([key, members]) => {
    const references = new Set<string>();
    for (const member of members) {
      const declared = (member.metadata as { references?: unknown }).references;
      if (Array.isArray(declared) && declared.length > 0) {
        for (const reference of declared) {
          const text = String(reference || "").trim();
          if (text) references.add(text);
        }
      } else if (member.reference) {
        references.add(member.reference);
      }
    }
    return {
      key,
      representative: members[0],
      members,
      references: [...references].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      ),
    };
  });
}

/** Every distinct problem across a group, since all its members get imported. */
export function groupProblems(group: ProposalGroup, edits: RowEdits): string[] {
  const problems = new Set<string>();
  for (const member of group.members) {
    for (const problem of rowProblems(member, edits)) problems.add(problem);
  }
  return [...problems];
}

export function rowProblems(
  proposal: ProjectComponentImportProposal,
  edits: RowEdits
): string[] {
  const problems: string[] = [];
  for (const column of COLUMNS) {
    if (column.required && !effectiveValue(proposal, column.key, edits).trim()) {
      problems.push(`${column.label} is required`);
    }
  }
  const datasheet = effectiveValue(proposal, "datasheet", edits).trim();
  if (datasheet && !/^https?:\/\//i.test(datasheet)) problems.push("Datasheet must be an HTTP(S) URL");

  const footprintLink = effectiveFootprintLink(proposal, edits);
  const linkedAssetTypes = new Set(footprintLink ? ["footprint"] : []);

  if (!hasOwnAsset(proposal, "symbol")) problems.push("No symbol was extracted");
  if (!hasOwnAsset(proposal, "footprint") && !footprintLink) {
    problems.push("Link an existing footprint or re-import with one");
  }
  problems.push(
    ...unresolvableFindings(proposal, linkedAssetTypes).map((finding) => finding.message)
  );
  return problems;
}

export function LibraryImportRemediationGrid({
  sessionId,
  proposals,
  canWrite,
  onRefresh,
}: LibraryImportRemediationGridProps) {
  const [edits, setEdits] = useState<RowEdits>({});
  // Every cell edit, fill-down, and link change pushes the previous state here so a
  // mis-aimed fill-down across 300 rows is one keystroke to undo.
  const [undoStack, setUndoStack] = useState<RowEdits[]>([]);
  const [redoStack, setRedoStack] = useState<RowEdits[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  // One row per component that will be created, not one per placed reference.
  const [groupByMpn, setGroupByMpn] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const candidates = useMemo(
    () => proposals.filter((proposal) => proposal.status === "candidate"),
    [proposals]
  );

  const groups = useMemo(
    () => groupProposals(candidates, edits, groupByMpn),
    [candidates, edits, groupByMpn]
  );

  const problemsByGroup = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of groups) map.set(group.key, groupProblems(group, edits));
    return map;
  }, [edits, groups]);

  const visibleRows = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return groups.filter((group) => {
      if (onlyProblems && (problemsByGroup.get(group.key)?.length ?? 0) === 0) return false;
      if (!term) return true;
      const haystack = [
        ...group.references,
        ...COLUMNS.map((column) => effectiveValue(group.representative, column.key, edits)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [edits, filter, groups, onlyProblems, problemsByGroup]);

  const readyRows = useMemo(
    () => groups.filter((group) => (problemsByGroup.get(group.key)?.length ?? 0) === 0),
    [groups, problemsByGroup]
  );

  const mergedGroupCount = useMemo(
    () => groups.filter((group) => group.members.length > 1).length,
    [groups]
  );

  const dirtyCount = Object.keys(edits).length;

  useEffect(() => {
    // Group keys change when rows merge or a refresh removes accepted rows, so drop
    // selections that no longer name a live row.
    setSelected((current) => {
      const live = new Set(groups.map((group) => group.key));
      const next = new Set([...current].filter((key) => live.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  /** Apply an edit through the history so it can be undone. */
  const commitEdits = useCallback((update: (current: RowEdits) => RowEdits) => {
    setEdits((current) => {
      const next = update(current);
      if (next === current) return current;
      setUndoStack((stack) => [...stack.slice(-49), current]);
      setRedoStack([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setEdits((current) => {
        setRedoStack((redo) => [...redo, current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setEdits((current) => {
        setUndoStack((undoEntries) => [...undoEntries, current]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  /** A grouped row stands for one component, so an edit applies to every member. */
  const setCell = useCallback(
    (group: ProposalGroup, field: EditableField, value: string) => {
      commitEdits((current) => {
        const next = { ...current };
        for (const member of group.members) {
          next[member.id] = {
            ...next[member.id],
            metadata: { ...next[member.id]?.metadata, [field]: value },
          };
        }
        return next;
      });
    },
    [commitEdits]
  );

  const setFootprintLink = useCallback(
    (group: ProposalGroup, assetId: string) => {
      commitEdits((current) => {
        const next = { ...current };
        for (const member of group.members) {
          next[member.id] = { ...next[member.id], footprintAssetId: assetId };
        }
        return next;
      });
    },
    [commitEdits]
  );

  /** Copy the focused row's value down every selected row - the spreadsheet staple. */
  const fillDown = useCallback(
    (source: ProposalGroup, field: EditableField) => {
      const value = effectiveValue(source.representative, field, edits);
      const targetGroups =
        selected.size > 0 ? visibleRows.filter((group) => selected.has(group.key)) : visibleRows;
      commitEdits((current) => {
        const next = { ...current };
        for (const group of targetGroups) {
          for (const member of group.members) {
            next[member.id] = {
              ...next[member.id],
              metadata: { ...next[member.id]?.metadata, [field]: value },
            };
          }
        }
        return next;
      });
      toast.success(`Filled ${field.replace(/_/g, " ")} into ${targetGroups.length} rows`, {
        description: "Press ⌘Z to undo",
      });
    },
    [commitEdits, edits, selected, visibleRows]
  );

  const buildDrafts = useCallback(() => {
    const drafts: Record<string, ImportProposalDraft> = {};
    for (const [proposalId, edit] of Object.entries(edits)) {
      const draft: ImportProposalDraft = {};
      if (edit.metadata && Object.keys(edit.metadata).length > 0) {
        draft.metadata_overrides = edit.metadata as Record<string, string>;
      }
      if (edit.footprintAssetId !== undefined) {
        draft.asset_links = edit.footprintAssetId ? { footprint: edit.footprintAssetId } : {};
      }
      drafts[proposalId] = draft;
    }
    return drafts;
  }, [edits]);

  const saveDrafts = useCallback(async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      await fetchJson<{ saved: number }>(
        `/api/catalog/import-sessions/${sessionId}/proposals/drafts`,
        { method: "PUT", body: JSON.stringify({ drafts: buildDrafts() }) },
        "Failed to save import edits"
      );
      setEdits({});
      setUndoStack([]);
      setRedoStack([]);
      // Saved edits are no longer pending, so a stale selection would leave the
      // "Import selected" count disagreeing with the checkboxes.
      setSelected(new Set());
      await onRefresh();
      toast.success("Import edits saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save import edits");
    } finally {
      setSaving(false);
    }
  }, [buildDrafts, dirtyCount, onRefresh, sessionId]);

  const acceptRows = useCallback(
    async (rows: ProposalGroup[]) => {
      if (rows.length === 0) return;
      setAccepting(true);
      try {
        // Every member is submitted. They carry identical metadata, so the backend
        // resolves them to one component and records each reference as a usage
        // rather than creating a duplicate or an extra revision.
        const items = rows.flatMap((group) => group.members).map((proposal) => {
          const metadata_overrides: Record<string, string> = {};
          for (const column of COLUMNS) {
            metadata_overrides[column.key] = effectiveValue(proposal, column.key, edits);
          }
          const footprintAssetId = effectiveFootprintLink(proposal, edits);
          return {
            proposal_id: proposal.id,
            metadata_overrides,
            asset_links: footprintAssetId ? { footprint: footprintAssetId } : {},
            change_summary: `Import ${proposal.reference || "component"} from Prism project`,
          };
        });

        const result = await fetchJson<BulkAcceptResult>(
          `/api/catalog/import-sessions/${sessionId}/proposals/bulk-accept`,
          { method: "POST", body: JSON.stringify({ items }) },
          "Failed to accept import rows"
        );

        setEdits((current) => {
          const next = { ...current };
          for (const entry of result.results) {
            if (entry.status === "accepted") delete next[entry.proposal_id];
          }
          return next;
        });
        setSelected(new Set());
        await onRefresh();

        // result.accepted counts proposals; a grouped row submits one per reference
        // but yields a single component, so report distinct components instead.
        const componentCount = new Set(
          result.results
            .filter((entry) => entry.status === "accepted" && entry.component_id)
            .map((entry) => entry.component_id)
        ).size;

        if (result.failed === 0) {
          const references = result.accepted;
          toast.success(
            `Imported ${componentCount} component${componentCount === 1 ? "" : "s"}`,
            references > componentCount
              ? { description: `${references} references linked to them` }
              : undefined
          );
        } else {
          const firstError = result.results.find((entry) => entry.status === "failed")?.error;
          toast.warning(
            `Imported ${componentCount}, ${result.failed} row${result.failed === 1 ? "" : "s"} failed. ${firstError ?? ""}`.trim()
          );
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to accept import rows");
      } finally {
        setAccepting(false);
      }
    },
    [edits, onRefresh, sessionId]
  );

  const exportCsv = useCallback(() => {
    window.location.href = `/api/catalog/import-sessions/${sessionId}/proposals.csv`;
  }, [sessionId]);

  const importCsv = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setSaving(true);
      try {
        const form = new FormData();
        form.append("file", file, file.name);
        const response = await fetchApi(
          `/api/catalog/import-sessions/${sessionId}/proposals.csv`,
          { method: "POST", body: form }
        );
        if (!response.ok) throw new Error(await readApiError(response, "Failed to import CSV"));
        const result = (await response.json()) as { saved: number; skipped_unknown_rows: number };
        setEdits({});
        await onRefresh();
        toast.success(
          `Applied ${result.saved} rows` +
            (result.skipped_unknown_rows ? `, skipped ${result.skipped_unknown_rows} unknown` : "")
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to import CSV");
      } finally {
        setSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onRefresh, sessionId]
  );

  // Undo, redo, and save stay live while a cell is focused — the whole point is
  // to correct a value you just typed — but stand down while a dialog such as
  // the command palette is open.
  useHotkeys(
    [
      { combo: "mod+z", handler: () => undo(), allowInInputs: true },
      { combo: "mod+shift+z", handler: () => redo(), allowInInputs: true },
      { combo: "mod+y", handler: () => redo(), allowInInputs: true },
      { combo: "mod+s", handler: () => void saveDrafts(), allowInInputs: true },
    ],
    { enabled: canWrite },
  );

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(visibleRows.map((row) => row.key)) : new Set());
  };

  const selectedReady = groups.filter(
    (group) => selected.has(group.key) && (problemsByGroup.get(group.key)?.length ?? 0) === 0
  );

  if (candidates.length === 0) {
    return (
      <p className="border p-6 text-center text-sm text-muted-foreground">
        No components are awaiting review in this session.
      </p>
    );
  }

  // Status leads the row so a scan down the left edge shows what still needs work,
  // which matters most when the "needs attention" filter is off.
  const gridTemplate = `36px 40px 150px ${COLUMNS.map((column) => `${column.width}px`).join(" ")} 200px`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter rows"
          className="h-8 w-56 text-xs"
        />
        <Button
          variant={onlyProblems ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setOnlyProblems((current) => !current)}
        >
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
          Needs attention ({groups.length - readyRows.length})
        </Button>
        <Button
          variant={groupByMpn ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          title="Show one row per catalog component instead of one per placed reference"
          onClick={() => setGroupByMpn((current) => !current)}
        >
          <Combine className="mr-1.5 h-3.5 w-3.5" />
          Group by MPN
          {groupByMpn && mergedGroupCount > 0 ? ` (${mergedGroupCount} merged)` : ""}
        </Button>

        <PermissionHint
          blocked={!canWrite}
          action="edit or accept import proposals"
          allowedRoles={["component_designer", "admin"]}
          className="ml-auto"
        >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            title="Undo (⌘Z)"
            disabled={!canWrite || undoStack.length === 0}
            onClick={undo}
          >
            <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            title="Redo (⇧⌘Z)"
            disabled={!canWrite || redoStack.length === 0}
            onClick={redo}
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span className="sr-only">Redo</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void importCsv(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!canWrite || saving}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!canWrite || saving || dirtyCount === 0}
            onClick={() => void saveDrafts()}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save edits{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!canWrite || accepting || selectedReady.length === 0}
            onClick={() => void acceptRows(selectedReady)}
          >
            {accepting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            )}
            Import selected ({selectedReady.length})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            disabled={!canWrite || accepting || readyRows.length === 0}
            onClick={() => void acceptRows(readyRows)}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Import all ready ({readyRows.length})
          </Button>
        </div>
        </PermissionHint>
      </div>

      <div className="overflow-x-auto border">
        <div className="min-w-max">
          <div
            className="sticky top-0 z-20 grid items-center border-b bg-muted/60 text-xs font-medium"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex h-9 items-center justify-center border-r">
              <Checkbox
                checked={visibleRows.length > 0 && selected.size === visibleRows.length}
                onCheckedChange={(checked) => toggleAll(checked === true)}
                aria-label="Select all visible rows"
              />
            </div>
            <div className="flex h-9 items-center justify-center border-r" title="Row status">
              <span className="sr-only">Status</span>
            </div>
            <div className="flex h-9 items-center border-r px-2">References</div>
            {COLUMNS.map((column) => (
              <div key={column.key} className="flex h-9 items-center gap-1 border-r px-2">
                <span className="truncate">{column.label}</span>
                {column.required ? <span className="text-destructive">*</span> : null}
              </div>
            ))}
            <div className="flex h-9 items-center px-2">Footprint</div>
          </div>

          {visibleRows.map((group) => {
            const proposal = group.representative;
            const problems = problemsByGroup.get(group.key) ?? [];
            const linkedFootprint = effectiveFootprintLink(proposal, edits);
            const isSelected = selected.has(group.key);
            const referenceLabel = group.references.join(", ") || "—";
            return (
              <div
                key={group.key}
                className={cn(
                  "grid items-center border-b text-xs last:border-b-0",
                  isSelected && "bg-primary/5"
                )}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="flex h-9 items-center justify-center border-r">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(group.key);
                        else next.delete(group.key);
                        return next;
                      })
                    }
                    aria-label={`Select ${referenceLabel}`}
                  />
                </div>
                <div className="flex h-9 items-center justify-center border-r">
                  {problems.length === 0 ? (
                    <Check className="h-3.5 w-3.5 text-success" aria-label="Ready to import" />
                  ) : (
                    <span title={problems.join("\n")} className="cursor-help">
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-destructive"
                        aria-label={`Needs attention: ${problems.join(", ")}`}
                      />
                    </span>
                  )}
                </div>
                <div
                  className="flex h-9 items-center gap-1.5 border-r px-2 font-medium"
                  title={
                    group.references.length > 1
                      ? `${group.references.length} references import as one component:\n${referenceLabel}`
                      : referenceLabel
                  }
                >
                  <span className="truncate">{referenceLabel}</span>
                  {group.references.length > 1 ? (
                    <Badge variant="outline" className="shrink-0 px-1 text-[10px] font-normal">
                      ×{group.references.length}
                    </Badge>
                  ) : null}
                </div>

                {COLUMNS.map((column) => {
                  const value = effectiveValue(proposal, column.key, edits);
                  const invalid = column.required && !value.trim();
                  return (
                    <div
                      key={column.key}
                      className={cn("group relative h-9 border-r p-0.5", invalid && "bg-destructive/10")}
                    >
                      <input
                        className="h-full w-full bg-transparent px-1.5 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring disabled:cursor-default"
                        value={value}
                        disabled={!canWrite}
                        aria-invalid={invalid}
                        aria-label={`${column.label} for ${referenceLabel}`}
                        onChange={(event) => setCell(group, column.key, event.target.value)}
                      />
                      {canWrite ? (
                        <button
                          type="button"
                          title="Fill this value down into selected rows"
                          onClick={() => fillDown(group, column.key)}
                          className="absolute right-0.5 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-focus-within:block"
                        >
                          <ArrowDownToLine className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}

                <LibraryAssetLinkPicker
                  assetType="footprint"
                  value={linkedFootprint}
                  disabled={!canWrite}
                  placeholder={
                    group.members.every((member) => hasOwnAsset(member, "footprint"))
                      ? "Importing own footprint"
                      : "Link a footprint"
                  }
                  suggestQuery={effectiveValue(proposal, "package_name", edits)}
                  onChange={(assetId) => setFootprintLink(group, assetId)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant="outline">{visibleRows.length} shown</Badge>
        <Badge variant="outline">{readyRows.length} ready</Badge>
        <Badge variant="outline">{groups.length - readyRows.length} need attention</Badge>
        <span>
          {groupByMpn
            ? "Each row is one catalog component. Linking a footprint reuses an existing asset instead of importing a duplicate."
            : "Showing one row per placed reference. Linking a footprint reuses an existing asset instead of importing a duplicate."}
        </span>
      </div>
    </div>
  );
}
