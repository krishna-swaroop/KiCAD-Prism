import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Clock3,
  Columns2,
  Download,
  Edit3,
  ExternalLink,
  FileBox,
  FileCheck2,
  FileDiff,
  GitCompareArrows,
  History,
  Library,
  Link2,
  Layers3,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  ShieldX,
  UserRoundCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import { allowedWorkflowTransitions, canWriteCatalog, workflowStage } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
  AvailabilityState,
  CatalogAsset,
  CatalogAuditEvent,
  CatalogAuditVerification,
  CatalogComponent,
  CatalogComponentValidationEvidence,
  CatalogComponentUsage,
  CatalogReviewDecision,
  CatalogReleaseRecord,
  CatalogRevisionDiff,
  CatalogRevisionDiffAsset,
  CatalogRevisionSummary,
  CatalogValidationStatus,
  ImportCompletedResponse,
  SelectionRequiredResponse,
  WorkflowStage,
} from "@/types/catalog";
import type { Project } from "@/types/project";
import { LibraryPreviewInspector, LibraryPreviewViewport } from "./library-preview-inspector";

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

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  value: "Value",
  description: "Description",
  datasheet_url: "Datasheet",
  manufacturer: "Manufacturer",
  mpn: "Manufacturer part number",
  category: "Category",
  package_name: "Package",
  vendor: "Vendor",
  vendor_part_number: "Vendor part number",
  mass_g: "Mass (g)",
  rqjc_c_w: "RθJC (°C/W)",
  rqjc_top_c_w: "RθJC top (°C/W)",
  temp_max_c: "Maximum temperature (°C)",
  temp_min_c: "Minimum temperature (°C)",
  power_dissipation_w: "Power dissipation (W)",
  rate: "Rate",
  sap_code: "SAP code",
};

const shortHash = (value: string, length = 10) => (value ? value.slice(0, length) : "—");

const formatDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const humanize = (value: string) =>
  value
    .replace(/^field:/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatBytes = (value?: number) => {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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

function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const variant = tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "danger" ? "destructive" : "outline";
  return <Badge variant={variant}>{children}</Badge>;
}

function MetricCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-lg">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function DefinitionRows({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 py-2 sm:grid-cols-3 sm:gap-3">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words text-xs font-medium sm:col-span-2">{row.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function PanelCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function PreviewImage({ previewId, label }: { previewId: string; label: string }) {
  return (
    <LibraryPreviewViewport viewportKey={previewId} className="h-64">
      <img
        src={`/api/catalog/previews/${encodeURIComponent(previewId)}`}
        alt={label}
        draggable={false}
        className="pointer-events-none h-full w-full select-none object-contain p-3"
      />
    </LibraryPreviewViewport>
  );
}

function OverviewPanel({ component, canMutate, onEdit }: { component: CatalogComponent; canMutate: boolean; onEdit: () => void }) {
  const requiredAttached = component.assets.filter((asset) => asset.required).length;
  const readyPreviews = component.previews.filter((preview) => preview.status === "ready").length;
  const engineeringRows = [
    { label: "Mass", value: component.mass_g ? `${component.mass_g} g` : "" },
    { label: "RθJC", value: component.rqjc_c_w ? `${component.rqjc_c_w} °C/W` : "" },
    { label: "RθJC top", value: component.rqjc_top_c_w ? `${component.rqjc_top_c_w} °C/W` : "" },
    { label: "Temperature range", value: component.temp_min_c || component.temp_max_c ? `${component.temp_min_c || "—"} to ${component.temp_max_c || "—"} °C` : "" },
    { label: "Power dissipation", value: component.power_dissipation_w ? `${component.power_dissipation_w} W` : "" },
    { label: "Rate", value: component.rate },
  ];
  const hasReadyPreviews = component.previews.some((preview) => preview.status === "ready");

  return (
    <div className="space-y-4">
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
            { label: "Stock", value: component.stock_quantity ? `${component.stock_quantity} ${component.stock_uom}` : "PLM sync not configured" },
          ]} />
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="Visual inspection" description={`${readyPreviews} generated preview${readyPreviews === 1 ? "" : "s"} for this revision.`}>
          {hasReadyPreviews ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["symbol", "footprint"] as const).map((kind) => <div key={kind} className="min-w-0"><p className="mb-2 text-xs font-medium capitalize">{kind}</p><LibraryPreviewInspector previews={component.previews} kind={kind} label={component.name} /></div>)}
            </div>
          ) : (
            <EmptyState icon={SearchCheck} title="No ready previews" detail="Generate previews before visual review." />
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

function AssetsPanel({
  component,
  canMutate,
  busyAction,
  onAttach,
  onDetach,
  onDownload,
  onRegeneratePreviews,
  onValidate,
}: {
  component: CatalogComponent;
  canMutate: boolean;
  busyAction: string;
  onAttach: (assetType: AssetType) => void;
  onDetach: (assetType: AssetType) => void;
  onDownload: (asset: CatalogAsset) => void;
  onRegeneratePreviews: () => void;
  onValidate: () => void;
}) {
  const groups = (["symbol", "footprint", "3dmodel", "spice"] as const).map((type) => ({
    type,
    assets: component.assets.filter((asset) => asset.asset_type === type),
  }));
  const hasReadyPreviews = component.previews.some((preview) => preview.status === "ready");
  const downloadsAvailable = component.revision_id === component.released_revision_id;

  return (
    <div className="space-y-4">
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
                {canMutate ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => onAttach(type)}><Upload className="h-3.5 w-3.5" />{assets.length && (type === "symbol" || type === "footprint") ? "Replace" : "Add"}</Button> : null}
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
                      </div>
                    </div>
                    <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>{asset.content_type || "Unknown content type"}</span>
                      <span>{formatBytes(asset.size_bytes)}</span>
                      <span className="truncate font-mono sm:col-span-2" title={asset.sha256}>{asset.sha256 ? `SHA-256 ${asset.sha256}` : `Asset ${asset.id}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CircleDashed} title={`No ${humanize(type)} asset`} detail={type === "symbol" || type === "footprint" ? "This required asset blocks place readiness." : "This optional asset has not been provided."} />
            )}
            {canMutate && assets.length ? (
              <div className="mt-3 border-t pt-3">
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={Boolean(busyAction)} onClick={() => onDetach(type)}>Detach {type === "symbol" || type === "footprint" ? "asset" : `all ${ASSET_LABELS[type].toLowerCase()} files`}</Button>
              </div>
            ) : null}
          </PanelCard>
        ))}
      </div>

      {hasReadyPreviews ? (
        <PanelCard title="Rendered previews" description="Visual evidence is revision-bound and available without opening KiCad.">
          <div className="grid gap-3 md:grid-cols-2">
            {(["symbol", "footprint"] as const).map((kind) => <div key={kind} className="min-w-0"><p className="mb-2 text-xs font-medium capitalize">{kind}</p><LibraryPreviewInspector previews={component.previews} kind={kind} label={component.name} /></div>)}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}

type VisualDiffMode = "side-by-side" | "overlay";
type DiffPreviewEvidence = CatalogRevisionDiffAsset["previews"][number];

const previewUrl = (previewId: string) => `/api/catalog/previews/${encodeURIComponent(previewId)}`;

function OverlayDifference({
  before,
  after,
  beforeVersion,
  afterVersion,
}: {
  before: DiffPreviewEvidence;
  after: DiffPreviewEvidence;
  beforeVersion: number;
  afterVersion: number;
}) {
  const [position, setPosition] = useState(50);
  const draggingRef = useRef(false);
  const updatePosition = useCallback((clientX: number, bounds: DOMRect) => {
    setPosition(Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100)));
  }, []);

  return (
    <LibraryPreviewViewport viewportKey={`${before.previewId}:${after.previewId}`} className="h-96">
      <div className="relative h-full w-full touch-none" aria-label="Drag the divider to compare preview revisions">
        <img src={previewUrl(before.previewId)} alt={`Before revision ${beforeVersion}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain p-3" />
        <div className="pointer-events-none absolute inset-0 bg-preview-surface" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img src={previewUrl(after.previewId)} alt={`After revision ${afterVersion}`} draggable={false} className="h-full w-full select-none object-contain p-3" />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Move visual diff comparison divider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          className="prism-preview-interaction absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
          style={{ left: `${position}%` }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            draggingRef.current = true;
            updatePosition(event.clientX, event.currentTarget.parentElement!.getBoundingClientRect());
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current) return;
            event.stopPropagation();
            updatePosition(event.clientX, event.currentTarget.parentElement!.getBoundingClientRect());
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            draggingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              setPosition((value) => Math.max(0, value - 5));
            }
            if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              setPosition((value) => Math.min(100, value + 5));
            }
          }}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-primary shadow-sm" />
          <span className="absolute left-1/2 top-1/2 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-primary bg-background text-primary shadow-sm" aria-hidden="true">⋮</span>
        </div>
        <span className="pointer-events-none absolute left-2 top-2 z-10 border bg-background/90 px-2 py-1 text-xs font-medium">Before · v{beforeVersion}</span>
        <span className="pointer-events-none absolute right-2 top-2 z-10 border bg-background/90 px-2 py-1 text-xs font-medium">After · v{afterVersion}</span>
      </div>
    </LibraryPreviewViewport>
  );
}

