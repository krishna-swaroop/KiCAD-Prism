import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  FileBox,
  FileCheck2,
  GitCompareArrows,
  Library,
  Link2,
  Layers3,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  UserRoundCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { inventoryWarnings } from "@/lib/inventory-presentation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AsyncSearchPicker } from "./async-search-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiHttpError, fetchJson } from "@/lib/api";
import { canWriteCatalog, workflowStage } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
  AvailabilityState,
  CatalogAsset,
  CatalogAuditEvent,
  CatalogAuditVerification,
  CatalogComponent,
  CatalogComponentUsage,
  CatalogReviewDecision,
  CatalogReleaseRecord,
  CatalogRepresentation,
  CatalogRevisionDiff,
  CatalogRevisionSummary,
  CatalogValidationStatus,
  ImportCompletedResponse,
  SelectionRequiredResponse,
  WorkflowStage,
} from "@/types/catalog";
import type { Project } from "@/types/project";
import {
  DefinitionRows,
  EmptyState,
  formatBytes,
  humanize,
  LoadingState,
  MetricCard,
  PanelCard,
  shortHash,
  StatusBadge,
} from "./library-component-chrome";
import {
  combinedEvidenceState,
  EMPTY_EVIDENCE,
  type EvidenceBundle,
  type EvidenceLoadState,
  type EvidenceValues,
  IDLE_EVIDENCE,
  useEvidenceLoadState,
  useEvidenceResource,
} from "./library-component-evidence";
import {
  AuditPanel,
  EvidenceBoundary,
  ReleaseReviewPanel,
  RevisionsPanel,
  WhereUsedPanel,
} from "./library-component-evidence-panels";
import { LibraryPreviewPair } from "./library-preview-inspector";
import { assetMutationRevisionId, releaseRetainedRevisionOnConflict } from "./library-asset-mutation";
import { resolveLibraryPreviewPairAssetIds } from "./library-preview-pair";

type ComponentTab = "overview" | "assets" | "revisions" | "review" | "usage" | "audit";
type AssetType = CatalogAsset["asset_type"];
type AssetAttachMode = "upload" | "link";

type MetadataForm = {
  value: string;
  description: string;
  datasheetUrl: string;
  manufacturer: string;
  mpn: string;
  category: string;
  packageName: string;
  vendor: string;
  vendorPartNumber: string;
  massG: string;
  rqjcCW: string;
  rqjcTopCW: string;
  tempMaxC: string;
  tempMinC: string;
  powerDissipationW: string;
  rate: string;
  sapCode: string;
  extraFieldsJson: string;
  changeSummary: string;
};

type AssetImportSelection = {
  file: File;
  targetLibrary: string;
  options: string[];
  selected: string;
  expectedRevisionId: string;
};

type ValidationJob = {
  status: "queued" | "running" | "completed" | "failed";
  component?: CatalogComponent | null;
  errors?: Array<{ error: string }>;
  error?: string;
  message?: string;
};

type RemoteProviderManifest = {
  assets: Array<{
    asset_type: AssetType;
    name: string;
    sha256: string;
    download_url: string;
  }>;
};

const COMPONENT_TABS: Array<{ id: ComponentTab; label: string; icon: typeof Boxes }> = [
  { id: "overview", label: "Overview", icon: Boxes },
  { id: "assets", label: "Assets", icon: FileBox },
  { id: "revisions", label: "Revisions / Compare", icon: GitCompareArrows },
  { id: "review", label: "Release Review", icon: UserRoundCheck },
  { id: "usage", label: "Where Used", icon: Link2 },
  { id: "audit", label: "Audit", icon: ShieldCheck },
];

const ASSET_LABELS: Record<AssetType, string> = {
  symbol: "Symbol",
  footprint: "Footprint",
  "3dmodel": "3D model",
  spice: "SPICE model",
};

const ASSET_ACCEPT: Record<AssetType, string> = {
  symbol: ".kicad_sym",
  footprint: ".kicad_mod,.zip",
  "3dmodel": ".step,.stp,.wrl",
  spice: ".sp,.cir,.spice,.lib",
};

const WORKFLOW_LABELS: Record<WorkflowStage, string> = {
  open: "Open",
  in_progress: "In progress",
  qa_review: "QA review",
  done: "Approved",
  released: "Released",
  archived: "Archived",
};

const AVAILABILITY_LABELS: Record<AvailabilityState, string> = {
  place_ready: "CAD complete",
  files_partial: "Files partial",
  metadata_only: "Metadata only",
};

const VALIDATION_LABELS: Record<CatalogValidationStatus, string> = {
  passed: "KLC passed",
  warning: "KLC warnings",
  failed: "KLC failed",
  skipped: "KLC skipped",
  not_run: "KLC not run",
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Is this response actually a component?
 *
 * The revision endpoint is asked for `?revision=`, which survives in the URL
 * independently of the component being viewed. Every in-app path that opens a
 * component clears it, and the API scopes the lookup and 404s a revision
 * belonging to somewhere else -- so the only way here is a link arriving with a
 * mismatched pair, and today that still 404s. The guard is for the case where
 * it does not: a 200 carrying anything else was being installed as the active
 * component, and the header dereferences `validation.status` on it without a
 * guard, so the whole workspace went white rather than showing the error banner
 * that already exists for this.
 *
 * It checks the fields the header commits to, not the whole shape, because
 * those are what the crash was about.
 */
function isCatalogComponent(value: unknown): value is CatalogComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CatalogComponent>;
  return typeof candidate.id === "string"
    && typeof candidate.revision_id === "string"
    && typeof candidate.validation === "object"
    && candidate.validation !== null;
}

const metadataFormFromComponent = (component: CatalogComponent): MetadataForm => ({
  value: component.value,
  description: component.description,
  datasheetUrl: component.datasheet_url,
  manufacturer: component.manufacturer,
  mpn: component.mpn,
  category: component.category,
  packageName: component.package_name,
  vendor: component.vendor,
  vendorPartNumber: component.vendor_part_number,
  massG: component.mass_g,
  rqjcCW: component.rqjc_c_w,
  rqjcTopCW: component.rqjc_top_c_w,
  tempMaxC: component.temp_max_c,
  tempMinC: component.temp_min_c,
  powerDissipationW: component.power_dissipation_w,
  rate: component.rate,
  sapCode: component.sap_code,
  extraFieldsJson: JSON.stringify(component.extra_fields, null, 2),
  changeSummary: "Update component metadata",
});

