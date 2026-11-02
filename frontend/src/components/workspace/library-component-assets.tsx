import { useState } from "react";
import { AlertTriangle, Download, Eye, Layers3, Loader2, Plus, RotateCcw, Save, ShieldCheck, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CatalogAsset, CatalogComponent, CatalogRepresentation } from "@/types/catalog";
import { createRepresentation, deleteRepresentation, updateRepresentation } from "./catalog-client";
import type { AssetType } from "./library-component-asset-dialog";
import { EmptyState, PanelCard, formatBytes, shortHash } from "./library-component-chrome";
import { LibraryPreviewPair } from "./library-preview-inspector";
import { resolveLibraryPreviewPairAssetIds } from "./library-preview-pair";

/**
 * The component workspace's Assets tab: the symbol–footprint representations,
 * the revision's files grouped by type, and one preview of the representation
 * picked in the list (the default one until another is picked).
 */

const ASSET_GROUPS: ReadonlyArray<{ type: AssetType; label: string; required: boolean }> = [
  { type: "symbol", label: "Symbols", required: true },
  { type: "footprint", label: "Footprints", required: true },
  { type: "3dmodel", label: "3D models", required: false },
  { type: "spice", label: "SPICE models", required: false },
];

export function isProvisionalPart(component: CatalogComponent): boolean {
  return component.identity_kind === "provisional_ipn";
}

/** Shown wherever a provisional part could be completed, released or placed. */
export function ProvisionalNotice() {
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle title="Add the real manufacturer part number before approval, release, inventory sync or placement">Provisional part: needs a real MPN</AlertTitle>
    </Alert>
  );
}