function diffPreviewEvidence(asset: CatalogRevisionDiffAsset | null): DiffPreviewEvidence[] {
  if (!asset) return [];
  if (asset.previews?.length) return asset.previews;
  if (!asset.previewId) return [];
  return [{
    previewId: asset.previewId,
    previewStatus: asset.previewStatus,
    previewSha256: "",
    previewGeneratorFingerprint: "",
    unit: 1,
    unitLabel: "Unit A",
  }];
}

function DiffEvidencePreview({ preview, label }: { preview?: DiffPreviewEvidence; label: string }) {
  if (!preview || preview.previewStatus !== "ready") return <div className="flex min-h-32 items-center justify-center border border-dashed bg-preview-surface text-xs text-muted-foreground">Not present</div>;
  return <PreviewImage previewId={preview.previewId} label={label} />;
}

function AssetRevisionVisualDiff({
  before,
  after,
  beforeVersion,
  afterVersion,
  mode,
  label,
}: {
  before: CatalogRevisionDiffAsset | null;
  after: CatalogRevisionDiffAsset | null;
  beforeVersion: number;
  afterVersion: number;
  mode: VisualDiffMode;
  label: string;
}) {
  const beforePreviews = diffPreviewEvidence(before);
  const afterPreviews = diffPreviewEvidence(after);
  const units = Array.from(new Set([...beforePreviews, ...afterPreviews].map((preview) => preview.unit))).sort((a, b) => a - b);
  const [activeUnit, setActiveUnit] = useState(units[0] || 1);
  const beforePreview = beforePreviews.find((preview) => preview.unit === activeUnit);
  const afterPreview = afterPreviews.find((preview) => preview.unit === activeUnit);
  const unitLabel = beforePreview?.unitLabel || afterPreview?.unitLabel || `Unit ${activeUnit}`;

  useEffect(() => {
    if (!units.includes(activeUnit)) setActiveUnit(units[0] || 1);
  }, [activeUnit, units]);

  return (
    <div className="space-y-2">
      {units.length > 1 ? (
        <div className="flex max-w-full gap-1 overflow-x-auto pb-1" role="tablist" aria-label={`${label} units to compare`}>
          {units.map((unit) => {
            const preview = beforePreviews.find((item) => item.unit === unit) || afterPreviews.find((item) => item.unit === unit);
            return <Button key={unit} size="sm" variant={activeUnit === unit ? "secondary" : "ghost"} className="h-7 shrink-0" role="tab" aria-selected={activeUnit === unit} onClick={() => setActiveUnit(unit)}>{preview?.unitLabel || `Unit ${unit}`}</Button>;
          })}
        </div>
      ) : null}
      {mode === "overlay" && beforePreview?.previewStatus === "ready" && afterPreview?.previewStatus === "ready" ? (
        <OverlayDifference before={beforePreview} after={afterPreview} beforeVersion={beforeVersion} afterVersion={afterVersion} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div><p className="mb-1 text-xs text-muted-foreground">Before · v{beforeVersion}{units.length > 1 ? ` · ${unitLabel}` : ""}</p><DiffEvidencePreview preview={beforePreview} label={`${label} before ${unitLabel}`} /></div>
          <div><p className="mb-1 text-xs text-muted-foreground">After · v{afterVersion}{units.length > 1 ? ` · ${unitLabel}` : ""}</p><DiffEvidencePreview preview={afterPreview} label={`${label} after ${unitLabel}`} /></div>
        </div>
      )}
    </div>
  );
}