function OverviewPanel({ component, canMutate, onEdit }: { component: CatalogComponent; canMutate: boolean; onEdit: () => void }) {
  const requiredAttached = component.assets.filter((asset) => asset.required).length;

  const engineeringRows = [
    { label: "Mass", value: component.mass_g ? `${component.mass_g} g` : "" },
    { label: "RθJC", value: component.rqjc_c_w ? `${component.rqjc_c_w} °C/W` : "" },
    { label: "RθJC top", value: component.rqjc_top_c_w ? `${component.rqjc_top_c_w} °C/W` : "" },
    { label: "Temperature range", value: component.temp_min_c || component.temp_max_c ? `${component.temp_min_c || "—"} to ${component.temp_max_c || "—"} °C` : "" },
    { label: "Power dissipation", value: component.power_dissipation_w ? `${component.power_dissipation_w} W` : "" },
    { label: "Rate", value: component.rate },
  ];
  // Gate on the pair that actually resolves, not on the raw asset list: the
  // panes draw one representation's symbol and footprint, so a component whose
  // assets are not linked into a representation would render an empty card.
  const previewPair = resolveLibraryPreviewPairAssetIds(component);
  const renderableAssets = [previewPair.symbolAssetId, previewPair.footprintAssetId].filter(Boolean).length;
  const hasRenderableAssets = renderableAssets > 0;

  return (
    <div className="space-y-4">
      {component.identity_kind === "provisional_ipn" ? (
        <div className="border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>Provisional component.</strong> Add the real manufacturer part number before approval, release, inventory synchronization, or placement.
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Release state" value={WORKFLOW_LABELS[workflowStage(component)]} detail={`Revision v${component.revision}`} />
        <MetricCard label="Required assets" value={`${requiredAttached}/${requiredAttached + component.missing_assets.length}`} detail={component.missing_assets.length ? `Missing ${component.missing_assets.join(", ")}` : "All required assets attached"} />
        <MetricCard label="Validation" value={VALIDATION_LABELS[component.validation.status]} detail={`${component.validation.error_count} errors · ${component.validation.warning_count} warnings`} />
        <MetricCard label="Project usage" value={component.place_enabled ? "Placeable" : "Not placeable"} detail={`${AVAILABILITY_LABELS[component.availability_state]}${component.place_enabled ? "" : " · requires Released"}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard
          title="Component identity"
          description="Canonical catalog metadata for this revision."
          action={canMutate ? <Button size="sm" variant="outline" onClick={onEdit}><Edit3 className="h-3.5 w-3.5" /> Edit metadata</Button> : undefined}
        >
          <DefinitionRows rows={[
            { label: "Manufacturer", value: component.manufacturer },
            { label: "Manufacturer P/N", value: component.mpn },
            { label: "Value", value: component.value },
            { label: "Category", value: component.category },
            { label: "Package", value: component.package_name },
            { label: "Component ID", value: <span className="font-mono text-xs">{component.id}</span> },
            { label: "Source", value: component.external_source ? `${component.external_source} · ${component.external_id}` : component.source },
            { label: "Datasheet", value: component.datasheet_url ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={component.datasheet_url} target="_blank" rel="noreferrer">Open datasheet <ExternalLink className="h-3 w-3" /></a> : "" },
          ]} />
        </PanelCard>

        <PanelCard title="Engineering data" description="Thermal, sourcing, and enterprise attributes.">
          <DefinitionRows rows={[
            ...engineeringRows,
            { label: "Vendor", value: component.vendor },
            { label: "Vendor P/N", value: component.vendor_part_number },
            { label: "SAP code", value: component.sap_code },
            { label: "Stock", value: component.stock_known ? (inventoryWarnings(component.local_inventory).join(" · ") || `${component.stock_quantity} ${component.stock_uom}`.trim()) : "Not synchronized" },
          ]} />
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="Visual inspection" description={`${renderableAssets} renderable asset${renderableAssets === 1 ? "" : "s"} on this revision's representation.`}>
          {hasRenderableAssets ? (
            <LibraryPreviewPair
              label={component.name}
              symbolAssetId={previewPair.symbolAssetId}
              footprintAssetId={previewPair.footprintAssetId}
            />
          ) : (
            <EmptyState icon={SearchCheck} title="No renderable assets" detail="Attach a symbol or footprint before visual review." />
          )}
        </PanelCard>

        <PanelCard title="Revision provenance" description="Immutable evidence used to reproduce and audit this revision.">
          <DefinitionRows rows={[
            { label: "Revision", value: `v${component.revision}` },
            { label: "Change kind", value: humanize(component.change_kind) },
            { label: "Change summary", value: component.change_summary },
            { label: "Created by", value: component.created_by },
            { label: "Parent revision", value: component.parent_revision_id ? <span className="font-mono">{shortHash(component.parent_revision_id)}</span> : "Initial revision" },
            { label: "Manifest SHA-256", value: <span className="font-mono text-xs">{component.manifest_hash || "Pending finalization"}</span> },
          ]} />
        </PanelCard>
      </div>

      {Object.keys(component.extra_fields).length ? (
        <PanelCard title="Extended symbol fields" description="Additional fields preserved from the source symbol or integration.">
          <DefinitionRows rows={Object.entries(component.extra_fields).map(([label, value]) => ({ label, value }))} />
        </PanelCard>
      ) : null}
    </div>
  );
}

function RepresentationRow({
  component,
  representation,
  canMutate,
  onChanged,
}: {
  component: CatalogComponent;
  representation: CatalogRepresentation;
  canMutate: boolean;
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

  const update = async (makeDefault = representation.is_default) => {
    setSaving(true);
    try {
      await fetchJson(`/api/catalog/components/${encodeURIComponent(component.id)}/representations/${encodeURIComponent(representation.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          label,
          symbol_asset_id: symbolId,
          footprint_asset_id: footprintId,
          display_order: Number(order) || 0,
          is_default: makeDefault,
          expected_revision_id: component.revision_id,
        }),
      });
      toast.success(makeDefault && !representation.is_default ? "Default representation updated." : "Representation saved.");
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
      await fetchJson(`/api/catalog/components/${encodeURIComponent(component.id)}/representations/${encodeURIComponent(representation.id)}?expected_revision_id=${encodeURIComponent(component.revision_id)}`, { method: "DELETE" });
      toast.success("Representation removed in a new revision.");
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-2 border p-3 lg:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_5rem_auto]">
      <Input aria-label="Representation label" value={label} onChange={(event) => setLabel(event.target.value)} disabled={!canMutate || saving} />
      <Select value={symbolId || "none"} onValueChange={(value) => setSymbolId(value === "none" ? "" : value)} disabled={!canMutate || saving}>
        <SelectTrigger aria-label="Symbol asset"><SelectValue placeholder="No symbol" /></SelectTrigger>
        <SelectContent><SelectItem value="none">No symbol</SelectItem>{symbols.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.target_name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={footprintId || "none"} onValueChange={(value) => setFootprintId(value === "none" ? "" : value)} disabled={!canMutate || saving}>
        <SelectTrigger aria-label="Footprint asset"><SelectValue placeholder="No footprint" /></SelectTrigger>
        <SelectContent><SelectItem value="none">No footprint</SelectItem>{footprints.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.target_name}</SelectItem>)}</SelectContent>
      </Select>
      <Input aria-label="Display order" type="number" value={order} onChange={(event) => setOrder(event.target.value)} disabled={!canMutate || saving} />
      <div className="flex items-center justify-end gap-1">
        {representation.is_default ? <Badge>Default</Badge> : <Button size="sm" variant="outline" disabled={!canMutate || saving || !symbolId || !footprintId} onClick={() => void update(true)}>Make default</Button>}
        <Button size="sm" disabled={!canMutate || saving} onClick={() => void update()}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save</Button>
        <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${representation.label}`} disabled={!canMutate || saving} onClick={() => void remove()}><XCircle className="h-3.5 w-3.5" /></Button>
      </div>
      {(representation.symbol?.preview_id || representation.footprint?.preview_id) ? (
        <div className="grid gap-2 border-t pt-2 lg:col-span-5 sm:grid-cols-2">
          {(["symbol", "footprint"] as const).map((kind) => {
            const asset = representation[kind];
            return asset?.preview_id ? (
              <div key={kind} className="flex min-h-28 items-center justify-center bg-preview-surface p-2">
                <img src={`/api/catalog/previews/${encodeURIComponent(asset.preview_id)}`} alt={`${representation.label} ${kind} preview`} className="max-h-36 max-w-full object-contain" />
              </div>
            ) : <div key={kind} className="flex min-h-28 items-center justify-center border border-dashed text-xs text-muted-foreground">No {kind} preview</div>;
          })}
        </div>
      ) : null}
    </div>
  );
}

function RepresentationsPanel({ component, canMutate, onChanged }: { component: CatalogComponent; canMutate: boolean; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const symbols = component.assets.filter((asset) => asset.asset_type === "symbol");
  const footprints = component.assets.filter((asset) => asset.asset_type === "footprint");
  const add = async () => {
    setCreating(true);
    try {
      const currentDefault = component.representations.find((item) => item.is_default);
      const candidates = symbols.flatMap((symbol) => footprints.map((footprint) => ({ symbol, footprint })));
      const unused = candidates.find(({ symbol, footprint }) => !component.representations.some((item) => item.symbol?.id === symbol.id && item.footprint?.id === footprint.id));
      await fetchJson(`/api/catalog/components/${encodeURIComponent(component.id)}/representations`, {
        method: "POST",
        body: JSON.stringify({
          label: `Representation ${component.representations.length + 1}`,
          symbol_asset_id: unused?.symbol.id || (component.representations.length ? "" : currentDefault?.symbol?.id || symbols[0]?.id || ""),
          footprint_asset_id: unused?.footprint.id || (component.representations.length ? "" : currentDefault?.footprint?.id || footprints[0]?.id || ""),
          display_order: component.representations.length,
          expected_revision_id: component.revision_id,
        }),
      });
      toast.success("Representation added in a new revision.");
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  };
  return (
    <PanelCard
      title="Symbol-footprint representations"
      description="Pair any attached symbol with any attached footprint. Placement and previews follow the selected pair."
      action={canMutate ? <Button size="sm" variant="outline" disabled={creating} onClick={() => void add()}>{creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers3 className="h-3.5 w-3.5" />} Add representation</Button> : null}
    >
      {component.identity_kind === "provisional_ipn" ? <div className="mb-3 border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">This provisional component cannot be completed or released until it has a real manufacturer and MPN.</div> : null}
      <div className="space-y-2">
        {component.representations.map((representation) => <RepresentationRow key={representation.id} component={component} representation={representation} canMutate={canMutate} onChanged={onChanged} />)}
        {!component.representations.length ? <EmptyState icon={Layers3} title="No representations" detail="Attach symbol and footprint assets, then pair them here." /> : null}
      </div>
    </PanelCard>
  );
}

function AssetsPanel({
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
  const groups = (["symbol", "footprint", "3dmodel", "spice"] as const).map((type) => ({
    type,
    assets: component.assets.filter((asset) => asset.asset_type === type),
  }));
  const downloadsAvailable = component.revision_id === component.released_revision_id;
  const previewPair = resolveLibraryPreviewPairAssetIds(component);
  const hasRenderableAssets = Boolean(previewPair.symbolAssetId || previewPair.footprintAssetId);

  return (
    <div className="space-y-4">
      <RepresentationsPanel component={component} canMutate={canMutate} onChanged={onRepresentationsChanged} />
      <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-3">
        <div>
          <p className="text-sm font-medium">Revision assets and evidence</p>
        </div>
        {canMutate ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={onRegeneratePreviews}>
              {busyAction === "previews" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Regenerate previews
            </Button>
            <Button size="sm" disabled={Boolean(busyAction) || !component.validation.enabled} onClick={onValidate} title={component.validation.enabled ? "Run KiCad Library Convention validation" : "Enable CATALOG_KLC_ENABLED to run validation"}>
              {busyAction === "validation" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Run KLC validation
            </Button>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(({ type, assets }) => (
          <PanelCard
            key={type}
            title={type === "3dmodel" ? "3D models" : type === "spice" ? "SPICE models" : `${humanize(type)} assets`}
            description={`${assets.length} immutable file${assets.length === 1 ? "" : "s"} attached to v${component.revision}.`}
            action={(
              <div className="flex items-center gap-2">
                <StatusBadge tone={assets.length ? "success" : type === "symbol" || type === "footprint" ? "danger" : "warning"}>{assets.length ? "Attached" : "Missing"}</StatusBadge>
                {canMutate ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => onAttach(type)}><Upload className="h-3.5 w-3.5" />Add</Button> : null}
              </div>
            )}
          >
            {assets.length ? (
              <div className="divide-y divide-border">
                {assets.map((asset) => (
                  <div key={asset.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{asset.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{asset.target_library ? `${asset.target_library}:` : ""}{asset.target_name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {asset.required ? <Badge>Required</Badge> : <Badge variant="secondary">Optional</Badge>}
                        <Button size="icon-sm" variant="ghost" aria-label={`Download ${asset.name}`} title={downloadsAvailable ? "Download released asset" : "Downloads are available from the released revision"} disabled={!downloadsAvailable} onClick={() => onDownload(asset)}><Download className="h-3.5 w-3.5" /></Button>
                        {canMutate ? <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Detach ${asset.name}`} onClick={() => onDetachAsset(asset)}><XCircle className="h-3.5 w-3.5" /></Button> : null}
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <span className="min-w-0 truncate">{asset.content_type || "Unknown content type"}</span>
                      <span>{formatBytes(asset.size_bytes)}</span>
                      <span className="min-w-0 truncate font-mono sm:col-span-2" title={asset.sha256}>{asset.sha256 ? `SHA-256 ${asset.sha256}` : `Asset ${asset.id}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CircleDashed} title={`No ${humanize(type)} asset`} detail={type === "symbol" || type === "footprint" ? "This required asset blocks place readiness." : "This optional asset has not been provided."} />
            )}
          </PanelCard>
        ))}
      </div>

      {hasRenderableAssets ? (
        <PanelCard title="Rendered previews" description="Drawn from this revision\u2019s own symbol and footprint, without opening KiCad.">
          <LibraryPreviewPair
            label={component.name}
            symbolAssetId={previewPair.symbolAssetId}
            footprintAssetId={previewPair.footprintAssetId}
          />
        </PanelCard>
      ) : null}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-xl border border-destructive bg-destructive/10 p-5 text-center">
        <CircleAlert className="mx-auto h-6 w-6 text-destructive" />
        <p className="mt-2 text-sm font-medium">Could not open component workspace</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        <Button className="mt-4" size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3 w-3" /> Retry</Button>
      </div>
    </div>
  );
}

function MetadataEditDialog({
  open,
  form,
  submitting,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: MetadataForm | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: MetadataForm) => void;
  onSubmit: () => void;
}) {
  if (!form) return null;
  const setField = (field: keyof MetadataForm, value: string) => onChange({ ...form, [field]: value });
  const requiredComplete = Boolean(form.value.trim() && form.manufacturer.trim() && form.mpn.trim() && form.description.trim() && form.datasheetUrl.trim() && form.changeSummary.trim());
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit component metadata</DialogTitle>
          <DialogDescription>Saving creates a new immutable revision. The current revision ID is checked to prevent overwriting concurrent work.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {METADATA_FIELDS.map(({ field, label, type, placeholder }) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`component-edit-${field}`}>{label}{["value", "manufacturer", "mpn", "datasheetUrl"].includes(field) ? " *" : ""}</Label>
              <Input id={`component-edit-${field}`} type={type} required={["value", "manufacturer", "mpn", "datasheetUrl"].includes(field)} value={form[field]} placeholder={placeholder} onChange={(event) => setField(field, event.target.value)} />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="component-edit-description">Description *</Label>
            <Textarea id="component-edit-description" required value={form.description} rows={3} onChange={(event) => setField("description", event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="component-edit-extra-fields">Extended symbol fields (JSON object)</Label>
            <Textarea id="component-edit-extra-fields" className="font-mono text-xs" value={form.extraFieldsJson} rows={6} spellCheck={false} onChange={(event) => setField("extraFieldsJson", event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="component-edit-summary">Change summary *</Label>
            <Input id="component-edit-summary" required value={form.changeSummary} placeholder="Describe why this revision is needed" onChange={(event) => setField("changeSummary", event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting || !requiredComplete} onClick={onSubmit}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />} Save new revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STORED_FILE_RESULT_LIMIT = 50;

/** Pick a file already sitting in Prism storage, including ones never registered as an asset. */
function StoredFilePicker({
  id,
  assetType,
  value,
  onChange,
}: {
  id: string;
  assetType: AssetType;
  value: string;
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const kind = ASSET_LABELS[assetType].toLowerCase();

  return (
    <AsyncSearchPicker<string>
      id={id}
      open={open}
      onOpenChange={setOpen}
      // Portalled out of the attach dialog, so it needs its own modal layer.
      modal
      contentClassName="w-[var(--radix-popover-trigger-width)]"
      fetchKey={assetType}
      trigger={
        <button
          type="button"
          id={id}
          aria-expanded={open}
          className="border-input dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full min-w-0 items-center justify-between gap-1.5 border px-3 py-2 text-left text-xs leading-none transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-1"
        >
          <span className={cn("min-w-0 truncate", value ? "text-foreground" : "text-muted-foreground")}>{value || "Select a stored file"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      }
      fetchPage={(query, signal) =>
        fetchJson<{ files: string[]; total?: number }>(
          `/api/catalog/assets/browse?asset_type=${encodeURIComponent(assetType)}&limit=${STORED_FILE_RESULT_LIMIT}&q=${encodeURIComponent(query)}`,
          { signal },
          "Stored assets could not be listed.",
        ).then((response) => ({ items: response.files, total: response.total }))
      }
      getKey={(path) => path}
      isSelected={(path) => path === value}
      onSelect={onChange}
      searchPlaceholder={`Search stored ${kind} files`}
      listLabel={`Stored ${kind} files`}
      emptyMessage={`No stored ${kind} files match.`}
      renderItem={(path) => (
        <>
          <Check className={cn("h-3.5 w-3.5 shrink-0", path === value ? "text-primary" : "invisible")} />
          <span className="min-w-0 flex-1 truncate">{path}</span>
        </>
      )}
      renderFooter={({ shown, total }) =>
        total > shown ? (
          <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">Showing {shown} of {total} stored files — refine the search to narrow.</p>
        ) : null
      }
    />
  );
}

function AssetAttachDialog({
  assetType,
  mode,
  file,
  targetLibrary,
  targetName,
  counterpartAssets,
  counterpartAssetId,
  selectedLink,
  selection,
  submitting,
  onOpenChange,
  onModeChange,
  onFileChange,
  onTargetLibraryChange,
  onTargetNameChange,
  onCounterpartAssetChange,
  onSelectedLinkChange,
  onSelectionChange,
  onUpload,
  onLink,
}: {
  assetType: AssetType | null;
  mode: AssetAttachMode;
  file: File | null;
  targetLibrary: string;
  targetName: string;
  counterpartAssets: CatalogAsset[];
  counterpartAssetId: string;
  selectedLink: string;
  selection: AssetImportSelection | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AssetAttachMode) => void;
  onFileChange: (file: File | null) => void;
  onTargetLibraryChange: (value: string) => void;
  onTargetNameChange: (value: string) => void;
  onCounterpartAssetChange: (value: string) => void;
  onSelectedLinkChange: (value: string) => void;
  onSelectionChange: (value: string) => void;
  onUpload: () => void;
  onLink: () => void;
}) {
  const label = assetType ? ASSET_LABELS[assetType] : "asset";
  return (
    <Dialog open={assetType !== null} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add {label.toLowerCase()}</DialogTitle>
          <DialogDescription>Upload a file or link one already present in Prism storage. Attaching it creates a new immutable component revision.</DialogDescription>
        </DialogHeader>
        {selection ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Select the {assetType === "symbol" ? "symbol" : "footprint"} to import</Label>
              <div className="max-h-64 space-y-1 overflow-y-auto border p-2">
                {selection.options.map((option) => (
                  <button key={option} type="button" className={cn("w-full border px-3 py-2 text-left text-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selection.selected === option && "border-primary bg-primary/5")} onClick={() => onSelectionChange(option)}>{option}</button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={submitting || !selection.selected} onClick={onUpload}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import selected</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center gap-1 border bg-muted/30 p-1" role="tablist" aria-label="Asset source">
              {ASSET_SOURCE_TABS.map(({ id, label: tabLabel, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  disabled={submitting}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 border border-transparent px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    mode === id
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => onModeChange(id)}
                >
                  <Icon className="h-3.5 w-3.5" />{tabLabel}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {mode === "upload" ? (
                <div className="space-y-2">
                  <Label htmlFor="component-asset-file">{label} file</Label>
                  <FileInput
                    id="component-asset-file"
                    accept={assetType ? ASSET_ACCEPT[assetType] : undefined}
                    value={file}
                    onValueChange={onFileChange}
                    disabled={submitting}
                  />
                  {file ? <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p> : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="component-existing-asset">Existing file</Label>
                  {assetType ? (
                    <StoredFilePicker
                      id="component-existing-asset"
                      assetType={assetType}
                      value={selectedLink}
                      onChange={onSelectedLinkChange}
                    />
                  ) : null}
                </div>
              )}
              <div className={cn("grid gap-4", mode === "link" && "sm:grid-cols-2")}>
                <div className="space-y-2"><Label htmlFor="component-asset-library">Target library</Label><Input id="component-asset-library" value={targetLibrary} onChange={(event) => onTargetLibraryChange(event.target.value)} placeholder="Prism library" /></div>
                {mode === "link" ? <div className="space-y-2"><Label htmlFor="component-asset-name">Target item name</Label><Input id="component-asset-name" value={targetName} onChange={(event) => onTargetNameChange(event.target.value)} placeholder="Auto-detect" /></div> : null}
              </div>
              {(assetType === "symbol" || assetType === "footprint") && counterpartAssets.length ? (
                <div className="space-y-2">
                  <Label htmlFor="component-counterpart-asset">Pair with {assetType === "symbol" ? "footprint" : "symbol"}</Label>
                  <Select value={counterpartAssetId} onValueChange={onCounterpartAssetChange}>
                    <SelectTrigger id="component-counterpart-asset" className="w-full"><SelectValue placeholder="Select the counterpart asset" /></SelectTrigger>
                    <SelectContent>{counterpartAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.target_library ? `${asset.target_library}:` : ""}{asset.target_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The current default counterpart is preselected. You can edit the resulting pair in Representations.</p>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={submitting || (mode === "upload" ? !file : !selectedLink)} onClick={mode === "upload" ? onUpload : onLink}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "upload" ? <Upload className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}{mode === "upload" ? "Attach file" : "Link asset"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Fixed table, no closure over props: build it once.
const METADATA_FIELDS: Array<{ field: keyof MetadataForm; label: string; type?: string; placeholder?: string }> = [
  { field: "value", label: "Value", placeholder: "10 kΩ, TPS55289…" },
  { field: "manufacturer", label: "Manufacturer" },
  { field: "mpn", label: "Manufacturer part number" },
  { field: "datasheetUrl", label: "Datasheet URL", type: "url" },
  { field: "category", label: "Category" },
  { field: "packageName", label: "Package" },
  { field: "vendor", label: "Vendor" },
  { field: "vendorPartNumber", label: "Vendor part number" },
  { field: "massG", label: "Mass (g)" },
  { field: "rqjcCW", label: "RθJC (°C/W)" },
  { field: "rqjcTopCW", label: "RθJC top (°C/W)" },
  { field: "tempMaxC", label: "Maximum temperature (°C)" },
  { field: "tempMinC", label: "Minimum temperature (°C)" },
  { field: "powerDissipationW", label: "Power dissipation (W)" },
  { field: "rate", label: "Rate" },
  { field: "sapCode", label: "SAP code" },
];

// Fixed table, no closure over props: build it once.
const ASSET_SOURCE_TABS: Array<{ id: AssetAttachMode; label: string; icon: typeof Upload }> = [
  { id: "upload", label: "Upload file", icon: Upload },
  { id: "link", label: "Link existing", icon: Link2 },
];

// react-doctor-disable-next-line no-giant-component - tabs, evidence, and release queue share one component resource
export function LibraryComponentWorkspace({
  componentId,
  user,
  projects,
  onBack,
}: {
  componentId: string;
  user: User | null;
  projects: Project[];
  onBack: () => void;
// react-doctor-disable-next-line prefer-useReducer - the states belong to separate concerns: tabs, evidence, queue
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("componentTab") as ComponentTab | null;
  const activeTab: ComponentTab = requestedTab && COMPONENT_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : "overview";
  const requestedRevisionId = searchParams.get("revision") || "";
  const compareRevisionId = searchParams.get("compare") || "";
  const returnView = searchParams.get("libraryView") || "catalog";
  const returnLabel = returnView === "releases" ? "Release Queue" : returnView === "imports" ? "Import Center" : "Catalog";
  const [currentComponent, setCurrentComponent] = useState<CatalogComponent | null>(null);
  const [activeComponent, setActiveComponent] = useState<CatalogComponent | null>(null);
  // Every tab's evidence belongs to one component generation, so it is stored
  // as one value carrying that generation. Reading it back through the guard
  // below is what used to be an effect blanking six pieces of state.
  const [evidenceStore, setEvidenceStore] = useState<EvidenceBundle>(
    () => ({ generation: "", ...EMPTY_EVIDENCE }),
  );
  const [diff, setDiff] = useState<CatalogRevisionDiff | null>(null);
  const [componentLoading, setComponentLoading] = useState(true);
  const [componentError, setComponentError] = useState("");
  const [componentGeneration, setComponentGeneration] = useState("");
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [evidenceRetryKey, setEvidenceRetryKey] = useState(0);
  // Kept whole so each can be handed to useEvidenceResource; the destructured
  // aliases below are what the render and retry paths read.
  const revisionsLoad = useEvidenceLoadState();
  const reviewsLoad = useEvidenceLoadState();
  const releasesLoad = useEvidenceLoadState();
  const usageLoad = useEvidenceLoadState();
  const auditLoad = useEvidenceLoadState();
  const { state: revisionsLoadState, stateRef: revisionsLoadRef, update: setRevisionsLoad } = revisionsLoad;
  const { state: reviewsLoadState, stateRef: reviewsLoadRef, update: setReviewsLoad } = reviewsLoad;
  const { state: releasesLoadState, stateRef: releasesLoadRef, update: setReleasesLoad } = releasesLoad;
  const { state: usageLoadState, stateRef: usageLoadRef, update: setUsageLoad } = usageLoad;
  const { state: auditLoadState, stateRef: auditLoadRef, update: setAuditLoad } = auditLoad;
  const { state: diffLoadState, stateRef: diffLoadRef, update: setDiffLoad } = useEvidenceLoadState();
  // Diffs are cached per revision pair. The cache carries the generation it was
  // filled for so it can be dropped when the component changes, which the reset
  // effect used to do; keys already include componentId, so this is about not
  // holding another component's payloads, not about correctness.
  const diffCacheRef = useRef({ generation: "", entries: new Map<string, CatalogRevisionDiff>() });
  const [transitionTarget, setTransitionTarget] = useState<WorkflowStage | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataForm, setMetadataForm] = useState<MetadataForm | null>(null);
  const [attachAssetType, setAttachAssetType] = useState<AssetType | null>(null);
  const [attachMode, setAttachMode] = useState<AssetAttachMode>("upload");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachTargetLibrary, setAttachTargetLibrary] = useState("");
  const [attachTargetName, setAttachTargetName] = useState("");
  const [attachCounterpartId, setAttachCounterpartId] = useState("");
  const [selectedLink, setSelectedLink] = useState("");
  const [importSelection, setImportSelection] = useState<AssetImportSelection | null>(null);
  const [detachAsset, setDetachAsset] = useState<CatalogAsset | null>(null);
  const [busyAction, setBusyAction] = useState("");

  const updateParams = useCallback((values: Record<string, string | null>) => {
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      for (const [key, value] of Object.entries(values)) {
        if (value) updated.set(key, value);
        else updated.delete(key);
      }
      updated.set("section", "library-manager");
      return updated;
    });
  }, [setSearchParams]);

  const evidenceGeneration = `${componentId}:${refreshKey}`;
  const { revisions, events, verification, usage, reviews, releases } =
    evidenceStore.generation === evidenceGeneration ? evidenceStore : EMPTY_EVIDENCE;
  const publishEvidence = useCallback(
    <K extends keyof EvidenceValues>(key: K, value: EvidenceValues[K]) =>
      setEvidenceStore((current) => ({
        ...(current.generation === evidenceGeneration ? current : EMPTY_EVIDENCE),
        generation: evidenceGeneration,
        [key]: value,
      })),
    [evidenceGeneration],
  );
  const needsRevisions = activeTab === "revisions" || activeTab === "review";
  const needsReviews = activeTab === "review" || activeTab === "audit";
  const needsReleases = activeTab === "review" || activeTab === "audit";
  const needsUsage = activeTab === "usage";
  const needsAudit = activeTab === "audit";
  const currentRevisionKey = currentComponent?.revision_id || "";
  const componentReady = Boolean(currentRevisionKey && componentGeneration === evidenceGeneration);

  useEffect(() => {
    const controller = new AbortController();
    setComponentLoading(true);
    setComponentError("");
    setComponentGeneration("");
    setCurrentComponent(null);
    setActiveComponent(null);
    void fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(componentId)}`, { signal: controller.signal })
      .then((component) => {
        if (controller.signal.aborted) return;
        setCurrentComponent(component);
        setActiveComponent(component);
        setComponentGeneration(`${componentId}:${refreshKey}`);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setComponentError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setComponentLoading(false); });
    return () => controller.abort();
  }, [componentId, refreshKey]);

  useEffect(() => {
    if (!currentComponent) return;
    setHistoricalError("");
    if (!requestedRevisionId || requestedRevisionId === currentComponent.revision_id) {
      setHistoricalLoading(false);
      setActiveComponent(currentComponent);
      return;
    }
    const controller = new AbortController();
    setHistoricalLoading(true);
    void fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(componentId)}/revisions/${encodeURIComponent(requestedRevisionId)}`, { signal: controller.signal })
      .then((component) => {
        if (controller.signal.aborted) return;
        if (!isCatalogComponent(component)) {
          setHistoricalError("That revision could not be loaded for this component.");
          return;
        }
        setActiveComponent(component);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setHistoricalError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setHistoricalLoading(false); });
    return () => controller.abort();
  }, [componentId, currentComponent, requestedRevisionId]);

  const componentPath = `/api/catalog/components/${encodeURIComponent(componentId)}`;

  useEvidenceResource({
    enabled: componentReady && needsRevisions,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: revisionsLoad,
    load: (signal) => fetchJson<{ items: CatalogRevisionSummary[] }>(`${componentPath}/revisions`, { signal }),
    onLoaded: (response) => publishEvidence("revisions", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsReviews,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: reviewsLoad,
    load: (signal) => fetchJson<{ items: CatalogReviewDecision[] }>(`${componentPath}/reviews`, { signal }),
    onLoaded: (response) => publishEvidence("reviews", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsReleases,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: releasesLoad,
    load: (signal) => fetchJson<{ items: CatalogReleaseRecord[] }>(`${componentPath}/releases`, { signal }),
    onLoaded: (response) => publishEvidence("releases", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsUsage,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: usageLoad,
    load: (signal) => fetchJson<{ items: CatalogComponentUsage[] }>(`${componentPath}/usage`, { signal }),
    onLoaded: (response) => publishEvidence("usage", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsAudit,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: auditLoad,
    // The chain and its verification are one piece of evidence: a verified
    // chain shown against a half-loaded event list would be misleading.
    load: (signal) =>
      Promise.all([
        fetchJson<{ items: CatalogAuditEvent[] }>(`${componentPath}/audit`, { signal }),
        fetchJson<CatalogAuditVerification>(`${componentPath}/audit/verify`, { signal }),
      ]),
    onLoaded: ([eventList, auditVerification]) => {
      publishEvidence("events", eventList.items);
      publishEvidence("verification", auditVerification);
    },
  });

  const diffPair = useMemo(() => {
    if (!activeComponent) return null;
    if (activeTab === "review") {
      return activeComponent.parent_revision_id ? { before: activeComponent.parent_revision_id, after: activeComponent.revision_id } : null;
    }
    return compareRevisionId ? { before: compareRevisionId, after: activeComponent.revision_id } : null;
  }, [activeComponent, activeTab, compareRevisionId]);

  useEffect(() => {
    if (!componentReady || !needsRevisions) return;
    if (!diffPair || diffPair.before === diffPair.after) {
      setDiff(null);
      setDiffLoad({ status: "loaded", error: "", generation: evidenceGeneration });
      return;
    }
    if (diffCacheRef.current.generation !== evidenceGeneration) {
      diffCacheRef.current = { generation: evidenceGeneration, entries: new Map() };
    }
    const cacheKey = `${componentId}:${diffPair.before}:${diffPair.after}`;
    const cached = diffCacheRef.current.entries.get(cacheKey);
    if (cached) {
      setDiff(cached);
      setDiffLoad({ status: "loaded", error: "", generation: cacheKey });
      return;
    }
    if (diffLoadRef.current.status === "loading" && diffLoadRef.current.generation === cacheKey) return;
    const controller = new AbortController();
    let settled = false;
    setDiff(null);
    setDiffLoad({ status: "loading", error: "", generation: cacheKey });
    const params = new URLSearchParams({ before: diffPair.before, after: diffPair.after });
    void fetchJson<CatalogRevisionDiff>(`/api/catalog/components/${encodeURIComponent(componentId)}/revisions/compare?${params.toString()}`, { signal: controller.signal })
      .then((value) => {
        settled = true;
        if (controller.signal.aborted) return;
        diffCacheRef.current.entries.set(cacheKey, value);
        setDiff(value);
        setDiffLoad({ status: "loaded", error: "", generation: cacheKey });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (!controller.signal.aborted) setDiffLoad({ status: "error", error: reason instanceof Error ? reason.message : String(reason), generation: cacheKey });
      });
    return () => {
      controller.abort();
      if (!settled) setDiffLoad(IDLE_EVIDENCE);
    };
  }, [componentId, componentReady, diffLoadRef, diffPair, evidenceGeneration, evidenceRetryKey, needsRevisions, setDiffLoad]);

  const historical = Boolean(currentComponent && activeComponent && currentComponent.revision_id !== activeComponent.revision_id);
  const canMutate = Boolean(!historical && canWriteCatalog(user?.role));
  const sameActorApproval = Boolean(
    user?.role === "admin" &&
    currentComponent &&
    (transitionTarget === "done" || transitionTarget === "released") &&
    (workflowStage(currentComponent) === "qa_review" || workflowStage(currentComponent) === "done") &&
    currentComponent.created_by &&
    currentComponent.created_by === user.email
  );
  const decisionNoteRequired = Boolean(
    currentComponent && transitionTarget && workflowStage(currentComponent) === "qa_review" && (transitionTarget === "done" || transitionTarget === "in_progress")
  );

  const handleTransition = async () => {
    if (!transitionTarget || !currentComponent) return;
    if (decisionNoteRequired && !reviewNote.trim()) {
      toast.error("Add a review note so this decision is auditable.");
      return;
    }
    if (sameActorApproval && !overrideReason.trim()) {
      toast.error("Document why the two-person approval rule is being overridden.");
      return;
    }
    setTransitioning(true);
    try {
      await fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(componentId)}/release`, {
        method: "POST",
        body: JSON.stringify({
          workflow_stage: transitionTarget,
          review_note: reviewNote.trim(),
          self_approval_override_reason: overrideReason.trim(),
          expected_revision_id: currentComponent.revision_id,
          expected_manifest_hash: currentComponent.manifest_hash,
        }),
      });
      toast.success(`Component moved to ${WORKFLOW_LABELS[transitionTarget]}.`);
      setTransitionTarget(null);
      setReviewNote("");
      setOverrideReason("");
      updateParams({ revision: null, compare: null });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTransitioning(false);
    }
  };

  const openMetadataEditor = () => {
    if (!currentComponent || !canMutate) return;
    setMetadataForm(metadataFormFromComponent(currentComponent));
    setMetadataOpen(true);
  };

  const handleMetadataSave = async () => {
    if (!metadataForm || !currentComponent || !canMutate) return;
    let extraFields: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(metadataForm.extraFieldsJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Extended fields must be a JSON object.");
      extraFields = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Extended fields contain invalid JSON.");
      return;
    }
    setBusyAction("metadata");
    try {
      await fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(componentId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          value: metadataForm.value.trim(),
          description: metadataForm.description.trim(),
          datasheet_url: metadataForm.datasheetUrl.trim(),
          manufacturer: metadataForm.manufacturer.trim(),
          mpn: metadataForm.mpn.trim(),
          category: metadataForm.category.trim(),
          package_name: metadataForm.packageName.trim(),
          vendor: metadataForm.vendor.trim(),
          vendor_part_number: metadataForm.vendorPartNumber.trim(),
          mass_g: metadataForm.massG.trim(),
          rqjc_c_w: metadataForm.rqjcCW.trim(),
          rqjc_top_c_w: metadataForm.rqjcTopCW.trim(),
          temp_max_c: metadataForm.tempMaxC.trim(),
          temp_min_c: metadataForm.tempMinC.trim(),
          power_dissipation_w: metadataForm.powerDissipationW.trim(),
          rate: metadataForm.rate.trim(),
          sap_code: metadataForm.sapCode.trim(),
          extra_fields: extraFields,
          change_summary: metadataForm.changeSummary.trim(),
          expected_revision_id: currentComponent.revision_id,
        }),
      });
      toast.success("Metadata saved as a new revision.");
      setMetadataOpen(false);
      setMetadataForm(null);
      updateParams({ revision: null, compare: null });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction("");
    }
  };

  const resetAttachDialog = () => {
    setAttachAssetType(null);
    setAttachMode("upload");
    setAttachFile(null);
    setAttachTargetLibrary("");
    setAttachTargetName("");
    setAttachCounterpartId("");
    setSelectedLink("");
    setImportSelection(null);
  };

  const openAttachDialog = (assetType: AssetType) => {
    if (!currentComponent || !canMutate) return;
    // The dialog opens instantly in upload mode. Stored files are only listed
    // when the user actually opens the "Link existing" picker.
    setAttachAssetType(assetType);
    setAttachMode("upload");
    setAttachFile(null);
    setAttachTargetLibrary(currentComponent.library_name || currentComponent.name);
    setAttachTargetName("");
    const defaultRepresentation = currentComponent.representations.find((item) => item.is_default);
    setAttachCounterpartId(
      assetType === "symbol"
        ? defaultRepresentation?.footprint?.id || ""
        : assetType === "footprint"
          ? defaultRepresentation?.symbol?.id || ""
          : ""
    );
    setSelectedLink("");
    setImportSelection(null);
  };

  const handleAssetUpload = async () => {
    if (!attachAssetType || !currentComponent || !canMutate) return;
    const sourceFile = importSelection?.file || attachFile;
    if (!sourceFile) return;
    setBusyAction("asset");
    try {
      const form = new FormData();
      form.append("file", sourceFile);
      form.append("target_library", importSelection?.targetLibrary || attachTargetLibrary || currentComponent.name);
      form.append("expected_revision_id", assetMutationRevisionId(currentComponent.revision_id, importSelection?.expectedRevisionId));
      if (attachCounterpartId) form.append("counterpart_asset_id", attachCounterpartId);
      if (importSelection?.selected) {
        form.append(attachAssetType === "symbol" ? "selected_symbol" : "selected_footprint", importSelection.selected);
      }
      const endpoint = attachAssetType === "symbol"
        ? `/api/catalog/components/${encodeURIComponent(componentId)}/symbol-import`
        : attachAssetType === "footprint"
          ? `/api/catalog/components/${encodeURIComponent(componentId)}/footprint-import`
          : `/api/catalog/components/${encodeURIComponent(componentId)}/assets/${encodeURIComponent(attachAssetType)}`;
      const response = await fetchJson<SelectionRequiredResponse | ImportCompletedResponse | { component: CatalogComponent }>(endpoint, { method: "POST", body: form });
      if ("mode" in response && response.mode === "selection_required") {
        const options = response.discovered_symbols || response.discovered_footprints || [];
        setImportSelection({ file: sourceFile, targetLibrary: attachTargetLibrary || currentComponent.name, options, selected: options[0] || "", expectedRevisionId: assetMutationRevisionId(currentComponent.revision_id, importSelection?.expectedRevisionId) });
        return;
      }
      toast.success(`${ASSET_LABELS[attachAssetType]} attached as a new revision.`);
      resetAttachDialog();
      updateParams({ revision: null, compare: null });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
      const status = reason instanceof ApiHttpError ? reason.status : undefined;
      const code = reason instanceof ApiHttpError ? reason.code : undefined;
      setImportSelection((current) => releaseRetainedRevisionOnConflict(current, status, code));
    } finally {
      setBusyAction("");
    }
  };

  const handleAssetLink = async () => {
    if (!attachAssetType || !selectedLink || !currentComponent || !canMutate) return;
    setBusyAction("asset");
    try {
      await fetchJson(`/api/catalog/components/${encodeURIComponent(componentId)}/assets/${encodeURIComponent(attachAssetType)}/link`, {
        method: "POST",
        body: JSON.stringify({
          file_path: selectedLink,
          target_library: attachTargetLibrary.trim() || currentComponent.name,
          target_name: attachTargetName.trim(),
          counterpart_asset_id: attachCounterpartId,
          expected_revision_id: currentComponent.revision_id,
        }),
      });
      toast.success(`${ASSET_LABELS[attachAssetType]} linked as a new revision.`);
      resetAttachDialog();
      updateParams({ revision: null, compare: null });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction("");
    }
  };

  const handleAssetDetachById = async () => {
    if (!detachAsset || !canMutate || !currentComponent) return;
    setBusyAction("detach-id");
    try {
      const params = new URLSearchParams({ expected_revision_id: currentComponent.revision_id });
      await fetchJson(`/api/catalog/components/${encodeURIComponent(componentId)}/assets/id/${encodeURIComponent(detachAsset.id)}?${params.toString()}`, { method: "DELETE" });
      toast.success(`${ASSET_LABELS[detachAsset.asset_type]} detached in a new revision.`);
      setDetachAsset(null);
      updateParams({ revision: null, compare: null });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction("");
    }
  };

  const handleRegeneratePreviews = async () => {
    if (!canMutate) return;
    setBusyAction("previews");
    try {
      const updated = await fetchJson<CatalogComponent>(`/api/catalog/components/${encodeURIComponent(componentId)}/previews/regenerate`, { method: "POST" });
      const ready = updated.previews.filter((preview) => preview.status === "ready").length;
      const failed = updated.previews.filter((preview) => preview.status === "failed").length;
      if (ready) toast.success(`${ready} preview${ready === 1 ? "" : "s"} ready${failed ? `; ${failed} failed` : ""}.`);
      else toast.error("Preview generation completed without a ready preview.");
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction("");
    }
  };

  const handleValidateComponent = async () => {
    if (!canMutate || !currentComponent?.validation.enabled) return;
    setBusyAction("validation");
    try {
      const queued = await fetchJson<{ job_id: string }>(`/api/catalog/components/${encodeURIComponent(componentId)}/validate`, { method: "POST" });
      toast.message("KLC validation started.");
      let job: ValidationJob | null = null;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await sleep(1000);
        job = await fetchJson<ValidationJob>(`/api/catalog/validation/jobs/${encodeURIComponent(queued.job_id)}`);
        if (job.status === "completed" || job.status === "failed") break;
      }
      if (!job || job.status === "queued" || job.status === "running") throw new Error("Validation is still running. Refresh later to see its status.");
      if (job.status === "failed") throw new Error(job.error || job.message || "KLC validation failed.");
      if (!job.component) throw new Error(job.errors?.[0]?.error || "Validation did not return an updated component.");
      if (job.component.validation.status === "failed") toast.error("KLC validation found blocking errors.");
      else if (job.component.validation.status === "warning") toast.warning("KLC validation completed with warnings.");
      else toast.success("KLC validation passed.");
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction("");
    }
  };

  const handleDownloadAsset = async (asset: CatalogAsset) => {
    if (!currentComponent || !activeComponent || activeComponent.revision_id !== currentComponent.released_revision_id) {
      toast.info("Direct downloads are available for the released revision. Release this revision or open the released revision first.");
      return;
    }
    try {
      const manifest = await fetchJson<RemoteProviderManifest>(`/api/remote-provider/parts/${encodeURIComponent(componentId)}`);
      const downloadable = manifest.assets.find((entry) => entry.asset_type === asset.asset_type && entry.sha256 === asset.sha256)
        || manifest.assets.find((entry) => entry.asset_type === asset.asset_type && entry.name === asset.name);
      if (!downloadable?.download_url) throw new Error("This asset is not present in the released download manifest.");
      const anchor = document.createElement("a");
      anchor.href = downloadable.download_url;
      anchor.download = asset.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const relevantDiffState = diffPair ? diffLoadState : { status: "loaded", error: "" } satisfies EvidenceLoadState;
  const revisionsTabState = combinedEvidenceState([revisionsLoadState, relevantDiffState]);
  const reviewTabState = combinedEvidenceState([revisionsLoadState, reviewsLoadState, releasesLoadState, relevantDiffState]);
  const usageTabState = combinedEvidenceState([usageLoadState]);
  const auditTabState = combinedEvidenceState([auditLoadState, reviewsLoadState, releasesLoadState]);

  const retryActiveEvidence = () => {
    if (activeTab === "revisions" || activeTab === "review") {
      if (revisionsLoadRef.current.status === "error") setRevisionsLoad(IDLE_EVIDENCE);
      if (diffLoadRef.current.status === "error") setDiffLoad(IDLE_EVIDENCE);
    }
    if (activeTab === "review" || activeTab === "audit") {
      if (reviewsLoadRef.current.status === "error") setReviewsLoad(IDLE_EVIDENCE);
      if (releasesLoadRef.current.status === "error") setReleasesLoad(IDLE_EVIDENCE);
    }
    if (activeTab === "usage" && usageLoadRef.current.status === "error") setUsageLoad(IDLE_EVIDENCE);
    if (activeTab === "audit" && auditLoadRef.current.status === "error") setAuditLoad(IDLE_EVIDENCE);
    setEvidenceRetryKey((value) => value + 1);
  };

  if (componentLoading) return <LoadingState label="Opening component workspace…" />;
  if (componentError || !currentComponent || !activeComponent) return <ErrorState message={componentError || "Component data is unavailable."} onRetry={() => setRefreshKey((value) => value + 1)} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-card">
        <div className="px-4 py-3">
          <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onBack}><ArrowLeft className="h-3 w-3" /> {returnLabel}</Button>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate">{activeComponent.manufacturer || "Unspecified manufacturer"}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate text-foreground">{activeComponent.mpn || activeComponent.name}</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Library className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold tracking-tight">{activeComponent.name}</h2>
                <Badge>v{activeComponent.revision}</Badge>
                {historical ? <Badge variant="secondary">Historical</Badge> : <Badge variant="outline">Current</Badge>}
              </div>
              <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{activeComponent.description || `${activeComponent.manufacturer} ${activeComponent.mpn}` || "No description available."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={workflowStage(activeComponent) === "released" ? "success" : "neutral"}>{WORKFLOW_LABELS[workflowStage(activeComponent)]}</StatusBadge>
              <StatusBadge tone={activeComponent.validation.status === "failed" ? "danger" : activeComponent.validation.status === "warning" ? "warning" : activeComponent.validation.status === "passed" ? "success" : "neutral"}>{VALIDATION_LABELS[activeComponent.validation.status]}</StatusBadge>
              <StatusBadge tone={activeComponent.place_enabled ? "success" : activeComponent.availability_state === "files_partial" ? "warning" : activeComponent.availability_state === "metadata_only" ? "danger" : "neutral"}>{activeComponent.place_enabled ? "Placeable" : AVAILABILITY_LABELS[activeComponent.availability_state]}</StatusBadge>
              <Button size="sm" variant="outline" aria-label="Refresh component workspace" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-3 w-3" /> Refresh</Button>
            </div>
          </div>
        </div>

        {!historical && !canMutate ? (
          <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            You have read-only access to this component. Editing metadata and attaching
            assets need the Designer or Admin role.
            {user?.role === "qa" ? " QA Review actions remain available on the workflow panel." : ""}
          </div>
        ) : null}
        {historical ? (
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2 text-xs">
            <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Viewing immutable revision v{activeComponent.revision}. Editing and workflow actions are disabled.</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => updateParams({ revision: null, compare: null })}>Return to current v{currentComponent.revision}</Button>
          </div>
        ) : null}
        {historicalLoading ? (
          <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the requested immutable revision…</div>
        ) : null}
        {historicalError ? (
          <div className="flex items-center justify-between gap-3 border-t border-destructive bg-destructive/10 px-4 py-2 text-xs">
            <span className="flex items-center gap-2"><CircleAlert className="h-3.5 w-3.5 text-destructive" /> {historicalError}</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => updateParams({ revision: null, compare: null })}>Return to current revision</Button>
          </div>
        ) : null}

        <nav className="flex overflow-x-auto border-t px-3" aria-label="Component workspace sections">
          {COMPONENT_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={cn("flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", activeTab === id && "border-primary text-foreground")}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => updateParams({ componentTab: id, compare: id === "revisions" ? compareRevisionId : null })}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </nav>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto w-full max-w-screen-2xl p-4">
          {activeTab === "overview" ? <OverviewPanel component={activeComponent} canMutate={canMutate} onEdit={openMetadataEditor} /> : null}
          {activeTab === "assets" ? (
            <AssetsPanel
              component={activeComponent}
              canMutate={canMutate}
              busyAction={busyAction}
              onAttach={openAttachDialog}
              onDetachAsset={setDetachAsset}
              onDownload={(asset) => void handleDownloadAsset(asset)}
              onRegeneratePreviews={() => void handleRegeneratePreviews()}
              onValidate={() => void handleValidateComponent()}
              onRepresentationsChanged={() => {
                updateParams({ revision: null, compare: null });
                setRefreshKey((value) => value + 1);
              }}
            />
          ) : null}
          {activeTab === "revisions" ? (
            <EvidenceBoundary state={revisionsTabState} loadingLabel="Loading revision history and comparison evidence…" onRetry={retryActiveEvidence}>
              <RevisionsPanel
                revisions={revisions}
                currentRevisionId={currentComponent.revision_id}
                activeRevisionId={activeComponent.revision_id}
                diff={diff}
                diffLoading={diffLoadState.status === "loading"}
                onView={(revisionId) => updateParams({ revision: revisionId, compare: null })}
                onCompare={(before, after) => updateParams({ revision: after, compare: before, componentTab: "revisions" })}
                onCurrent={() => updateParams({ revision: null, compare: null })}
              />
            </EvidenceBoundary>
          ) : null}
          {activeTab === "review" ? (
            <EvidenceBoundary state={reviewTabState} loadingLabel="Loading revision, approval, and publication evidence…" onRetry={retryActiveEvidence}>
              <ReleaseReviewPanel component={activeComponent} currentComponent={currentComponent} historical={historical} reviews={reviews} releases={releases} diff={diff} diffLoading={diffLoadState.status === "loading"} user={user} onTransition={setTransitionTarget} />
            </EvidenceBoundary>
          ) : null}
          {activeTab === "usage" ? (
            <EvidenceBoundary state={usageTabState} loadingLabel="Loading project usage evidence…" onRetry={retryActiveEvidence}>
              <WhereUsedPanel usage={usage} projects={projects} />
            </EvidenceBoundary>
          ) : null}
          {activeTab === "audit" ? (
            <EvidenceBoundary state={auditTabState} loadingLabel="Loading audit-chain and release evidence…" onRetry={retryActiveEvidence}>
              <AuditPanel events={events} verification={verification} releases={releases} reviews={reviews} />
            </EvidenceBoundary>
          ) : null}
        </main>
      </ScrollArea>

      <Dialog open={Boolean(transitionTarget)} onOpenChange={(open) => { if (!open && !transitioning) { setTransitionTarget(null); setReviewNote(""); setOverrideReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transitionTarget ? `Move v${currentComponent.revision} to ${WORKFLOW_LABELS[transitionTarget]}` : "Workflow decision"}</DialogTitle>
            <DialogDescription>This decision is stored as structured review evidence and in the hash-chained audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="component-review-note">Review note {decisionNoteRequired ? "(required)" : "(recommended)"}</Label>
              <Textarea id="component-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={transitionTarget === "in_progress" && workflowStage(currentComponent) === "qa_review" ? "Describe the changes required before approval…" : "Summarize the evidence and decision…"} rows={4} />
            </div>
            {sameActorApproval ? (
              <div className="space-y-2 border border-destructive bg-destructive/10 p-3">
                <div className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 text-destructive" /><p className="text-xs">You created this revision. Administrator self-approval or self-publication is an emergency override and requires a separate justification.</p></div>
                <Label htmlFor="component-override-reason">Override justification (required)</Label>
                <Textarea id="component-override-reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Why could an independent reviewer not approve this revision?" rows={3} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={transitioning} onClick={() => setTransitionTarget(null)}>Cancel</Button>
            {/* Archiving pulls a component out of the library for every project
                that references it, and unlike the other transitions it is not
                part of a forward review path — so it is the one decision here
                that has to be held rather than clicked. Approve and release keep
                a plain button: their review note is already the deliberate step. */}
            {transitionTarget === "archived" ? (
              <HoldToConfirmButton disabled={transitioning} onConfirm={() => void handleTransition()} holdingLabel="Hold to archive…">
                {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                {transitioning ? "Archiving…" : "Hold to archive"}
              </HoldToConfirmButton>
            ) : (
              <Button variant="default" disabled={transitioning} onClick={() => void handleTransition()}>
                {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : transitionTarget === "done" || transitionTarget === "released" ? <PackageCheck className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}
                Confirm decision
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MetadataEditDialog
        open={metadataOpen}
        form={metadataForm}
        submitting={busyAction === "metadata"}
        onOpenChange={(open) => { setMetadataOpen(open); if (!open) setMetadataForm(null); }}
        onChange={setMetadataForm}
        onSubmit={() => void handleMetadataSave()}
      />

      <AssetAttachDialog
        assetType={attachAssetType}
        mode={attachMode}
        file={attachFile}
        targetLibrary={attachTargetLibrary}
        targetName={attachTargetName}
        counterpartAssets={currentComponent.assets.filter((asset) => attachAssetType === "symbol" ? asset.asset_type === "footprint" : attachAssetType === "footprint" ? asset.asset_type === "symbol" : false)}
        counterpartAssetId={attachCounterpartId}
        selectedLink={selectedLink}
        selection={importSelection}
        submitting={busyAction === "asset"}
        onOpenChange={(open) => { if (!open) resetAttachDialog(); }}
        onModeChange={setAttachMode}
        onFileChange={setAttachFile}
        onTargetLibraryChange={setAttachTargetLibrary}
        onTargetNameChange={setAttachTargetName}
        onCounterpartAssetChange={setAttachCounterpartId}
        onSelectedLinkChange={setSelectedLink}
        onSelectionChange={(selected) => setImportSelection((current) => current ? { ...current, selected } : current)}
        onUpload={() => void handleAssetUpload()}
        onLink={() => void handleAssetLink()}
      />

      <Dialog open={detachAsset !== null} onOpenChange={(open) => { if (!open && busyAction !== "detach-id") setDetachAsset(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detach {detachAsset?.name || "asset"}</DialogTitle>
            <DialogDescription>This creates a new revision without this file. A symbol or footprint that a representation still references must be reassigned first. Prior revisions and canonical files remain intact.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busyAction === "detach-id"} onClick={() => setDetachAsset(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busyAction === "detach-id"} onClick={() => void handleAssetDetachById()}>{busyAction === "detach-id" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Detach asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