function RepresentationRow({
  component,
  representation,
  canMutate,
  previewed,
  onPreview,
  onChanged,
}: {
  component: CatalogComponent;
  representation: CatalogRepresentation;
  canMutate: boolean;
  previewed: boolean;
  onPreview: () => void;
  onChanged: () => void;
}) {
  const symbols = component.assets.filter((asset) => asset.asset_type === "symbol");
  const footprints = component.assets.filter((asset) => asset.asset_type === "footprint");
  // An edit buffer, not a mirror: it is meant to diverge from the prop as soon
  // as the field is typed in, so it cannot be computed inline. The row is keyed
  // on representation.id, so a different representation gets a different form.
  // react-doctor-disable-next-line react-doctor/no-derived-useState
  const [label, setLabel] = useState(representation.label);
  const [symbolId, setSymbolId] = useState(representation.symbol?.id || "");
  const [footprintId, setFootprintId] = useState(representation.footprint?.id || "");
  const [order, setOrder] = useState(String(representation.display_order));
  const [saving, setSaving] = useState(false);
  const dirty =
    label !== representation.label ||
    symbolId !== (representation.symbol?.id || "") ||
    footprintId !== (representation.footprint?.id || "") ||
    order !== String(representation.display_order);

  const update = async (makeDefault = representation.is_default) => {
    setSaving(true);
    try {
      await updateRepresentation(component.id, representation.id, {
        label,
        symbol_asset_id: symbolId,
        footprint_asset_id: footprintId,
        display_order: Number(order) || 0,
        is_default: makeDefault,
      }, component.revision_id);
      toast.success(makeDefault && !representation.is_default ? "Default updated" : "Representation saved");
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteRepresentation(component.id, representation.id, component.revision_id);
      toast.success("Representation removed");
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const busy = !canMutate || saving;
  const symbolName = symbols.find((asset) => asset.id === symbolId)?.target_name;
  const footprintName = footprints.find((asset) => asset.id === footprintId)?.target_name;
  return (
    <div className={cn("flex h-11 min-w-[640px] items-center gap-1.5 border-b px-2 last:border-b-0", previewed && "bg-muted/50 shadow-[inset_2px_0_0_hsl(var(--primary))]")}>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={representation.is_default ? "Default representation" : `Make ${representation.label} the default`}
        title={representation.is_default ? "Default" : "Make default"}
        aria-pressed={representation.is_default}
        disabled={representation.is_default || busy || !symbolId || !footprintId}
        className="disabled:opacity-100"
        onClick={() => void update(true)}
      >
        <Star className={cn("h-3.5 w-3.5", representation.is_default ? "fill-primary text-primary" : "text-muted-foreground")} />
      </Button>
      <Input aria-label="Representation label" title={label} className="h-8 w-40 shrink-0 text-xs" value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
      <Select value={symbolId || "none"} onValueChange={(value) => setSymbolId(value === "none" ? "" : value)} disabled={busy}>
        <SelectTrigger size="sm" className="min-w-0 flex-1 basis-0 text-xs" aria-label="Symbol asset" title={symbolName || "No symbol"}>
          <SelectValue placeholder="No symbol"><span className="block truncate">{symbolName || "No symbol"}</span></SelectValue>
        </SelectTrigger>
        <SelectContent><SelectItem value="none">No symbol</SelectItem>{symbols.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.target_name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={footprintId || "none"} onValueChange={(value) => setFootprintId(value === "none" ? "" : value)} disabled={busy}>
        <SelectTrigger size="sm" className="min-w-0 flex-1 basis-0 text-xs" aria-label="Footprint asset" title={footprintName || "No footprint"}>
          <SelectValue placeholder="No footprint"><span className="block truncate">{footprintName || "No footprint"}</span></SelectValue>
        </SelectTrigger>
        <SelectContent><SelectItem value="none">No footprint</SelectItem>{footprints.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.target_name}</SelectItem>)}</SelectContent>
      </Select>
      <Input aria-label="Display order" title="Display order" type="number" className="h-8 w-14 shrink-0 text-xs" value={order} onChange={(event) => setOrder(event.target.value)} disabled={busy} />
      <Button size="icon-sm" variant={previewed ? "secondary" : "ghost"} aria-label={`Preview ${representation.label}`} aria-pressed={previewed} title="Preview" onClick={onPreview}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon-sm" variant={dirty ? "default" : "ghost"} aria-label={`Save ${representation.label}`} title="Save" disabled={busy || !dirty} onClick={() => void update()}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      </Button>
      <Button size="icon-sm" variant="ghost" className="hover:text-destructive" aria-label={`Delete ${representation.label}`} title="Delete" disabled={busy} onClick={() => void remove()}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function RepresentationsPanel({
  component,
  canMutate,
  previewedId,
  onPreview,
  onChanged,
}: {
  component: CatalogComponent;
  canMutate: boolean;
  previewedId: string;
  onPreview: (representationId: string) => void;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const symbols = component.assets.filter((asset) => asset.asset_type === "symbol");
  const footprints = component.assets.filter((asset) => asset.asset_type === "footprint");
  const add = async () => {
    setCreating(true);
    try {
      const currentDefault = component.representations.find((item) => item.is_default);
      const candidates = symbols.flatMap((symbol) => footprints.map((footprint) => ({ symbol, footprint })));
      const unused = candidates.find(({ symbol, footprint }) => !component.representations.some((item) => item.symbol?.id === symbol.id && item.footprint?.id === footprint.id));
      await createRepresentation(component.id, {
        label: `Representation ${component.representations.length + 1}`,
        symbol_asset_id: unused?.symbol.id || (component.representations.length ? "" : currentDefault?.symbol?.id || symbols[0]?.id || ""),
        footprint_asset_id: unused?.footprint.id || (component.representations.length ? "" : currentDefault?.footprint?.id || footprints[0]?.id || ""),
        display_order: component.representations.length,
      }, component.revision_id);
      toast.success("Representation added");
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  };
  return (
    <PanelCard
      title="Representations"
      className="overflow-hidden [&_[data-slot=card-content]]:p-0"
      action={canMutate ? (
        <Button size="sm" variant="outline" className="h-7" title="Pair a symbol with a footprint" disabled={creating} onClick={() => void add()}>
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add
        </Button>
      ) : null}
    >
      <div className="overflow-x-auto">
        {component.representations.map((representation) => (
          <RepresentationRow
            key={representation.id}
            component={component}
            representation={representation}
            canMutate={canMutate}
            previewed={representation.id === previewedId}
            onPreview={() => onPreview(representation.id)}
            onChanged={onChanged}
          />
        ))}
      </div>
      {!component.representations.length ? <EmptyState icon={Layers3} title="No representations" /> : null}
    </PanelCard>
  );
}

function AssetRow({
  asset,
  canMutate,
  onDownload,
  onDetach,
}: {
  asset: CatalogAsset;
  canMutate: boolean;
  onDownload: () => void;
  onDetach: () => void;
}) {
  const where = `${asset.target_library ? `${asset.target_library}:` : ""}${asset.target_name}`;
  return (
    <div className="flex h-9 items-center gap-2 border-b px-3 text-xs last:border-b-0">
      <span className="min-w-0 flex-1 truncate font-medium" title={where}>{asset.name}</span>
      <Badge variant={asset.required ? "default" : "secondary"} className="h-4 shrink-0 px-1 text-[10px]">{asset.required ? "Required" : "Optional"}</Badge>
      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground" title={asset.content_type || undefined}>{formatBytes(asset.size_bytes)}</span>
      <span className="hidden w-24 shrink-0 font-mono text-muted-foreground sm:inline" title={asset.sha256 ? `SHA-256 ${asset.sha256}` : asset.id}>{shortHash(asset.sha256 || asset.id)}</span>
      <Button size="icon-sm" variant="ghost" aria-label={`Download ${asset.name}`} title="Download" onClick={onDownload}>
        <Download className="h-3.5 w-3.5" />
      </Button>
      {canMutate ? (
        <Button size="icon-sm" variant="ghost" className="hover:text-destructive" aria-label={`Detach ${asset.name}`} title="Detach" onClick={onDetach}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function AssetsPanel({
  component,
  canMutate,
  busyAction,
  onAttach,
  onDetachAsset,
  onDownload,
  onRegeneratePreviews,
  onValidate,
  onRepresentationsChanged,
}: {
  component: CatalogComponent;
  canMutate: boolean;
  busyAction: string;
  onAttach: (assetType: AssetType) => void;
  onDetachAsset: (asset: CatalogAsset) => void;
  onDownload: (asset: CatalogAsset) => void;
  onRegeneratePreviews: () => void;
  onValidate: () => void;
  onRepresentationsChanged: () => void;
}) {
  const [picked, setPicked] = useState("");
  const previewed =
    component.representations.find((item) => item.id === picked) ??
    component.representations.find((item) => item.is_default) ??
    component.representations[0];
  const fallback = resolveLibraryPreviewPairAssetIds(component);
  const symbolAssetId = previewed ? previewed.symbol?.id : fallback.symbolAssetId;
  const footprintAssetId = previewed ? previewed.footprint?.id : fallback.footprintAssetId;

  return (
    <div className="space-y-3">
      {isProvisionalPart(component) ? <ProvisionalNotice /> : null}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <div className="min-w-0 space-y-3">
          <RepresentationsPanel
            component={component}
            canMutate={canMutate}
            previewedId={previewed?.id ?? ""}
            onPreview={setPicked}
            onChanged={onRepresentationsChanged}
          />
          <PanelCard
            title="Files"
            className="overflow-hidden [&_[data-slot=card-content]]:p-0"
            action={canMutate ? (
              <div className="flex items-center gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Regenerate previews" title="Regenerate previews" disabled={Boolean(busyAction)} onClick={onRegeneratePreviews}>
                  {busyAction === "previews" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="outline" className="h-7" disabled={Boolean(busyAction) || !component.validation.enabled} onClick={onValidate} title={component.validation.enabled ? "Run KiCad Library Convention checks" : "Enable CATALOG_KLC_ENABLED to run validation"}>
                  {busyAction === "validation" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}KLC
                </Button>
              </div>
            ) : null}
          >
            {ASSET_GROUPS.map(({ type, label, required }) => {
              const assets = component.assets.filter((asset) => asset.asset_type === type);
              return (
                <section key={type} aria-label={label}>
                  <div className="flex h-8 items-center gap-2 border-b bg-muted/40 px-3 text-xs font-medium">
                    <span className="flex-1">{label}</span>
                    {assets.length ? (
                      <span className="tabular-nums text-muted-foreground">{assets.length}</span>
                    ) : (
                      <Badge variant={required ? "destructive" : "secondary"} className="h-4 px-1 text-[10px]">Missing</Badge>
                    )}
                    {canMutate ? (
                      <Button size="icon-sm" variant="ghost" className="size-6" aria-label={`Add ${label}`} title={`Add ${label.toLowerCase()}`} disabled={Boolean(busyAction)} onClick={() => onAttach(type)}>
                        <Upload className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                  {assets.map((asset) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      canMutate={canMutate}
                      onDownload={() => onDownload(asset)}
                      onDetach={() => onDetachAsset(asset)}
                    />
                  ))}
                </section>
              );
            })}
          </PanelCard>
        </div>
        <PanelCard title={previewed ? `Preview · ${previewed.label}` : "Preview"} className="self-start xl:sticky xl:top-0">
          {symbolAssetId || footprintAssetId ? (
            <LibraryPreviewPair label={component.name} symbolAssetId={symbolAssetId} footprintAssetId={footprintAssetId} />
          ) : (
            <EmptyState icon={Layers3} title="Nothing to preview" />
          )}
        </PanelCard>
      </div>
    </div>
  );
}
