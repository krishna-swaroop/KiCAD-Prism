import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Columns2,
  ExternalLink,
  FileDiff,
  History,
  Layers3,
  Link2,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  UserRoundCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fetchJson } from "@/lib/api";
import { allowedWorkflowTransitions, workflowStage } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { User } from "@/types/auth";
import type {
  CatalogAuditEvent,
  CatalogAuditVerification,
  CatalogComponent,
  CatalogComponentUsage,
  CatalogComponentValidationEvidence,
  CatalogReleaseRecord,
  CatalogReviewDecision,
  CatalogRevisionDiff,
  CatalogRevisionDiffAsset,
  CatalogRevisionSummary,
  CatalogValidationStatus,
  WorkflowStage,
} from "@/types/catalog";
import type { Project } from "@/types/project";
import {
  DefinitionRows,
  EmptyState,
  formatDate,
  humanize,
  LoadingState,
  MetricCard,
  PanelCard,
  PreviewImage,
  shortHash,
} from "./library-component-chrome";
import type { EvidenceLoadState } from "./library-component-evidence";
import { LibraryPreviewViewport } from "./library-preview-viewport";

const WORKFLOW_LABELS: Record<WorkflowStage, string> = {
  open: "Open",
  in_progress: "In progress",
  qa_review: "QA review",
  done: "Approved",
  released: "Released",
  archived: "Archived",
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
          onPointerCancel={() => {
            // Capture is already released by the browser on cancel; dragging
            // must stop or the divider tracks a pointer that no longer exists.
            draggingRef.current = false;
          }}
          onLostPointerCapture={() => {
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
  const [requestedUnit, setActiveUnit] = useState(units[0] || 1);
  // Unlike the inspector's, this one is load-bearing: nothing here falls back,
  // so a unit that has left the set blanks both previews. Resolving it during
  // render removes the frame where that was on screen.
  const activeUnit = units.includes(requestedUnit) ? requestedUnit : (units[0] || 1);
  const beforePreview = beforePreviews.find((preview) => preview.unit === activeUnit);
  const afterPreview = afterPreviews.find((preview) => preview.unit === activeUnit);
  const unitLabel = beforePreview?.unitLabel || afterPreview?.unitLabel || `Unit ${activeUnit}`;

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

export function RevisionsPanel({
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
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">v{revision.version}</p>
                  <div className="flex shrink-0 gap-1">
                    {isCurrent ? <Badge>Current</Badge> : null}
                    <Badge variant="outline">{WORKFLOW_LABELS[revision.release_status]}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(revision.created_at)}</p>
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

export function ReleaseReviewPanel({
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

export function WhereUsedPanel({ usage, projects }: { usage: CatalogComponentUsage[]; projects: Project[] }) {
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

export function AuditPanel({
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

export function EvidenceBoundary({
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
