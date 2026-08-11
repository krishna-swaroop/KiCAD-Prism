import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, CircuitBoard, FileCode2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectComponentImportProposal } from "@/types/catalog";

export interface ProposalRemediation {
  metadata_overrides: Record<string, string>;
  asset_selections: Record<string, string[]>;
  change_summary: string;
}

interface LibraryImportRemediationDialogProps {
  proposal: ProjectComponentImportProposal | null;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: (remediation: ProposalRemediation) => void;
}

const assetIcon = (assetType: string) => assetType === "symbol" ? FileCode2 : assetType === "footprint" ? CircuitBoard : Box;

export function LibraryImportRemediationDialog({ proposal, open, submitting, onOpenChange, onAccept }: LibraryImportRemediationDialogProps) {
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [changeSummary, setChangeSummary] = useState("Import component from Prism project");

  const assetsByType = useMemo(() => {
    const grouped: Record<string, ProjectComponentImportProposal["assets"]> = {};
    for (const asset of proposal?.assets || []) (grouped[asset.asset_type] ||= []).push(asset);
    return grouped;
  }, [proposal]);

  useEffect(() => {
    if (!proposal) return;
    const source = proposal.metadata as Record<string, unknown>;
    setMetadata({
      value: String(source.value || ""),
      description: String(source.description || ""),
      datasheet: String(source.datasheet || ""),
      manufacturer: String(source.manufacturer || ""),
      manufacturer_part_number: String(source.manufacturer_part_number || ""),
      package_name: String(source.footprint || ""),
    });
    const defaults: Record<string, string[]> = {};
    for (const [assetType, assets] of Object.entries(assetsByType)) {
      defaults[assetType] = assetType === "symbol" || assetType === "footprint"
        ? assets.slice(0, 1).map((asset) => asset.sha256)
        : assets.map((asset) => asset.sha256);
    }
    setSelections(defaults);
    setChangeSummary(`Import ${proposal.reference || "component"} from Prism project`);
  }, [assetsByType, proposal]);

  const requiredMetadataComplete = ["value", "description", "datasheet", "manufacturer", "manufacturer_part_number"]
    .every((field) => metadata[field]?.trim());
  const requiredAssetsComplete = ["symbol", "footprint"].every((assetType) => selections[assetType]?.length === 1);
  const unresolvable = (proposal?.findings || []).filter((finding) =>
    finding.severity === "error"
    && !finding.code.startsWith("missing_metadata_")
    && !finding.code.startsWith("conflicting_")
  );

  const setField = (field: string, value: string) => setMetadata((current) => ({ ...current, [field]: value }));
  const selectPrimary = (assetType: string, sha256: string) => setSelections((current) => ({ ...current, [assetType]: [sha256] }));
  const toggleOptional = (assetType: string, sha256: string, checked: boolean) => setSelections((current) => {
    const selected = new Set(current[assetType] || []);
    if (checked) selected.add(sha256); else selected.delete(sha256);
    return { ...current, [assetType]: [...selected] };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review project component</DialogTitle>
          <DialogDescription>Complete required metadata and choose the immutable assets that will enter the draft revision.</DialogDescription>
        </DialogHeader>

        {proposal && <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="import-value">Value</Label><Input id="import-value" value={metadata.value || ""} onChange={(event) => setField("value", event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="import-manufacturer">Manufacturer</Label><Input id="import-manufacturer" value={metadata.manufacturer || ""} onChange={(event) => setField("manufacturer", event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="import-mpn">Manufacturer part number</Label><Input id="import-mpn" value={metadata.manufacturer_part_number || ""} onChange={(event) => setField("manufacturer_part_number", event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="import-datasheet">Datasheet</Label><Input id="import-datasheet" value={metadata.datasheet || ""} onChange={(event) => setField("datasheet", event.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="import-description">Description</Label><Textarea id="import-description" value={metadata.description || ""} onChange={(event) => setField("description", event.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="import-footprint">Footprint mapping</Label><Input id="import-footprint" value={metadata.package_name || ""} onChange={(event) => setField("package_name", event.target.value)} /></div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Revision assets</h3>
            <div className="mt-2 space-y-3">
              {Object.entries(assetsByType).map(([assetType, assets]) => {
                const Icon = assetIcon(assetType);
                const primary = assetType === "symbol" || assetType === "footprint";
                return <div key={assetType} className="border p-3">
                  <div className="mb-2 flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium capitalize">{assetType}</span><span className="text-xs text-muted-foreground">{primary ? "Choose one" : "Include any number"}</span></div>
                  <div className="space-y-2">{assets.map((asset) => {
                    const checked = selections[assetType]?.includes(asset.sha256) || false;
                    return <label key={`${asset.sha256}-${asset.filename}`} className="flex cursor-pointer items-start gap-3 border bg-muted/20 p-2.5">
                      {primary ? <input type="radio" name={`asset-${assetType}`} checked={checked} onChange={() => selectPrimary(assetType, asset.sha256)} className="mt-1" /> : <Checkbox checked={checked} onCheckedChange={(value) => toggleOptional(assetType, asset.sha256, value === true)} className="mt-0.5" />}
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{asset.filename}</span><span className="block truncate font-mono text-xs text-muted-foreground">{asset.sha256.slice(0, 16)} · {asset.source_path}</span></span>
                    </label>;
                  })}</div>
                </div>;
              })}
              {Object.keys(assetsByType).length === 0 && <p className="border p-3 text-sm text-muted-foreground">No assets were extracted.</p>}
            </div>
          </section>

          {proposal.findings.length > 0 && <section><h3 className="text-sm font-semibold">Import findings</h3><div className="mt-2 space-y-2">{proposal.findings.map((finding, index) => <div key={`${finding.code}-${index}`} className="flex gap-2 border p-2.5 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{finding.message}</span></div>)}</div></section>}
          <div className="space-y-1.5"><Label htmlFor="import-summary">Revision summary</Label><Input id="import-summary" value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} /></div>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={() => onAccept({ metadata_overrides: metadata, asset_selections: selections, change_summary: changeSummary })}
            disabled={submitting || !requiredMetadataComplete || !requiredAssetsComplete || unresolvable.length > 0 || !changeSummary.trim()}
          >
            {submitting ? "Creating revision…" : "Accept as draft revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
