import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, CheckCircle2, CircuitBoard, FileCode2, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LibraryFolderDiscovery } from "@/types/catalog";

interface LibraryFolderDiscoveryDialogProps {
  discovery: LibraryFolderDiscovery | null;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (componentIds: string[], footprintResolutions: Record<string, string>) => void;
  onAttachFootprint: (componentId: string, file: File) => Promise<void>;
  onAttachModel: (componentId: string, file: File) => Promise<void>;
}

export function LibraryFolderDiscoveryDialog({ discovery, open, submitting, onOpenChange, onApprove, onAttachFootprint, onAttachModel }: LibraryFolderDiscoveryDialogProps) {
  const importableIds = useMemo(() => new Set(
    (discovery?.components || [])
      .filter((component) => component.footprint.status === "resolved" && !component.existing_component)
      .map((component) => component.id)
  ), [discovery]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [footprintChoices, setFootprintChoices] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [attachingId, setAttachingId] = useState("");

  useEffect(() => {
    setSelected(new Set(importableIds));
    setFootprintChoices({});
  }, [importableIds]);

  const toggle = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });
  const needsAttention = discovery?.components.filter((component) => component.footprint.status !== "resolved").length || 0;
  const visibleComponents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (discovery?.components || []).filter((component) => {
      const matchesQuery = !normalizedQuery || [
        component.symbol_name,
        component.metadata.value,
        component.metadata.manufacturer,
        component.metadata.manufacturer_part_number,
        component.footprint_reference,
      ].join(" ").toLocaleLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "resolved" && component.footprint.status === "resolved" && !component.existing_component)
        || (statusFilter === "attention" && component.footprint.status !== "resolved")
        || (statusFilter === "existing" && Boolean(component.existing_component));
      return matchesQuery && matchesStatus;
    });
  }, [discovery, query, statusFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Review discovered components</DialogTitle>
          <DialogDescription>
            Prism resolved the lightweight KiCad sources first. Approving this list captures only assets referenced by the selected components.
          </DialogDescription>
        </DialogHeader>

        {discovery && <>
          <div className="flex flex-wrap items-center gap-2 border-y py-3 text-sm">
            <Badge variant="outline">{discovery.components.length} identified</Badge>
            <Badge variant="success">{importableIds.size} resolved</Badge>
            {needsAttention > 0 && <Badge variant="warning">{needsAttention} need attention</Badge>}
            {discovery.existing_component_count > 0 && <Badge variant="secondary">{discovery.existing_component_count} already exist</Badge>}
            <span className="ml-auto text-muted-foreground">{discovery.inventory_file_count} files inventoried · {discovery.discovery_file_count} sources parsed</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by symbol, MPN, manufacturer, or footprint" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All components</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="attention">Needs attention</SelectItem>
                <SelectItem value="existing">Already exists</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="min-h-0 flex-1 pr-3">
            <div className="space-y-2 py-3">
              {visibleComponents.map((component) => {
                const canImport = !component.existing_component && (component.footprint.status === "resolved" || Boolean(footprintChoices[component.id]));
                const warnings = component.findings.filter((finding) => finding.severity === "warning").length;
                return <article key={component.id} className="border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(component.id)}
                      disabled={!canImport || submitting}
                      onCheckedChange={(value) => toggle(component.id, value === true)}
                      aria-label={`Import ${component.symbol_name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-mono text-sm font-semibold">{component.symbol_name}</h3>
                        {canImport
                          ? <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />Resolved</Badge>
                          : component.existing_component
                            ? <Badge variant="secondary">Existing · v{component.existing_component.version}</Badge>
                            : <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />{component.footprint.status === "suggested" ? "Suggested match" : component.footprint.status}</Badge>}
                        {warnings > 0 && <Badge variant="outline">{warnings} metadata warning{warnings === 1 ? "" : "s"}</Badge>}
                      </div>
                      {(component.footprint.status === "ambiguous" || component.footprint.status === "suggested") && component.footprint.candidates.length > 0 && <div className="mt-3 max-w-xl space-y-1.5">
                        <p className="text-xs font-medium">{component.footprint.status === "suggested" ? "Confirm the suggested footprint" : "Choose the intended footprint"}</p>
                        <Select
                          value={footprintChoices[component.id] || ""}
                          onValueChange={(value) => {
                            setFootprintChoices((current) => ({ ...current, [component.id]: value }));
                            toggle(component.id, true);
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder={component.footprint.status === "suggested" ? "Confirm suggested footprint" : "Resolve footprint ambiguity"} /></SelectTrigger>
                          <SelectContent>{component.footprint.candidates.map((candidate) => <SelectItem key={candidate.relative_path} value={candidate.relative_path}>{candidate.relative_path}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>}
                      <p className="mt-1 text-sm">{component.metadata.value || component.symbol_name}{component.metadata.manufacturer_part_number ? ` · ${component.metadata.manufacturer_part_number}` : ""}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{component.metadata.manufacturer || "Manufacturer not provided"}</p>
                      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                        <div className="flex min-w-0 items-start gap-2 border bg-muted/20 p-2"><FileCode2 className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><span className="block font-medium">Symbol</span><span className="block truncate text-muted-foreground">{component.symbol.relative_path}</span></span></div>
                        <div className="flex min-w-0 items-start gap-2 border bg-muted/20 p-2"><CircuitBoard className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><span className="block font-medium">Footprint</span><span className="block truncate text-muted-foreground">{footprintChoices[component.id] || component.footprint.selected?.relative_path || component.footprint_reference || "Not resolved"}</span></span></div>
                        <div className="flex min-w-0 items-start gap-2 border bg-muted/20 p-2"><Box className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><span className="block font-medium">3D models</span><span className="block truncate text-muted-foreground">{component.models.length === 0 ? "None referenced" : component.models.map((model) => model.candidates[0]?.relative_path || model.reference).join(", ")}</span></span></div>
                      </div>
                      {canImport && component.models.some((model) => model.status === "missing") && <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-warning">A footprint model reference could not be found in the selected directory.</p>
                        <Button asChild size="sm" variant="outline" disabled={submitting || attachingId === `${component.id}:model`}>
                          <label className="cursor-pointer">
                            <Upload className="mr-1.5 h-3.5 w-3.5" />{attachingId === `${component.id}:model` ? "Attaching…" : "Upload STEP / WRL"}
                            <input
                              type="file"
                              accept=".step,.stp,.wrl"
                              className="hidden"
                              disabled={submitting || attachingId === `${component.id}:model`}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (!file) return;
                                setAttachingId(`${component.id}:model`);
                                void onAttachModel(component.id, file)
                                  .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to attach 3D model"))
                                  .finally(() => setAttachingId(""));
                              }}
                            />
                          </label>
                        </Button>
                      </div>}
                      {component.existing_component
                        ? <p className="mt-2 text-xs text-muted-foreground">Matched {component.existing_component.manufacturer} · {component.existing_component.manufacturer_part_number}. It will not be processed again.</p>
                        : !canImport && <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-warning">This component is excluded until its footprint relationship is resolved.</p>
                            <Button asChild size="sm" variant="outline" disabled={submitting || attachingId === component.id}>
                              <label className="cursor-pointer">
                                <Upload className="mr-1.5 h-3.5 w-3.5" />{attachingId === component.id ? "Attaching…" : "Upload .kicad_mod"}
                                <input
                                  type="file"
                                  accept=".kicad_mod"
                                  className="hidden"
                                  disabled={submitting || attachingId === component.id}
                                  onChange={(event) => {
                                    const file = event.currentTarget.files?.[0];
                                    event.currentTarget.value = "";
                                    if (!file) return;
                                    setAttachingId(component.id);
                                    void onAttachFootprint(component.id, file)
                                      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to attach footprint"))
                                      .finally(() => setAttachingId(""));
                                  }}
                                />
                              </label>
                            </Button>
                          </div>}
                    </div>
                  </div>
                </article>;
              })}
              {visibleComponents.length === 0 && <p className="border p-6 text-center text-sm text-muted-foreground">No discovered components match these filters.</p>}
            </div>
          </ScrollArea>
        </>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => onApprove([...selected], footprintChoices)} disabled={submitting || selected.size === 0}>
            {submitting ? "Capturing referenced assets…" : `Approve ${selected.size} component${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