function RevisionDiffView({ diff }: { diff: CatalogRevisionDiff }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualDiffMode>("overlay");
  const metadata = showUnchanged ? diff.metadataChanges : diff.metadataChanges.filter((change) => change.status !== "unchanged");
  const diffableAssets = diff.assetChanges.filter((change) => {
    const type = change.after?.assetType || change.before?.assetType;
    return type === "symbol" || type === "footprint";
  });
  const assets = showUnchanged ? diffableAssets : diffableAssets.filter((change) => change.status !== "unchanged");
  const changedAssetCount = diffableAssets.filter((change) => change.status !== "unchanged").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-3">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="outline">v{diff.before.version}</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <Badge>v{diff.after.version}</Badge>
          <span className="text-muted-foreground">{diff.summary.metadataChanges} metadata · {changedAssetCount} visual CAD changes</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowUnchanged((value) => !value)}>
          {showUnchanged ? "Hide unchanged" : "Show unchanged"}
        </Button>
      </div>

      <PanelCard title="Metadata diff" description="Fields are compared from immutable revision snapshots.">
        {metadata.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-2xl">
              <div className="grid grid-cols-3 gap-3 border-b pb-2 text-xs font-medium text-muted-foreground">
                <span>Field</span><span>Before · v{diff.before.version}</span><span>After · v{diff.after.version}</span>
              </div>
              {metadata.map((change) => (
                <div key={change.field} className="grid grid-cols-3 gap-3 border-b py-2 text-xs last:border-b-0">
                  <div className="flex min-w-0 items-start gap-2"><Badge variant={change.status === "unchanged" ? "outline" : "secondary"}>{change.status}</Badge><span>{FIELD_LABELS[change.field] || humanize(change.field)}</span></div>
                  <span className="break-words text-muted-foreground">{change.before || "—"}</span>
                  <span className="break-words font-medium">{change.after || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState icon={CheckCircle2} title="No metadata changes" detail="These revisions contain identical metadata." />}
      </PanelCard>

      <PanelCard
        title="Symbol and footprint diff"
        description="Pan, zoom, and swipe between revision-bound previews. 3D and SPICE assets remain versioned in the Assets tab."
        action={(
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Visual diff display mode">
            <Button size="sm" variant={visualMode === "side-by-side" ? "secondary" : "ghost"} aria-pressed={visualMode === "side-by-side"} onClick={() => setVisualMode("side-by-side")}><Columns2 className="h-3.5 w-3.5" /> Side by side</Button>
            <Button size="sm" variant={visualMode === "overlay" ? "secondary" : "ghost"} aria-pressed={visualMode === "overlay"} onClick={() => setVisualMode("overlay")}><Layers3 className="h-3.5 w-3.5" /> Overlay</Button>
          </div>
        )}
      >
        {assets.length ? (
          <div className="space-y-4">
            {assets.map((change) => (
              <div key={change.key} className="border p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{change.after?.targetName || change.before?.targetName || change.key}</p>
                    <p className="text-xs text-muted-foreground">{change.after?.assetType || change.before?.assetType}</p>
                  </div>
                  <Badge variant={change.status === "removed" ? "destructive" : change.status === "unchanged" ? "outline" : "secondary"}>{change.status}</Badge>
                </div>
                <AssetRevisionVisualDiff before={change.before} after={change.after} beforeVersion={diff.before.version} afterVersion={diff.after.version} mode={visualMode} label={change.key} />
              </div>
            ))}
          </div>
        ) : <EmptyState icon={CheckCircle2} title="No asset changes" detail="All attached files have the same content hashes." />}
      </PanelCard>
    </div>
  );
}

function RevisionsPanel({
  revisions,
  currentRevisionId,
  activeRevisionId,
  diff,
  diffLoading,
  onView,
  onCompare,
  onCurrent,
}: {
  revisions: CatalogRevisionSummary[];
  currentRevisionId: string;
  activeRevisionId: string;
  diff: CatalogRevisionDiff | null;
  diffLoading: boolean;
  onView: (revisionId: string) => void;
  onCompare: (before: string, after: string) => void;
  onCurrent: () => void;
}) {
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-4">
      <PanelCard
        className="xl:col-span-1"
        title="Revision history"
        description={`${revisions.length} immutable revision${revisions.length === 1 ? "" : "s"}.`}
        action={activeRevisionId !== currentRevisionId ? <Button size="sm" variant="outline" onClick={onCurrent}>Current</Button> : undefined}
      >
        <div className="space-y-2">
          {revisions.map((revision) => {
            const isActive = revision.id === activeRevisionId;
            const isCurrent = revision.id === currentRevisionId;
            return (
              <div key={revision.id} className={cn("border p-3", isActive && "border-primary bg-primary/5")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">v{revision.version}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(revision.created_at)}</p>
                  </div>
                  <div className="flex gap-1">
                    {isCurrent ? <Badge>Current</Badge> : null}
                    <Badge variant="outline">{WORKFLOW_LABELS[revision.release_status]}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs">{revision.change_summary || humanize(revision.change_kind)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{revision.created_by || "Unknown actor"}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant={isActive ? "secondary" : "outline"} onClick={() => onView(revision.id)}>View</Button>
                  {revision.id !== currentRevisionId ? <Button size="sm" variant="ghost" onClick={() => onCompare(revision.id, currentRevisionId)}>Compare current</Button> : revision.parent_revision_id ? <Button size="sm" variant="ghost" onClick={() => onCompare(revision.parent_revision_id, revision.id)}>Compare parent</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
      </PanelCard>

      <div className="xl:col-span-3">
        {diffLoading ? <LoadingState label="Calculating revision diff…" /> : diff ? <RevisionDiffView diff={diff} /> : (
          <EmptyState icon={FileDiff} title="Choose a comparison" detail="Compare a historical revision with the current revision, or compare the current revision with its parent." />
        )}
      </div>
    </div>
  );
}

type ReadinessCheck = { label: string; detail: string; passed: boolean };

function ReleaseRecordsPanel({
  releases,
  reviews,
  title = "Published releases",
}: {
  releases: CatalogReleaseRecord[];
  reviews: CatalogReviewDecision[];
  title?: string;
}) {
  return (
    <PanelCard title={title} description="Immutable publication records bind the released files to approval and policy evidence.">
      {releases.length ? (
        <div className="space-y-3">
          {releases.map((release) => {
            const approval = reviews.find((review) => review.id === release.approval_decision_id);
            const publication = reviews.find((review) =>
              review.revision_id === release.revision_id &&
              review.decision === "released" &&
              (!review.manifest_hash || review.manifest_hash === release.manifest_hash) &&
              (!release.released_by || review.reviewer === release.released_by)
            );
            const validationStatus = typeof release.validation.status === "string" ? release.validation.status : "Not recorded";
            const errorCount = typeof release.validation.error_count === "number" ? release.validation.error_count : null;
            const warningCount = typeof release.validation.warning_count === "number" ? release.validation.warning_count : null;
            const gate = typeof release.policy.klc_release_gate === "string" ? release.policy.klc_release_gate : "Not recorded";
            const twoPerson = typeof release.policy.two_person_approval === "boolean"
              ? release.policy.two_person_approval ? "Required" : "Not required"
              : "Not recorded";
            const override = approval?.decision === "emergency_override";
            return (
              <article key={release.id} className="border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{release.release_label || "Release"}</Badge>
                      <p className="text-sm font-medium">Published {formatDate(release.created_at)}</p>
                      {override ? <Badge variant="destructive">Emergency override</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Publisher: {release.released_by || "Legacy migration"}</p>
                  </div>
                  <Badge variant="outline">Validation: {humanize(validationStatus)}</Badge>
                </div>
                <div className="mt-4 grid gap-x-6 gap-y-3 lg:grid-cols-2">
                  <DefinitionRows rows={[
                    { label: "Revision ID", value: <span className="font-mono text-xs">{release.revision_id}</span> },
                    { label: "Manifest SHA-256", value: <span className="break-all font-mono text-xs">{release.manifest_hash}</span> },
                    { label: "Approver", value: approval ? `${approval.reviewer || "Unknown reviewer"}${approval.reviewer_role ? ` · ${humanize(approval.reviewer_role)}` : ""}` : "Approval record unavailable" },
                    { label: "Approval decision", value: approval ? humanize(approval.decision) : release.approval_decision_id ? <span className="font-mono text-xs">{release.approval_decision_id}</span> : "Legacy release without linked approval" },
                  ]} />
                  <DefinitionRows rows={[
                    { label: "Validation result", value: `${humanize(validationStatus)}${errorCount === null ? "" : ` · ${errorCount} errors`}${warningCount === null ? "" : ` · ${warningCount} warnings`}` },
                    { label: "KLC release gate", value: humanize(gate) },
                    { label: "Two-person approval", value: twoPerson },
                    { label: "Release record ID", value: <span className="font-mono text-xs">{release.id}</span> },
                  ]} />
                </div>
                {override ? (
                  <div className="mt-4 border border-destructive bg-destructive/10 p-3">
                    <p className="text-xs font-medium text-destructive">Override evidence</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs">{approval?.note || "Emergency override recorded without a narrative."}</p>
                  </div>
                ) : null}
                {publication?.note && publication.note !== approval?.note ? (
                  <div className="mt-4 border bg-muted/20 p-3">
                    <p className="text-xs font-medium">Publication evidence</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs">{publication.note}</p>
                  </div>
                ) : null}
                <details className="mt-4 border-t pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Inspect exact validation and policy snapshots</summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div><p className="mb-1 text-xs font-medium">Validation snapshot</p><pre className="max-h-64 overflow-auto border bg-muted/30 p-3 text-xs">{JSON.stringify(release.validation, null, 2)}</pre></div>
                    <div><p className="mb-1 text-xs font-medium">Policy snapshot</p><pre className="max-h-64 overflow-auto border bg-muted/30 p-3 text-xs">{JSON.stringify(release.policy, null, 2)}</pre></div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      ) : <EmptyState icon={PackageCheck} title="No publication records" detail="A release record will be created when an approved revision is published." />}
    </PanelCard>
  );
}

function validationBadgeVariant(status: CatalogValidationStatus) {
  if (status === "passed") return "success" as const;
  if (status === "warning") return "warning" as const;
  if (status === "failed") return "destructive" as const;
  return "outline" as const;
}

function KlcValidationEvidence({ component, historical }: { component: CatalogComponent; historical: boolean }) {
  const [evidence, setEvidence] = useState<CatalogComponentValidationEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (historical) {
      setEvidence(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchJson<CatalogComponentValidationEvidence>(
      `/api/catalog/components/${encodeURIComponent(component.id)}/validation`,
      { signal: controller.signal },
    ).then((response) => {
      if (!controller.signal.aborted) setEvidence(response);
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [component.id, historical]);

  const status = evidence?.summary.status || component.validation.status;
  const errorCount = evidence?.summary.error_count ?? component.validation.error_count;
  const warningCount = evidence?.summary.warning_count ?? component.validation.warning_count;

  const passed = status !== "failed" && errorCount === 0;
  return (
    <details className="group py-3 first:pt-0 last:pb-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">KLC validation</p>
          <p className="text-xs text-muted-foreground">{VALIDATION_LABELS[status]} · {errorCount} errors · {warningCount} warnings</p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>

      <div className="mt-3 space-y-3 border-t pt-3">
        {historical ? (
          <p className="border bg-muted/30 p-3 text-xs text-muted-foreground">Detailed KLC reports are currently available for the active revision. This historical revision retains its validation summary above.</p>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading validation evidence…</p>
        ) : error ? (
          <p className="border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">Could not load KLC results: {error}</p>
        ) : evidence?.runs.length ? evidence.runs.map((run) => (
          <article key={run.id} className="border bg-muted/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium">{humanize(run.asset_type)} · {run.checker_type}</p>
                  <Badge variant={validationBadgeVariant(run.status)}>{VALIDATION_LABELS[run.status]}</Badge>
                  {run.inherited ? <Badge variant="outline">Inherited evidence</Badge> : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{run.tool_version || "KiCad Library Convention"} · {formatDate(run.finished_at || run.created_at)}</p>
                {run.inherited_from_revision_id ? <p className="mt-1 truncate text-xs text-muted-foreground">CAD assets are unchanged; evidence is reused from revision {run.inherited_from_revision_id.slice(0, 8)}.</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs"><a href={run.reports.json} download>JSON</a></Button>
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs"><a href={run.reports.junit} download>JUnit</a></Button>
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs"><a href={run.reports.stdout} download>Stdout</a></Button>
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs"><a href={run.reports.stderr} download>Stderr</a></Button>
              </div>
            </div>
            {run.findings?.length ? (
              <div className="mt-3 max-h-64 overflow-y-auto border">
                <div className="divide-y divide-border">
                  {run.findings.map((finding) => (
                    <div key={finding.id} className="flex items-start gap-2 p-2 text-xs">
                      <Badge variant={finding.severity === "error" ? "destructive" : finding.severity === "warning" ? "warning" : "outline"}>{finding.severity}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="break-words">{finding.message}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                          {finding.rule_code ? <span className="font-mono">{finding.rule_code}</span> : null}
                          {finding.rule_url ? <a className="text-primary hover:underline" href={finding.rule_url} target="_blank" rel="noreferrer">Rule reference</a> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="mt-3 text-xs text-muted-foreground">No normalized findings were recorded for this run. Download the reports for checker output.</p>}
          </article>
        )) : (
          <p className="border border-dashed p-3 text-xs text-muted-foreground">No KLC run has been recorded for this revision yet. Run validation from the Assets tab.</p>
        )}
      </div>
    </details>
  );
}

function ReleaseReviewPanel({
  component,
  currentComponent,
  historical,
  reviews,
  releases,
  diff,
  diffLoading,
  user,
  onTransition,
}: {
  component: CatalogComponent;
  currentComponent: CatalogComponent;
  historical: boolean;
  reviews: CatalogReviewDecision[];
  releases: CatalogReleaseRecord[];
  diff: CatalogRevisionDiff | null;
  diffLoading: boolean;
  user: User | null;
  onTransition: (next: WorkflowStage) => void;
}) {
  const checks: ReadinessCheck[] = [
    { label: "Required CAD assets", detail: component.missing_assets.length ? `Missing ${component.missing_assets.join(", ")}` : "Symbol and footprint are attached", passed: component.missing_assets.length === 0 },
    { label: "KLC validation", detail: `${VALIDATION_LABELS[component.validation.status]} · ${component.validation.error_count} errors`, passed: component.validation.status !== "failed" && component.validation.error_count === 0 },
    { label: "Visual evidence", detail: `${component.previews.filter((preview) => preview.status === "ready").length} previews ready`, passed: component.previews.some((preview) => preview.kind === "symbol" && preview.status === "ready") && component.previews.some((preview) => preview.kind === "footprint" && preview.status === "ready") },
    { label: "Sourcing identity", detail: component.manufacturer && component.mpn ? `${component.manufacturer} · ${component.mpn}` : "Manufacturer or MPN is missing", passed: Boolean(component.manufacturer && component.mpn) },
    { label: "Revision manifest", detail: component.manifest_hash ? `SHA-256 ${shortHash(component.manifest_hash)}` : "Manifest has not been finalized", passed: Boolean(component.manifest_hash) },
  ];
  const activeReviews = reviews.filter((review) => review.revision_id === component.revision_id);
  const transitions = historical ? [] : allowedWorkflowTransitions(user?.role, currentComponent);

  return (
    <div className="space-y-4">
      {historical ? (
        <div className="flex items-start gap-3 border bg-muted/30 p-3 text-sm">
          <History className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div><p className="font-medium">Historical revision is read-only</p><p className="text-xs text-muted-foreground">Return to the current revision to perform a workflow transition.</p></div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="Release readiness" description="Evidence is evaluated against the exact revision under review.">
          <div className="divide-y divide-border">
            {checks.map((check) => (
              check.label === "KLC validation" ? <KlcValidationEvidence key={check.label} component={component} historical={historical} /> : (
                <div key={check.label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  {check.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 text-destructive" />}
                  <div><p className="text-sm font-medium">{check.label}</p><p className="text-xs text-muted-foreground">{check.detail}</p></div>
                </div>
              )
            ))}
          </div>
        </PanelCard>

        <PanelCard title="Decision" description="Every approval, rejection, override, and release is recorded separately from the audit log.">
          <div className="space-y-4">
            <DefinitionRows rows={[
              { label: "Current stage", value: WORKFLOW_LABELS[workflowStage(component)] },
              { label: "Revision owner", value: component.created_by },
              { label: "Reviewer", value: user?.email || "Signed-in user unavailable" },
              { label: "Evidence failures", value: String(checks.filter((check) => !check.passed).length) },
            ]} />
            <Separator />
            {transitions.length ? (
              <div className="flex flex-wrap gap-2">
                {transitions.map((next) => (
                  <Button key={next} variant={next === "archived" ? "destructive" : next === "done" || next === "released" ? "default" : "outline"} onClick={() => onTransition(next)}>
                    {next === "in_progress" && workflowStage(component) === "qa_review" ? "Request changes" : `Move to ${WORKFLOW_LABELS[next]}`}
                  </Button>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No transitions are available for your role from this stage.</p>}
          </div>
        </PanelCard>
      </div>

      <PanelCard title="Changes under review" description={component.parent_revision_id ? `Diff from parent to v${component.revision}.` : "The initial revision has no parent comparison."}>
        {diffLoading ? <LoadingState label="Loading review evidence…" /> : diff ? <RevisionDiffView diff={diff} /> : <EmptyState icon={FileDiff} title="No parent revision" detail="This is the first immutable revision for the component." />}
      </PanelCard>

      <PanelCard title="Structured review record" description="Review decisions remain queryable without parsing generic activity logs.">
        {activeReviews.length ? (
          <div className="divide-y divide-border">
            {activeReviews.map((review) => (
              <div key={review.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <UserRoundCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{humanize(review.decision)}</p><Badge variant="outline">v{component.revision}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{review.reviewer} · {formatDate(review.created_at)}</p>
                  {review.note ? <p className="mt-2 whitespace-pre-wrap text-xs">{review.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={UserRoundCheck} title="No decisions yet" detail="The first review action for this revision will appear here." />}
      </PanelCard>

      <ReleaseRecordsPanel releases={releases} reviews={reviews} />
    </div>
  );
}

function WhereUsedPanel({ usage, projects }: { usage: CatalogComponentUsage[]; projects: Project[] }) {
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.display_name || project.name])), [projects]);
  const referenceCount = new Set(usage.flatMap((entry) => entry.references.map((reference) => `${entry.project_id}:${entry.source_revision}:${reference}`))).size;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Projects" value={new Set(usage.map((entry) => entry.project_id)).size} detail="Unique imported projects" />
        <MetricCard label="Pinned revisions" value={usage.length} detail="Commit-specific usage records" />
        <MetricCard label="References" value={referenceCount} detail="Resolved schematic instances" />
      </div>
      <PanelCard title="Project usage" description="Every record is pinned to the source commit used during import.">
        {usage.length ? (
          <div className="divide-y divide-border">
            {usage.map((entry) => (
              <div key={entry.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-4 lg:items-center">
                <div className="lg:col-span-2">
                  <p className="text-sm font-medium">{projectNames.get(entry.project_id) || entry.project_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Last observed {formatDate(entry.last_seen_at)} · {humanize(entry.source)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {entry.references.length ? entry.references.map((reference) => <Badge key={reference} variant="secondary">{reference}</Badge>) : <span className="text-xs text-muted-foreground">No references recorded</span>}
                </div>
                <div className="flex items-center justify-between gap-2 lg:justify-end">
                  <span className="font-mono text-xs text-muted-foreground" title={entry.source_revision}>{shortHash(entry.source_revision)}</span>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/project/${encodeURIComponent(entry.project_id)}?commit=${encodeURIComponent(entry.source_revision)}`}>Open project <ExternalLink className="h-3 w-3" /></a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={Link2} title="No known usage" detail="Project imports will add commit-pinned references here. Absence is not proof that the part is unused outside Prism." />}
      </PanelCard>
    </div>
  );
}

function AuditPanel({
  events,
  verification,
  releases,
  reviews,
}: {
  events: CatalogAuditEvent[];
  verification: CatalogAuditVerification | null;
  releases: CatalogReleaseRecord[];
  reviews: CatalogReviewDecision[];
}) {
  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 border p-4", verification?.valid === false ? "border-destructive bg-destructive/10" : "bg-primary/5")}>
        {verification?.valid === false ? <ShieldX className="mt-0.5 h-5 w-5 text-destructive" /> : <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{verification?.valid === false ? "Audit chain verification failed" : "Audit chain verified"}</p>
            <Badge variant={verification?.valid === false ? "destructive" : "outline"}>{verification?.verified_count ?? 0}/{verification?.event_count ?? events.length} events</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{verification?.valid === false ? `First invalid event: ${verification.first_invalid_event_id}` : `Head SHA-256 ${verification?.head_hash || "No events"}`}</p>
        </div>
      </div>

      <ReleaseRecordsPanel releases={releases} reviews={reviews} title="Immutable release ledger" />

      <PanelCard title="Tamper-evident activity" description="Each event includes the previous event hash, actor, exact revision, and structured details.">
        {events.length ? (
          <ol className="space-y-0">
            {events.map((event, index) => {
              const details = Object.entries(event.details || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined);
              return (
                <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < events.length - 1 ? <span className="absolute left-2 top-5 h-full w-px bg-border" aria-hidden="true" /> : null}
                  <span className="relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center border bg-background"><span className="h-1.5 w-1.5 bg-primary" /></span>
                  <div className="min-w-0 flex-1 border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-sm font-medium">{humanize(event.event_type)}</p><p className="text-xs text-muted-foreground">{event.actor || "System"} · {formatDate(event.created_at)}</p></div>
                      <Badge variant="outline">{event.sequence ? `#${event.sequence}` : shortHash(event.id, 8)}</Badge>
                    </div>
                    {details.length ? (
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        {details.map(([key, value]) => <div key={key}><dt className="text-xs text-muted-foreground">{humanize(key)}</dt><dd className="break-words text-xs">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}
                      </dl>
                    ) : null}
                    <p className="mt-3 truncate font-mono text-xs text-muted-foreground" title={event.event_hash}>SHA-256 {event.event_hash}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <EmptyState icon={History} title="No audit events" detail="Finalized revisions and workflow changes will appear here." />}
      </PanelCard>
    </div>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Boxes; title: string; detail: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed p-6 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xl text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
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

type EvidenceLoadState = {
  status: "idle" | "loading" | "loaded" | "error";
  error: string;
  generation?: string;
};

const IDLE_EVIDENCE: EvidenceLoadState = { status: "idle", error: "" };

function useEvidenceLoadState() {
  const [state, setState] = useState<EvidenceLoadState>(IDLE_EVIDENCE);
  const stateRef = useRef<EvidenceLoadState>(IDLE_EVIDENCE);
  const update = useCallback((next: EvidenceLoadState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  return { state, stateRef, update };
}

function combinedEvidenceState(states: EvidenceLoadState[]): EvidenceLoadState {
  const failed = states.find((state) => state.status === "error");
  if (failed) return failed;
  if (states.some((state) => state.status !== "loaded")) return { status: "loading", error: "" };
  return { status: "loaded", error: "" };
}

function EvidenceBoundary({
  state,
  loadingLabel,
  onRetry,
  children,
}: {
  state: EvidenceLoadState;
  loadingLabel: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (state.status === "error") {
    return (
      <div className="flex min-h-64 items-center justify-center border border-destructive bg-destructive/10 p-6 text-center">
        <div className="max-w-xl">
          <CircleAlert className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-sm font-medium">This evidence could not be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">{state.error}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry this tab</Button>
        </div>
      </div>
    );
  }
  if (state.status !== "loaded") return <LoadingState label={loadingLabel} />;
  return children;
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
  const fields: Array<{ field: keyof MetadataForm; label: string; type?: string; placeholder?: string }> = [
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
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit component metadata</DialogTitle>
          <DialogDescription>Saving creates a new immutable revision. The current revision ID is checked to prevent overwriting concurrent work.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(({ field, label, type, placeholder }) => (
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

function AssetAttachDialog({
  assetType,
  mode,
  file,
  targetLibrary,
  targetName,
  links,
  selectedLink,
  selection,
  submitting,
  linksLoading,
  onOpenChange,
  onModeChange,
  onFileChange,
  onTargetLibraryChange,
  onTargetNameChange,
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
  links: string[];
  selectedLink: string;
  selection: AssetImportSelection | null;
  submitting: boolean;
  linksLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AssetAttachMode) => void;
  onFileChange: (file: File | null) => void;
  onTargetLibraryChange: (value: string) => void;
  onTargetNameChange: (value: string) => void;
  onSelectedLinkChange: (value: string) => void;
  onSelectionChange: (value: string) => void;
  onUpload: () => void;
  onLink: () => void;
}) {
  const label = assetType ? ASSET_LABELS[assetType] : "asset";
  return (
    <Dialog open={assetType !== null} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add or replace {label.toLowerCase()}</DialogTitle>
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
            <div className="flex items-center gap-1 border bg-muted/20 p-1" role="group" aria-label="Asset source">
              <Button size="sm" variant={mode === "upload" ? "secondary" : "ghost"} aria-pressed={mode === "upload"} onClick={() => onModeChange("upload")}><Upload className="h-3.5 w-3.5" /> Upload file</Button>
              <Button size="sm" variant={mode === "link" ? "secondary" : "ghost"} aria-pressed={mode === "link"} onClick={() => onModeChange("link")}><Link2 className="h-3.5 w-3.5" /> Link existing</Button>
            </div>
            <div className="space-y-4">
              {mode === "upload" ? (
                <div className="space-y-2">
                  <Label htmlFor="component-asset-file">{label} file</Label>
                  <Input id="component-asset-file" type="file" accept={assetType ? ASSET_ACCEPT[assetType] : undefined} onChange={(event) => onFileChange(event.target.files?.[0] || null)} />
                  {file ? <p className="text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p> : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="component-existing-asset">Existing file</Label>
                  <Select value={selectedLink} onValueChange={onSelectedLinkChange} disabled={linksLoading || links.length === 0}>
                    <SelectTrigger id="component-existing-asset"><SelectValue placeholder={linksLoading ? "Loading storage…" : links.length ? "Select a stored file" : "No compatible stored files"} /></SelectTrigger>
                    <SelectContent>{links.map((path) => <SelectItem key={path} value={path}>{path}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="component-asset-library">Target library</Label><Input id="component-asset-library" value={targetLibrary} onChange={(event) => onTargetLibraryChange(event.target.value)} placeholder="Prism library" /></div>
                {mode === "link" ? <div className="space-y-2"><Label htmlFor="component-asset-name">Target item name</Label><Input id="component-asset-name" value={targetName} onChange={(event) => onTargetNameChange(event.target.value)} placeholder="Auto-detect" /></div> : null}
              </div>
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
  const [revisions, setRevisions] = useState<CatalogRevisionSummary[]>([]);
  const [events, setEvents] = useState<CatalogAuditEvent[]>([]);
  const [verification, setVerification] = useState<CatalogAuditVerification | null>(null);
  const [usage, setUsage] = useState<CatalogComponentUsage[]>([]);
  const [reviews, setReviews] = useState<CatalogReviewDecision[]>([]);
  const [releases, setReleases] = useState<CatalogReleaseRecord[]>([]);
  const [diff, setDiff] = useState<CatalogRevisionDiff | null>(null);
  const [componentLoading, setComponentLoading] = useState(true);
  const [componentError, setComponentError] = useState("");
  const [componentGeneration, setComponentGeneration] = useState("");
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [evidenceRetryKey, setEvidenceRetryKey] = useState(0);
  const { state: revisionsLoadState, stateRef: revisionsLoadRef, update: setRevisionsLoad } = useEvidenceLoadState();
  const { state: reviewsLoadState, stateRef: reviewsLoadRef, update: setReviewsLoad } = useEvidenceLoadState();
  const { state: releasesLoadState, stateRef: releasesLoadRef, update: setReleasesLoad } = useEvidenceLoadState();
  const { state: usageLoadState, stateRef: usageLoadRef, update: setUsageLoad } = useEvidenceLoadState();
  const { state: auditLoadState, stateRef: auditLoadRef, update: setAuditLoad } = useEvidenceLoadState();
  const { state: diffLoadState, stateRef: diffLoadRef, update: setDiffLoad } = useEvidenceLoadState();
  const diffCacheRef = useRef(new Map<string, CatalogRevisionDiff>());
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
  const [availableLinks, setAvailableLinks] = useState<string[]>([]);
  const [selectedLink, setSelectedLink] = useState("");
  const [linksLoading, setLinksLoading] = useState(false);
  const [importSelection, setImportSelection] = useState<AssetImportSelection | null>(null);
  const [detachAssetType, setDetachAssetType] = useState<AssetType | null>(null);
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
  const needsRevisions = activeTab === "revisions" || activeTab === "review";
  const needsReviews = activeTab === "review" || activeTab === "audit";
  const needsReleases = activeTab === "review" || activeTab === "audit";
  const needsUsage = activeTab === "usage";
  const needsAudit = activeTab === "audit";
  const currentRevisionKey = currentComponent?.revision_id || "";
  const componentReady = Boolean(currentRevisionKey && componentGeneration === evidenceGeneration);

  useEffect(() => {
    setRevisions([]);
    setEvents([]);
    setVerification(null);
    setUsage([]);
    setReviews([]);
    setReleases([]);
    setDiff(null);
    diffCacheRef.current.clear();
    setRevisionsLoad(IDLE_EVIDENCE);
    setReviewsLoad(IDLE_EVIDENCE);
    setReleasesLoad(IDLE_EVIDENCE);
    setUsageLoad(IDLE_EVIDENCE);
    setAuditLoad(IDLE_EVIDENCE);
    setDiffLoad(IDLE_EVIDENCE);
  }, [
    componentId,
    refreshKey,
    setRevisionsLoad,
    setReviewsLoad,
    setReleasesLoad,
    setUsageLoad,
    setAuditLoad,
    setDiffLoad,
  ]);

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
      .then((component) => { if (!controller.signal.aborted) setActiveComponent(component); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setHistoricalError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setHistoricalLoading(false); });
    return () => controller.abort();
  }, [componentId, currentComponent, requestedRevisionId]);

  useEffect(() => {
    if (!componentReady || !needsRevisions || revisionsLoadRef.current.status !== "idle") return;
    const controller = new AbortController();
    let settled = false;
    setRevisionsLoad({ status: "loading", error: "", generation: evidenceGeneration });
    void fetchJson<{ items: CatalogRevisionSummary[] }>(`/api/catalog/components/${encodeURIComponent(componentId)}/revisions`, { signal: controller.signal })
      .then((response) => {
        settled = true;
        if (controller.signal.aborted) return;
        setRevisions(response.items);
        setRevisionsLoad({ status: "loaded", error: "", generation: evidenceGeneration });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (!controller.signal.aborted) setRevisionsLoad({ status: "error", error: reason instanceof Error ? reason.message : String(reason), generation: evidenceGeneration });
      });
    return () => {
      controller.abort();
      if (!settled) setRevisionsLoad(IDLE_EVIDENCE);
    };
  }, [componentId, componentReady, evidenceGeneration, evidenceRetryKey, needsRevisions, revisionsLoadRef, setRevisionsLoad]);

  useEffect(() => {
    if (!componentReady || !needsReviews || reviewsLoadRef.current.status !== "idle") return;
    const controller = new AbortController();
    let settled = false;
    setReviewsLoad({ status: "loading", error: "", generation: evidenceGeneration });
    void fetchJson<{ items: CatalogReviewDecision[] }>(`/api/catalog/components/${encodeURIComponent(componentId)}/reviews`, { signal: controller.signal })
      .then((response) => {
        settled = true;
        if (controller.signal.aborted) return;
        setReviews(response.items);
        setReviewsLoad({ status: "loaded", error: "", generation: evidenceGeneration });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (!controller.signal.aborted) setReviewsLoad({ status: "error", error: reason instanceof Error ? reason.message : String(reason), generation: evidenceGeneration });
      });
    return () => {
      controller.abort();
      if (!settled) setReviewsLoad(IDLE_EVIDENCE);
    };
  }, [componentId, componentReady, evidenceGeneration, evidenceRetryKey, needsReviews, reviewsLoadRef, setReviewsLoad]);

  useEffect(() => {
    if (!componentReady || !needsReleases || releasesLoadRef.current.status !== "idle") return;
    const controller = new AbortController();
    let settled = false;
    setReleasesLoad({ status: "loading", error: "", generation: evidenceGeneration });
    void fetchJson<{ items: CatalogReleaseRecord[] }>(`/api/catalog/components/${encodeURIComponent(componentId)}/releases`, { signal: controller.signal })
      .then((response) => {
        settled = true;
        if (controller.signal.aborted) return;
        setReleases(response.items);
        setReleasesLoad({ status: "loaded", error: "", generation: evidenceGeneration });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (!controller.signal.aborted) setReleasesLoad({ status: "error", error: reason instanceof Error ? reason.message : String(reason), generation: evidenceGeneration });
      });
    return () => {
      controller.abort();
      if (!settled) setReleasesLoad(IDLE_EVIDENCE);
    };
  }, [componentId, componentReady, evidenceGeneration, evidenceRetryKey, needsReleases, releasesLoadRef, setReleasesLoad]);

  useEffect(() => {
    if (!componentReady || !needsUsage || usageLoadRef.current.status !== "idle") return;
    const controller = new AbortController();
    let settled = false;
    setUsageLoad({ status: "loading", error: "", generation: evidenceGeneration });
    void fetchJson<{ items: CatalogComponentUsage[] }>(`/api/catalog/components/${encodeURIComponent(componentId)}/usage`, { signal: controller.signal })
      .then((response) => {
        settled = true;
        if (controller.signal.aborted) return;
        setUsage(response.items);
        setUsageLoad({ status: "loaded", error: "", generation: evidenceGeneration });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (!controller.signal.aborted) setUsageLoad({ status: "error", error: reason instanceof Error ? reason.message : String(reason), generation: evidenceGeneration });
      });
    return () => {
      controller.abort();
      if (!settled) setUsageLoad(IDLE_EVIDENCE);
    };
  }, [componentId, componentReady, evidenceGeneration, evidenceRetryKey, needsUsage, setUsageLoad, usageLoadRef]);

  useEffect(() => {
    if (!componentReady || !needsAudit || auditLoadRef.current.status !== "idle") return;
    const controller = new AbortController();
    let settled = false;
    setAuditLoad({ status: "loading", error: "", generation: evidenceGeneration });
    void Promise.all([
      fetchJson<{ items: CatalogAuditEvent[] }>(`/api/catalog/components/${encodeURIComponent(componentId)}/audit`, { signal: controller.signal }),
      fetchJson<CatalogAuditVerification>(`/api/catalog/components/${encodeURIComponent(componentId)}/audit/verify`, { signal: controller.signal }),
    ])
      .then(([eventList, auditVerification]) => {
        settled = true;
        if (controller.signal.aborted) return;
        setEvents(eventList.items);
        setVerification(auditVerification);
        setAuditLoad({ status: "loaded", error: "", generation: evidenceGeneration });
      })
      .catch((reason: unknown) => {
        settled = true;
        if (!controller.signal.aborted) setAuditLoad({ status: "error", error: reason instanceof Error ? reason.message : String(reason), generation: evidenceGeneration });
      });
    return () => {
      controller.abort();
      if (!settled) setAuditLoad(IDLE_EVIDENCE);
    };
  }, [auditLoadRef, componentId, componentReady, evidenceGeneration, evidenceRetryKey, needsAudit, setAuditLoad]);

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
    const cacheKey = `${componentId}:${diffPair.before}:${diffPair.after}`;
    const cached = diffCacheRef.current.get(cacheKey);
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
        diffCacheRef.current.set(cacheKey, value);
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
    setAvailableLinks([]);
    setSelectedLink("");
    setImportSelection(null);
  };

  const openAttachDialog = async (assetType: AssetType) => {
    if (!currentComponent || !canMutate) return;
    setAttachAssetType(assetType);
    setAttachMode("upload");
    setAttachFile(null);
    setAttachTargetLibrary(currentComponent.library_name || currentComponent.name);
    setAttachTargetName("");
    setSelectedLink("");
    setImportSelection(null);
    setLinksLoading(true);
    try {
      const response = await fetchJson<{ files: string[] }>(`/api/catalog/assets/browse?asset_type=${encodeURIComponent(assetType)}`);
      setAvailableLinks(response.files);
    } catch (reason) {
      setAvailableLinks([]);
      toast.error(reason instanceof Error ? reason.message : "Stored assets could not be listed.");
    } finally {
      setLinksLoading(false);
    }
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
        setImportSelection({ file: sourceFile, targetLibrary: attachTargetLibrary || currentComponent.name, options, selected: options[0] || "" });
        return;
      }
      toast.success(`${ASSET_LABELS[attachAssetType]} attached as a new revision.`);
      resetAttachDialog();
      updateParams({ revision: null, compare: null });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
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

  const handleAssetDetach = async () => {
    if (!detachAssetType || !canMutate) return;
    setBusyAction("detach");
    try {
      await fetchJson(`/api/catalog/components/${encodeURIComponent(componentId)}/assets/${encodeURIComponent(detachAssetType)}`, { method: "DELETE" });
      toast.success(`${ASSET_LABELS[detachAssetType]} detached in a new revision.`);
      setDetachAssetType(null);
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
            You have read-only access to this component. Editing metadata, attaching assets, and workflow
            decisions need the Component Designer or Admin role.
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
              onAttach={(assetType) => void openAttachDialog(assetType)}
              onDetach={setDetachAssetType}
              onDownload={(asset) => void handleDownloadAsset(asset)}
              onRegeneratePreviews={() => void handleRegeneratePreviews()}
              onValidate={() => void handleValidateComponent()}
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
        links={availableLinks}
        selectedLink={selectedLink}
        selection={importSelection}
        submitting={busyAction === "asset"}
        linksLoading={linksLoading}
        onOpenChange={(open) => { if (!open) resetAttachDialog(); }}
        onModeChange={setAttachMode}
        onFileChange={setAttachFile}
        onTargetLibraryChange={setAttachTargetLibrary}
        onTargetNameChange={setAttachTargetName}
        onSelectedLinkChange={setSelectedLink}
        onSelectionChange={(selected) => setImportSelection((current) => current ? { ...current, selected } : current)}
        onUpload={() => void handleAssetUpload()}
        onLink={() => void handleAssetLink()}
      />

      <Dialog open={detachAssetType !== null} onOpenChange={(open) => { if (!open && busyAction !== "detach") setDetachAssetType(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detach {detachAssetType ? ASSET_LABELS[detachAssetType].toLowerCase() : "asset"}</DialogTitle>
            <DialogDescription>This creates a new revision without the selected asset type. Canonical files and prior revisions remain intact.</DialogDescription>
          </DialogHeader>
          {detachAssetType === "3dmodel" || detachAssetType === "spice" ? <p className="text-sm text-muted-foreground">All attached {detachAssetType === "3dmodel" ? "3D model" : "SPICE model"} files will be detached from the new revision.</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={busyAction === "detach"} onClick={() => setDetachAssetType(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busyAction === "detach"} onClick={() => void handleAssetDetach()}>{busyAction === "detach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Detach asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
