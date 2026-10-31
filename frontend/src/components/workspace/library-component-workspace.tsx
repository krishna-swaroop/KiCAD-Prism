import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Boxes,
  CircleAlert,
  Clock3,
  Edit3,
  ExternalLink,
  FileBox,
  FileCheck2,
  GitCompareArrows,
  Link2,
  Loader2,
  PackageCheck,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { SupplyNavIcon } from "@/features/supply/supply-nav-icon";
import { inventoryWarnings } from "@/lib/inventory-presentation";
import {
  AVAILABILITY_BADGE_TITLE,
  AVAILABILITY_BADGE_VARIANT,
  VALIDATION_BADGE_VARIANT,
  WORKFLOW_BADGE_TITLE,
  WORKFLOW_BADGE_VARIANT,
} from "@/lib/catalog-badges";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StudioTabsList, StudioTabsTrigger } from "@/components/ui/studio-tabs";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  compareComponentRevisions,
  detachComponentAsset,
  getComponent,
  getComponentRevision,
  listComponentAudit,
  listComponentReleases,
  listComponentReviews,
  listComponentRevisions,
  listComponentUsage,
  regenerateComponentPreviews,
  releaseComponent,
  verifyComponentAudit,
} from "./catalog-client";
import { canAdministerCatalog, canOpenSupply, canReviewCatalogQa, canWriteCatalog, workflowStage } from "@/lib/roles";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@/types/auth";
import type {
  AvailabilityState,
  CatalogAsset,
  CatalogComponent,
  CatalogRevisionDiff,
  CatalogValidationStatus,
  WorkflowStage,
} from "@/types/catalog";
import type { Project } from "@/types/project";
import {
  DefinitionRows,
  EmptyState,
  humanize,
  LoadingState,
  MetricCard,
  PanelCard,
  shortHash,
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
import { AssetsPanel, ProvisionalNotice, isProvisionalPart } from "./library-component-assets";
import { MatesWithPanel } from "./library-component-mates";
import { ModelsPanel } from "./library-component-models";
import { LibraryPreviewPair } from "./library-preview-inspector";
import {
  ASSET_LABELS,
  AssetAttachDialog,
  assetAttachSessionFrom,
  type AssetAttachSession,
  type AssetType,
} from "./library-component-asset-dialog";
import {
  MetadataEditDialog,
  metadataEditSessionFrom,
  type MetadataEditSession,
} from "./library-component-metadata-dialog";
import { useReleasedAssetDownload } from "./library-component-asset-download";
import { resolveLibraryPreviewPairAssetIds } from "./library-preview-pair";
import { useLibraryComponentValidation } from "./library-component-validation";

type ComponentTab = "overview" | "assets" | "revisions" | "review" | "usage" | "sourcing" | "audit";

// Supply data is read-only for everyone who can read it, so the tab follows the Supply read role.
const SourcingPanel = lazy(() => import("@/features/supply/sourcing-panel"));
const BomWhereUsed = lazy(() => import("@/features/supply/bom-where-used"));

const COMPONENT_TABS: Array<{ id: ComponentTab; label: string; icon: typeof Boxes }> = [
  { id: "overview", label: "Overview", icon: Boxes },
  { id: "assets", label: "Assets", icon: FileBox },
  { id: "revisions", label: "Revisions / Compare", icon: GitCompareArrows },
  { id: "review", label: "Release Review", icon: UserRoundCheck },
  { id: "usage", label: "Where Used", icon: Link2 },
  { id: "sourcing", label: "Supply", icon: SupplyNavIcon },
  { id: "audit", label: "Audit", icon: ShieldCheck },
];

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
      {isProvisionalPart(component) ? <ProvisionalNotice /> : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="Release state" value={WORKFLOW_LABELS[workflowStage(component)]} detail={`Revision v${component.revision}`} />
        <MetricCard label="Required assets" value={`${requiredAttached}/${requiredAttached + component.missing_assets.length}`} detail={component.missing_assets.length ? `Missing ${component.missing_assets.join(", ")}` : "All required assets attached"} />
        <MetricCard label="Validation" value={VALIDATION_LABELS[component.validation.status]} detail={`${component.validation.error_count} errors · ${component.validation.warning_count} warnings`} />
        <MetricCard label="Project usage" value={component.place_enabled ? "Placeable" : "Not for new designs"} detail={`${AVAILABILITY_LABELS[component.availability_state]}${component.place_enabled ? "" : " · requires Released"}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard
          title="Component identity"
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

        <PanelCard title="Engineering data">
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
        <PanelCard title="Visual inspection">
          {hasRenderableAssets ? (
            <LibraryPreviewPair
              label={component.name}
              symbolAssetId={previewPair.symbolAssetId}
              footprintAssetId={previewPair.footprintAssetId}
            />
          ) : (
            <EmptyState icon={SearchCheck} title="No renderable assets" />
          )}
        </PanelCard>

        <PanelCard title="Revision provenance">
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
        <PanelCard title="Extended symbol fields">
          <DefinitionRows rows={Object.entries(component.extra_fields).map(([label, value]) => ({ label, value }))} />
        </PanelCard>
      ) : null}

      <MatesWithPanel componentId={component.id} canMutate={canMutate} />
      <ModelsPanel componentId={component.id} canMutate={canMutate} />
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
  const tabs = COMPONENT_TABS.filter((tab) => tab.id !== "sourcing" || canOpenSupply(user?.role));
  const activeTab: ComponentTab = requestedTab && tabs.some((tab) => tab.id === requestedTab) ? requestedTab : "overview";
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
  const [metadataSession, setMetadataSession] = useState<MetadataEditSession | null>(null);
  const [attachSession, setAttachSession] = useState<AssetAttachSession | null>(null);
  const [detachAsset, setDetachAsset] = useState<CatalogAsset | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const { runValidation, validationBusy } = useLibraryComponentValidation({
    componentId,
    onRefresh: () => setRefreshKey((value) => value + 1),
  });
  const activeBusyAction = busyAction || (validationBusy ? "validation" : "");
  const downloadReleasedAsset = useReleasedAssetDownload(componentId);

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
    void getComponent(componentId, controller.signal)
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
    void getComponentRevision(componentId, requestedRevisionId, controller.signal)
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

  useEvidenceResource({
    enabled: componentReady && needsRevisions,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: revisionsLoad,
    load: (signal) => listComponentRevisions(componentId, signal),
    onLoaded: (response) => publishEvidence("revisions", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsReviews,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: reviewsLoad,
    load: (signal) => listComponentReviews(componentId, signal),
    onLoaded: (response) => publishEvidence("reviews", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsReleases,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: releasesLoad,
    load: (signal) => listComponentReleases(componentId, signal),
    onLoaded: (response) => publishEvidence("releases", response.items),
  });

  useEvidenceResource({
    enabled: componentReady && needsUsage,
    generation: evidenceGeneration,
    retryKey: evidenceRetryKey,
    loadState: usageLoad,
    load: (signal) => listComponentUsage(componentId, signal),
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
        listComponentAudit(componentId, signal),
        verifyComponentAudit(componentId, signal),
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
    void compareComponentRevisions(componentId, diffPair.before, diffPair.after, controller.signal)
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
    canAdministerCatalog(user?.role) &&
    currentComponent &&
    (transitionTarget === "done" || transitionTarget === "released") &&
    (workflowStage(currentComponent) === "qa_review" || workflowStage(currentComponent) === "done") &&
    currentComponent.created_by &&
    currentComponent.created_by === user?.email
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
      await releaseComponent(componentId, {
        workflow_stage: transitionTarget,
        review_note: reviewNote.trim(),
        self_approval_override_reason: overrideReason.trim(),
        expected_manifest_hash: currentComponent.manifest_hash,
      }, currentComponent.revision_id);
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

  const refreshAfterMutation = () => {
    updateParams({ revision: null, compare: null });
    setRefreshKey((value) => value + 1);
  };

  const openMetadataEditor = () => {
    if (!currentComponent || !canMutate) return;
    setMetadataSession(metadataEditSessionFrom(currentComponent));
  };

  const openAttachDialog = (assetType: AssetType) => {
    if (!currentComponent || !canMutate) return;
    // A new session starts in upload mode. Stored files are only listed when
    // the user actually opens the "Link existing" picker.
    setAttachSession(assetAttachSessionFrom(currentComponent, assetType));
  };

  const handleAssetDetachById = async () => {
    if (!detachAsset || !canMutate || !currentComponent) return;
    setBusyAction("detach-id");
    try {
      await detachComponentAsset(componentId, detachAsset.id, currentComponent.revision_id);
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
      const updated = await regenerateComponentPreviews(componentId);
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

  const handleValidateComponent = () => {
    if (!canMutate || !currentComponent?.validation.enabled) return;
    void runValidation();
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
        <div className="flex min-h-11 flex-wrap items-center gap-2 px-2 py-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2" title={returnLabel} onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" />{returnLabel}</Button>
          <Separator orientation="vertical" className="h-5" />
          <h2 className="min-w-0 truncate text-sm font-semibold" title={activeComponent.description || undefined}>{activeComponent.name}</h2>
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={activeComponent.manufacturer || undefined}>{activeComponent.mpn}</span>
          <Badge variant={historical ? "warning" : "default"} title={historical ? "Historical revision" : "Current revision"}>v{activeComponent.revision}</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Badge variant={WORKFLOW_BADGE_VARIANT[workflowStage(activeComponent)]} title={WORKFLOW_BADGE_TITLE[workflowStage(activeComponent)]}>{WORKFLOW_LABELS[workflowStage(activeComponent)]}</Badge>
            <Badge variant={VALIDATION_BADGE_VARIANT[activeComponent.validation.status]} title={`${activeComponent.validation.error_count} errors · ${activeComponent.validation.warning_count} warnings`}>{VALIDATION_LABELS[activeComponent.validation.status]}</Badge>
            <Badge variant={activeComponent.place_enabled ? "success" : AVAILABILITY_BADGE_VARIANT[activeComponent.availability_state]} title={AVAILABILITY_BADGE_TITLE[activeComponent.availability_state]}>{activeComponent.place_enabled ? "Placeable" : AVAILABILITY_LABELS[activeComponent.availability_state]}</Badge>
            {!historical && !canMutate ? (
              <Badge variant="secondary" title={`Editing needs the Designer or Admin role${canReviewCatalogQa(user?.role) ? "; QA review stays available" : ""}`}><ShieldCheck className="h-3 w-3" />Read only</Badge>
            ) : null}
            <Button size="icon-sm" variant="ghost" aria-label="Refresh component workspace" title="Refresh" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {historical ? (
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-1.5 text-xs">
            <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />v{activeComponent.revision} · read only</span>
            <Button size="sm" variant="outline" className="h-7" aria-label={`Return to current v${currentComponent.revision}`} title="Return to the current revision" onClick={() => updateParams({ revision: null, compare: null })}>Current v{currentComponent.revision}</Button>
          </div>
        ) : null}
        {historicalLoading ? (
          <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground" role="status" aria-label="Loading revision"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
        ) : null}
        {historicalError ? (
          <div className="flex items-center justify-between gap-3 border-t border-destructive bg-destructive/10 px-3 py-1.5 text-xs">
            <span className="flex min-w-0 items-center gap-2"><CircleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" /><span className="truncate" title={historicalError}>{historicalError}</span></span>
            <Button size="sm" variant="outline" className="h-7" aria-label="Return to current revision" title="Return to the current revision" onClick={() => updateParams({ revision: null, compare: null })}>Current revision</Button>
          </div>
        ) : null}

        <div className="flex items-center overflow-x-auto border-t px-2 py-1.5">
          <Tabs value={activeTab} activationMode="manual" className="shrink-0">
            <StudioTabsList aria-label="Component workspace sections">
              {tabs.map(({ id, label, icon: Icon }) => (
                <StudioTabsTrigger
                  key={id}
                  value={id}
                  className="gap-1.5"
                  onClick={() => updateParams({ componentTab: id, compare: id === "revisions" ? compareRevisionId : null })}
                >
                  <Icon className="size-3.5" aria-hidden />{label}
                </StudioTabsTrigger>
              ))}
            </StudioTabsList>
          </Tabs>
        </div>
      </header>

      <ScrollArea className={`min-h-0 flex-1${activeTab === "sourcing" ? " themed-scrollbar" : ""}`}>
        <main className="mx-auto w-full max-w-screen-2xl p-3">
          {activeTab === "overview" ? <OverviewPanel component={activeComponent} canMutate={canMutate} onEdit={openMetadataEditor} /> : null}
          {activeTab === "assets" ? (
            <AssetsPanel
              component={activeComponent}
              canMutate={canMutate}
              busyAction={activeBusyAction}
              onAttach={openAttachDialog}
              onDetachAsset={setDetachAsset}
              onDownload={(asset) => {
                void downloadReleasedAsset(asset, currentComponent, activeComponent);
              }}
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
              <div className="space-y-4">
                <WhereUsedPanel usage={usage} projects={projects} />
                {canOpenSupply(user?.role) ? (
                  <Suspense fallback={null}>
                    <BomWhereUsed
                      manufacturer={activeComponent.manufacturer}
                      mpn={activeComponent.mpn}
                      knownProjectIds={new Set(usage.map((entry) => entry.project_id))}
                    />
                  </Suspense>
                ) : null}
              </div>
            </EvidenceBoundary>
          ) : null}
          {activeTab === "sourcing" ? (
            <Suspense fallback={<Skeleton className="h-40 w-full" aria-label="Loading supply" />}>
              <SourcingPanel componentId={activeComponent.id} manufacturer={activeComponent.manufacturer} mpn={activeComponent.mpn} user={user} />
            </Suspense>
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
            <DialogDescription className="sr-only">Recorded as review evidence and in the audit trail</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="component-review-note">Review note {decisionNoteRequired ? "(required)" : "(recommended)"}</Label>
              <Textarea id="component-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={transitionTarget === "in_progress" && workflowStage(currentComponent) === "qa_review" ? "Describe the changes required before approval…" : "Summarize the evidence and decision…"} rows={4} />
            </div>
            {sameActorApproval ? (
              <div className="space-y-2 border border-destructive bg-destructive/10 p-3">
                <div className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 text-destructive" /><p className="text-xs" title="Self-approval or self-publication is an emergency override">You created this revision: override</p></div>
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

      {metadataSession ? (
        <MetadataEditDialog
          key={metadataSession.openedAt}
          session={metadataSession}
          onClose={() => setMetadataSession(null)}
          onSuccess={() => {
            setMetadataSession(null);
            refreshAfterMutation();
          }}
        />
      ) : null}

      {attachSession ? (
        <AssetAttachDialog
          key={attachSession.openedAt}
          session={attachSession}
          onClose={() => setAttachSession(null)}
          onSuccess={() => {
            setAttachSession(null);
            refreshAfterMutation();
          }}
        />
      ) : null}

      <Dialog open={detachAsset !== null} onOpenChange={(open) => { if (!open && busyAction !== "detach-id") setDetachAsset(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detach {detachAsset?.name || "asset"}</DialogTitle>
            <DialogDescription>New revision without this file. Earlier revisions keep it.</DialogDescription>
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
