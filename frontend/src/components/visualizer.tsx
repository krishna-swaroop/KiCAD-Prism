import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo, useReducer } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Cpu, Box, FileText, CircuitBoard, Layers3, PackageCheck, MessageSquare, MessageSquarePlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EngineeringBomTable } from "./engineering-bom-table";
import { SelectionInspector, type HighlightedNetEntry } from "./selection-inspector";
import { filterLabelInstances, type LabelInstanceRef } from "@/lib/label-instances";
import { WebGpu3dTab } from "./webgpu-3d-tab";
import { PrismInsetScene3D } from "@/lib/inset-scene-3d";
import { EcadViewerPair, useEcadViewer, type EcadSource, type EcadViewer } from "@/lib/ecad-viewer";
import { MeasureReadout } from "./pcb-measure";
import { EcadViewerControls } from "./ecad-viewer-controls";
import { CommentForm, type CommentFormSubmitPayload } from "./comment-form";
import { CommentCard } from "./comment-card";
import { CommentPanel } from "./comment-panel";
import { ThreadUpdateContext } from "@/features/rich-comments/thread-updates";
import { useLiveComments } from "@/features/live-comments/use-live-comments";
import { ViewerOverlayRail, SELECTION_INSPECTOR_RAIL_RESIZE } from "./viewer-overlay-rail";
import { fetchApi, fetchDesignJson, fetchDesignText, DesignDataPendingError, ifMatch, readApiError } from "@/lib/api";
import { throwIfJobFailed } from "@/lib/jobs";
import { useJobWatcher } from "@/hooks/use-job-watcher";
import { canCommentOnProjects, canWriteCatalog } from "@/lib/roles";
import { crossProbeRequestForSelection, enrichPrismSelection, netStatisticsRefForSelection, normalizeEcadSelection } from "@/lib/prism-selection";
import {
    adoptViewerNets,
    highlightRefs,
    netFromSelection,
    removeHighlightedNet,
    sameHighlightedNet,
    toggleHighlightedNet,
    type HighlightedNet,
} from "@/lib/net-highlights";
import { NetHighlightBar } from "./net-highlight-bar";
import { selectionFromDesignSearchHit, type DesignSearchHit } from "@/lib/design-search";
import {
    commentIdFromOverlayHit,
    commentCurrentLocation,
    commentLocationFromArea,
    commentOverlaySet,
    normalizeComment,
    type ActiveSchematicPage,
} from "@/lib/comment-overlays";
import { DesignSearchField } from "./design-search-field";
import { DesignDataFailed, DesignDataPending, WorkingTreeDirtyNotice } from "./design-data-state";
import {
    requestedVariantFromSearchParams,
    resolveVariantSelection,
    variantSearchParams,
} from "./design-variants/variant-selection";
import { DesignVariantSelector } from "./design-variants/variant-selector";
import {
    VIEWER_TABS,
    commentModeAvailable,
    consumeElementEscape,
    elementModes,
    initialViewerModes,
    viewerKeyIntent,
    viewerModesReducer,
    type VisualizerTab,
} from "./viewer-modes";
import { usePrismCrossProbe } from "@/hooks/use-prism-cross-probe";
import { registerProjectViewerState } from "@/lib/project-viewer-state";
import { applyViewState } from "@/lib/view-state-apply";
import { buildViewStateParams, parseViewState } from "@/lib/view-state-url";
import {
    projectAssemblyState,
    physicalVisibility,
} from "@/lib/design-variants";
import { dnpVisibilityPlan, EMPTY_DNP_PLAN } from "./design-variants/dnp-visibility";
import {
    viewerVariantNotice,
    type ViewerVariantSync,
    type ViewerVariantTarget,
} from "@/lib/ecad-viewer-variant";
import type { User } from "@/types/auth";
import type {
    EcadSemanticSelectionDetail,
    EcadViewportInsets,
    EcadCommentAnchorResolution,
} from "@/types/ecad-viewer";
import type { PrismSelection, PrismSelectionContext, PrismSemanticIndex } from "@/types/prism-selection";
import type { Comment, MentionCandidate } from "@/types/comments";

interface VisualizerProps {
    projectId: string;
    user: User | null;
    commit?: string | null;
    active?: boolean;
    /** False when a commit was checked out from History; the BOM then shows no supply. */
    supplyAtHead?: boolean;
}

/** The toolbar follows VIEWER_TABS, which is also the 1–6 shortcut order. */
const TAB_LABELS: Record<VisualizerTab, { label: string; icon: LucideIcon }> = {
    sch: { label: "Schematic", icon: Cpu },
    pcb: { label: "PCB", icon: CircuitBoard },
    "3d": { label: "3D", icon: Box },
    bom: { label: "BOM", icon: FileText },
    stackup: { label: "Stackup", icon: Layers3 },
    assembly: { label: "Assembly Assistant", icon: PackageCheck },
};

function selectionContextForTab(tab: VisualizerTab): PrismSelectionContext {
    if (tab === "pcb") return "PCB";
    if (tab === "3d" || tab === "stackup") return "3D";
    if (tab === "bom" || tab === "assembly") return "BOM";
    return "SCH";
}

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

const buildViewerKey = (
    kind: "schematic" | "pcb",
    projectId: string,
    commit: string | null | undefined,
) => `${kind}:${projectId}:${commit ?? "latest"}`;

/** A load that failed for good; the adapter has already retried a lost decode race. */
function reportLoadError(cause: unknown) {
    // Left unhandled this surfaced only as an uncaught rejection in the
    // console, with the sheet stuck half-drawn and no hint why.
    console.error("[Visualizer] Could not load the sheet", cause);
    toast.error(
        cause instanceof Error && cause.message
            ? `Could not draw this sheet: ${cause.message}`
            : "Could not draw this sheet.",
    );
}

type EcadViewerHostProps = {
    viewer: EcadViewer;
    revisionKey: string;
    sources: EcadSource[];
    active: boolean;
    viewportInsets: EcadViewportInsets;
};

/** Mounts one element and hands it its sources, visibility and insets; the adapter does the rest. */
function EcadViewerHost({ viewer, revisionKey, sources, active, viewportInsets }: EcadViewerHostProps) {
    const left = viewportInsets.left ?? 0;
    const right = viewportInsets.right ?? 0;
    const top = viewportInsets.top ?? 0;
    const bottom = viewportInsets.bottom ?? 0;
    useLayoutEffect(() => {
        viewer.load(revisionKey, sources);
    }, [revisionKey, sources, viewer]);
    useEffect(() => viewer.setActive(active), [active, viewer]);
    useLayoutEffect(
        () => viewer.setViewportInsets({ left, right, top, bottom }),
        [bottom, left, right, top, viewer],
    );
    return (
        <ecad-viewer
            ref={viewer.attach}
            style={{ width: "100%", height: "100%" }}
            show-header="false"
            show-selection-panel="false"
            source-mode="host"
        />
    );
}

/**
 * Apply the URL's design variant to one element. The element owns replay
 * across source replacement and page switches (the reflected `variant`
 * attribute is durable); this covers a freshly mounted element and a ready
 * arriving after the selection. A bundle older than the vendored API is
 * reported, never skipped silently.
 */
function useViewerVariant(
    viewer: EcadViewer,
    target: ViewerVariantTarget,
    variant: string | null,
    report: (target: ViewerVariantTarget, result: ViewerVariantSync) => void,
) {
    const { element, generation } = useEcadViewer(viewer);
    useEffect(() => {
        let cancelled = false;
        void viewer.syncVariant(variant, () => !cancelled).then((result) => {
            if (result) report(target, result);
        });
        return () => { cancelled = true; };
    }, [element, generation, report, target, variant, viewer]);
}

/**
 * A design-data read that settled without data. A pending answer is not a
 * failure: it keeps its own state so a screen can offer "Check again" instead
 * of claiming the build failed.
 */
type DesignDataReadFailure =
    | { kind: "pending" }
    | { kind: "failed"; detail: string };

function designDataReadFailure(error: unknown, fallback: string): DesignDataReadFailure {
    if (error instanceof DesignDataPendingError) return { kind: "pending" };
    return { kind: "failed", detail: error instanceof Error ? error.message : fallback };
}

// react-doctor-disable-next-line no-giant-component - viewer event orchestration and the comment system share the viewer refs
export function Visualizer({ projectId, user, commit, active: viewerActive = true, supplyAtHead = true }: VisualizerProps) {
    // Open on the tab a caller asked for (e.g. clicking a changed .kicad_pcb in
    // the history file list), read once on mount; defaults to the schematic.
    const [searchParams, setSearchParams] = useSearchParams();
    // The view state a link carries: selected parts, highlighted nets, sheet,
    // framed region and insets (lib/view-state-url.ts).
    const requestedViewState = useMemo(() => parseViewState(searchParams), [searchParams]);
    const schematicViewerKey = buildViewerKey("schematic", projectId, commit);
    const pcbViewerKey = buildViewerKey("pcb", projectId, commit);
    // Tab, comment mode, the comment draft, the selected comment and the right
    // rail, and the rules between them (viewer-modes.ts).
    const [modes, dispatchMode] = useReducer(viewerModesReducer, searchParams.get("tab"), initialViewerModes);
    const activeTab = modes.tab;
    const setActiveTab = useCallback((tab: VisualizerTab) => dispatchMode({ type: "tab", tab }), []);
    // A navigation to another `tab` (window.prism.open, a link, Back) opens it.
    // The visualizer's own tab clicks do not write the URL, so only a changed
    // URL value moves the tab, never an unrelated query update.
    const urlTab = searchParams.get("tab");
    const lastUrlTab = useRef(urlTab);
    useEffect(() => {
        if (lastUrlTab.current === urlTab) return;
        lastUrlTab.current = urlTab;
        const tab = VIEWER_TABS.find((candidate) => candidate === urlTab);
        if (tab) dispatchMode({ type: "tab", tab });
    }, [urlTab]);
    // IN-61: T on a PCB inset shows the 3D tab's board, mounting the tab in
    // the background the first time.
    const [insetScene3d] = useState(() => new PrismInsetScene3D(() => dispatchMode({ type: "mount", view: "3d" })));
    useEffect(() => () => insetScene3d.dispose(), [insetScene3d]);
    // The schematic and board elements, their load and readiness, and the
    // inset links between them (lib/ecad-viewer.ts).
    const [viewers] = useState(() => new EcadViewerPair({ inset3d: insetScene3d, onLoadError: reportLoadError }));
    useEffect(() => () => viewers.dispose(), [viewers]);
    const sch = useEcadViewer(viewers.sch);
    const pcb = useEcadViewer(viewers.pcb);
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<EcadSource[]>([]);
    // Null until the request settles; the viewers wait for it.
    const [viewerSupportFiles, setViewerSupportFiles] = useState<EcadSource[] | null>(null);
    const [pcbContent, setPcbContent] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [schematicContentLoaded, setSchematicContentLoaded] = useState(false);
    const [pcbContentLoaded, setPcbContentLoaded] = useState(false);
    // The board loads without waiting for its tab, but not alongside the
    // schematic a user is looking at: on a large design the two share the
    // link and the board can be tens of MB. Once released it stays released,
    // so a tab switch never aborts a board read part way.
    const pcbLoadGate = activeTab !== "sch" || schematicContentLoaded;
    const [pcbLoadReleased, setPcbLoadReleased] = useState(pcbLoadGate);
    if (pcbLoadGate && !pcbLoadReleased) setPcbLoadReleased(true);
    const [schematicPending, setSchematicPending] = useState(false);
    const [pcbPending, setPcbPending] = useState(false);
    const [schematicError, setSchematicError] = useState<DesignDataReadFailure | null>(null);
    const [pcbError, setPcbError] = useState<DesignDataReadFailure | null>(null);
    const [workingTreeDirty, setWorkingTreeDirty] = useState(false);
    const [semanticIndex, setSemanticIndex] = useState<PrismSemanticIndex | null>(null);
    const [semanticIndexLoading, setSemanticIndexLoading] = useState(true);
    const [semanticIndexPending, setSemanticIndexPending] = useState(false);
    const [semanticIndexError, setSemanticIndexError] = useState<string | null>(null);
    const [semanticIndexRetryToken, setSemanticIndexRetryToken] = useState(0);
    const rightRailTab = modes.rightRail;
    const [schematicLeftInset, setSchematicLeftInset] = useState(0);
    const [pcbLeftInset, setPcbLeftInset] = useState(0);
    const [rightRailInset, setRightRailInset] = useState(0);
    const [componentImportPending, setComponentImportPending] = useState(false);
    const [navigatingLabelInstance, setNavigatingLabelInstance] = useState(false);
    // Track the active schematic page so comment overlay filtering can match
    // comments to the currently visible sheet.
    const activeSchematicPage = sch.activePage;

    // Comment collaboration state
    const { comments, setComments, refresh: refreshComments, status: commentConnectionStatus, error: commentsError,
        hasLoaded: commentsLoaded } = useLiveComments(projectId, { kind: "canvas", revision: commit ?? undefined });
    const [commentMarkerResolutions, setCommentMarkerResolutions] = useState<Record<string, EcadCommentAnchorResolution>>({});
    const { commentMode, draft: commentDraft, selectedCommentId } = modes;
    // Focus is an imperative viewer request, not render state. It is retried
    // when a tab/page change publishes the next set of overlay resolutions.
    const pendingCommentFocusRef = useRef<string | null>(null);
    const [commentCardScreenPosition, setCommentCardScreenPosition] = useState<{ x: number; y: number } | null>(null);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
    const lastSelectionRef = useRef<EcadSemanticSelectionDetail | null>(null);

    const {
        selection: globalSelection,
        isProbing: selectionIsProbing,
        select: selectGlobal,
        crossProbe: crossProbeGlobal,
        clear: clearGlobalSelection,
        registerClient,
        notifyClientReady,
    } = usePrismCrossProbe(semanticIndex);

    // The nets the reviewer has accumulated with shift-click (#305). The
    // visualizer owns this collection; the board viewer and the 3D viewer
    // project it. A double-click / search / schematic cross-probe replaces
    // it with that one net, Escape and Clear empty it, and an empty-canvas
    // click leaves it alone so a deselect never loses the build-up.
    const [highlightedNets, setHighlightedNets] = useState<HighlightedNet[]>([]);
    const clearHighlightedNets = useCallback(() => {
        setHighlightedNets((current) => (current.length ? [] : current));
    }, []);
    const toggleNetForSelection = useCallback((selection: PrismSelection) => {
        const net = netFromSelection(enrichPrismSelection(selection, semanticIndex), semanticIndex);
        if (!net) return;
        // A shift-click that takes a net out of the collection deselects it
        // too; the click that added it is what put it in the panel.
        const removing = highlightedNets.some((entry) => sameHighlightedNet(entry, net));
        setHighlightedNets((current) => toggleHighlightedNet(current, net));
        if (removing) clearGlobalSelection();
    }, [clearGlobalSelection, highlightedNets, semanticIndex]);
    // The inspected object follows the collection: when its net is dropped
    // (chip, panel row, or a second shift-click) the panel must not keep
    // describing a net that is no longer selected.
    const removeHighlighted = useCallback((net: HighlightedNet) => {
        setHighlightedNets((current) => removeHighlightedNet(current, net));
        const inspected = netFromSelection(globalSelection, semanticIndex);
        if (inspected && sameHighlightedNet(inspected, net)) clearGlobalSelection();
    }, [clearGlobalSelection, globalSelection, semanticIndex]);
    // Make a listed net the inspected object without moving any camera.
    const inspectHighlighted = useCallback((net: HighlightedNet) => {
        selectGlobal({
            kind: "net",
            sourceContext: selectionContextForTab(activeTab),
            netName: net.netName,
            netUid: net.netUid,
            netCode: net.netCode,
        });
    }, [activeTab, selectGlobal]);
    const fitHighlightedNets = useCallback(() => viewers.pcb.focusHighlightedNets(), [viewers]);
    // Escape and the bar's Clear drop the inspected object and the nets.
    const clearSelectionAndHighlights = useCallback(() => {
        clearGlobalSelection();
        clearHighlightedNets();
    }, [clearGlobalSelection, clearHighlightedNets]);
    // `window.prism.getState` reads the live viewer through this: the elements
    // for their own net/inset API, and the visualizer's selection for the part
    // the element API cannot report.
    useEffect(() => registerProjectViewerState(() => ({
        tab: activeTab,
        selection: globalSelection,
        highlightedNets,
        sch: viewers.sch.element,
        pcb: viewers.pcb.element,
    })), [activeTab, globalSelection, highlightedNets, pcb.element, sch.element, viewers]);
    // The index supplies the catalog and overlays atomically; there is no
    // independent catalog fetch or revision-reconciliation state.
    const requestedVariant = requestedVariantFromSearchParams(searchParams);
    const variantSelection = resolveVariantSelection(
        requestedVariant,
        semanticIndex,
        semanticIndexError,
    );
    const effectiveAssembly = useMemo(
        () =>
            semanticIndex
                ? projectAssemblyState(semanticIndex, variantSelection.effective)
                : null,
        [semanticIndex, variantSelection.effective],
    );
    // Presentation consumers read the effective projection; cross-probe
    // registration below keeps the base index so selection identities stay
    // stable while the projection changes.
    const effectiveComponents =
        effectiveAssembly?.components ?? semanticIndex?.components ?? null;
    // VAR-19: the 3D workspace hides unambiguous DNP models unless the local
    // Show DNP override is on. The plan is derived, never stored.
    const [showDnp, setShowDnp] = useState(false);
    const dnpPlan = useMemo(
        () =>
            semanticIndex
                ? dnpVisibilityPlan(
                    physicalVisibility(semanticIndex, variantSelection.effective),
                    showDnp,
                )
                : EMPTY_DNP_PLAN,
        [semanticIndex, showDnp, variantSelection.effective],
    );
    const handleVariantSelect = useCallback(
        (name: string | null) => {
            setSearchParams(variantSearchParams(searchParams, name), {
                replace: true,
            });
        },
        [searchParams, setSearchParams],
    );

    const reportedViewerVariantIssues = useRef(new Set<string>());
    const reportViewerVariantSync = useCallback(
        (target: ViewerVariantTarget, result: ViewerVariantSync) => {
            const notice = viewerVariantNotice(target, result);
            if (!notice) return;
            const key = `${target}:${result.state}:${result.requested ?? ""}`;
            if (reportedViewerVariantIssues.current.has(key)) return;
            reportedViewerVariantIssues.current.add(key);
            console.error(`[Visualizer] ${notice}`);
            toast.error(notice);
        },
        [],
    );
    useViewerVariant(viewers.sch, "schematic", variantSelection.effective, reportViewerVariantSync);
    useViewerVariant(viewers.pcb, "pcb", variantSelection.effective, reportViewerVariantSync);

    const canImportLibraryComponent = canWriteCatalog(user?.role);
    const canModifyComments = canCommentOnProjects(user?.role);

    const handleImportSelectedComponent = useCallback(async () => {
        if (!globalSelection || globalSelection.kind === "net" || componentImportPending) return;
        setComponentImportPending(true);
        try {
            const isComponent = globalSelection.kind === "component";
            const response = await fetchApi("/api/catalog/import-sessions/projects", {
                method: "POST",
                body: JSON.stringify({
                    scope: "component",
                    project_id: projectId,
                    source_revision: commit || "",
                    selection: {
                        component_uid: globalSelection.componentUid || "",
                        reference: globalSelection.reference,
                        schematic_uuid: isComponent && globalSelection.sourceContext === "SCH"
                            ? globalSelection.uuid || globalSelection.anchor?.uuid || ""
                            : "",
                        pcb_footprint_uuid: isComponent && globalSelection.sourceContext === "PCB"
                            ? globalSelection.uuid || globalSelection.anchor?.uuid || ""
                            : "",
                    },
                }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to stage component import"));
            const session = await response.json() as { id: string };
            toast.success(`${globalSelection.reference} queued for Library Manager import`, {
                action: {
                    label: "Open Import Center",
                    onClick: () => window.location.assign(`/?section=library-manager&libraryView=imports&session=${encodeURIComponent(session.id)}`),
                },
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to stage component import");
        } finally {
            setComponentImportPending(false);
        }
    }, [commit, componentImportPending, globalSelection, projectId]);

    const appendCommit = useCallback((url: string) => {
        if (!commit) return url;
        return `${url}${url.includes("?") ? "&" : "?"}commit=${encodeURIComponent(commit)}`;
    }, [commit]);

    // Initial Data Fetch
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        let cancelled = false;

        const fetchData = async () => {
            const baseUrl = `/api/projects/${projectId}`;

            try {
                const [ibomRes, mentionsRes] = await Promise.all([
                    fetchApi(appendCommit(`${baseUrl}/ibom`), { signal }),
                    fetchApi(`${baseUrl}/comments/mention-candidates`, { signal }),
                ]);
                // Only the status is wanted here: the Assembly tab's frame loads
                // the page itself, and the page is several MB.
                void ibomRes.body?.cancel().catch(() => undefined);
                if (cancelled) return;

                if (ibomRes.ok) {
                    setIbomUrl(appendCommit(`${baseUrl}/ibom`));
                } else {
                    setIbomUrl(null);
                }
                if (mentionsRes.ok) {
                    const candidates = await mentionsRes.json() as MentionCandidate[];
                    if (cancelled) return;
                    setMentionCandidates(candidates);
                } else {
                    setMentionCandidates([]);
                }

            } catch (err) {
                if (!cancelled && !isAbortError(err)) {
                    console.error("Error loading visualizer data", err);
                }
            } finally {
                // SCH/PCB source loading is intentionally independent of these helpers.
            }
        };

        void fetchData();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [projectId, appendCommit]);

    // The .kicad_pro and page layout the viewers load with each document. A
    // failed request settles to no files: the sheet still draws, with KiCad's
    // default page layout. Both viewers wait for it, as files arriving after
    // the sheet would reload the whole design.
    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        const fetchSupportFiles = async () => {
            let files: EcadSource[] = [];
            try {
                const { data, workingTreeDirty: dirty } = await fetchDesignJson<{ files?: EcadSource[] }>(
                    appendCommit(`/api/projects/${projectId}/viewer/support-files`),
                    { signal: controller.signal },
                    { fallbackError: "Could not load the viewer support files" },
                );
                files = data.files ?? [];
                if (!cancelled && dirty) setWorkingTreeDirty(true);
            } catch (err) {
                if (!cancelled && !isAbortError(err)) {
                    console.error("Error loading viewer support files", err);
                }
            }
            if (cancelled) return;
            setViewerSupportFiles(files);
        };

        void fetchSupportFiles();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [appendCommit, projectId]);

    useEffect(() => {
        if (semanticIndex) return;
        const controller = new AbortController();
        setSemanticIndexLoading(true);
        setSemanticIndexPending(false);
        setSemanticIndexError(null);
        // The compact identity artifact is generated independently from 3D
        // assets and loaded in the background. It never gates SCH/PCB source
        // rendering, but is ready before the first normal selection whenever
        // generation completes quickly. A pending answer retries and keeps the
        // loading state, so the BOM table and variant selector stay calm.
        fetchDesignJson<PrismSemanticIndex>(
            appendCommit(`/api/projects/${projectId}/semantic-index/identity`),
            { signal: controller.signal, credentials: "include" },
            {
                fallbackError: "Semantic identity index is unavailable",
                onPending: () => {
                    if (!controller.signal.aborted) setSemanticIndexPending(true);
                },
            },
        )
            .then(({ data, workingTreeDirty: dirty }) => {
                if (!controller.signal.aborted) {
                    setSemanticIndexPending(false);
                    setSemanticIndexError(null);
                    setSemanticIndex(data);
                    if (dirty) setWorkingTreeDirty(true);
                }
            })
            .catch((error: unknown) => {
                if (!isAbortError(error) && !controller.signal.aborted) {
                    if (error instanceof DesignDataPendingError) {
                        // Still building, not failed: keep the pending state and
                        // let "Check again" start another window.
                        setSemanticIndexPending(true);
                    } else {
                        setSemanticIndexPending(false);
                        setSemanticIndexError(error instanceof Error ? error.message : "Semantic identity index is unavailable");
                    }
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setSemanticIndexLoading(false);
                }
            });
        return () => controller.abort();
    }, [appendCommit, projectId, semanticIndex, semanticIndexRetryToken]);

    const watchJob = useJobWatcher();
    const retrySemanticIndexRead = useCallback(() => {
        setSemanticIndexRetryToken((token) => token + 1);
    }, []);
    const generateSemanticIdentity = useCallback(async () => {
        setSemanticIndexLoading(true);
        setSemanticIndexPending(false);
        setSemanticIndexError(null);
        try {
            const response = await fetchApi(`/api/projects/${projectId}/semantic-index/generate`, {
                method: "POST",
                body: JSON.stringify({ commit: commit ?? null, force: false }),
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, "Failed to generate semantic identity index"));
            }
            const payload = await response.json() as { job_id: string };
            if (payload.job_id) {
                const job = await watchJob(payload.job_id);
                throwIfJobFailed(job, "Failed to generate semantic identity index");
            }
            setSemanticIndexRetryToken((token) => token + 1);
        } catch (error) {
            setSemanticIndexLoading(false);
            // An abort means the visualizer went away while the job ran.
            if (isAbortError(error)) return;
            setSemanticIndexError(error instanceof Error ? error.message : "Failed to generate semantic identity index");
        }
    }, [commit, projectId, watchJob]);

    // Lazy load schematic content when schematic tab is first accessed
    useEffect(() => {
        if (activeTab === "sch" && !schematicContentLoaded) {
            const controller = new AbortController();
            const signal = controller.signal;
            let cancelled = false;
            setSchematicError(null);
            setSchematicPending(false);

            const loadSchematic = async () => {
                try {
                    const baseUrl = `/api/projects/${projectId}`;
                    const onPending = () => {
                        if (!cancelled) setSchematicPending(true);
                    };

                    const [schRes, subsheetsRes] = await Promise.allSettled([
                        fetchDesignText(appendCommit(`${baseUrl}/schematic`), { signal }, { onPending }),
                        fetchDesignJson<{ files?: { name?: string; path?: string; url: string; content?: string }[] }>(
                            appendCommit(`${baseUrl}/schematic/subsheets?include=content`),
                            { signal },
                            { onPending },
                        )
                    ]);
                    if (cancelled) return;

                    // Handle Schematic
                    if (schRes.status === "fulfilled") {
                        setSchematicContent(schRes.value.data);
                        if (schRes.value.workingTreeDirty) setWorkingTreeDirty(true);
                    } else {
                        const failure = designDataReadFailure(schRes.reason, "Schematic could not be loaded");
                        if (failure.kind === "failed") console.error("Schematic not found", schRes.reason);
                        setSchematicContent(null);
                        setSchematicError(failure);
                    }

                    // Handle Subsheets
                    if (subsheetsRes.status === "fulfilled") {
                        const data = subsheetsRes.value.data;
                        if (data.files?.length) {
                            const subsheetResults = await Promise.allSettled(data.files.map(async (f) => {
                                // The hierarchy read inlines each sheet's text;
                                // only entries past its size cap need their own read.
                                const content = f.content
                                    ?? (await fetchDesignText(f.url, { signal }, { onPending })).data;
                                let filename = f.name || f.path || f.url.split("/")?.pop() || "subsheet.kicad_sch";
                                if (!filename.endsWith('.kicad_sch')) filename += '.kicad_sch';
                                if (!filename.includes("/") && f.url.includes("Subsheets")) filename = `Subsheets/${filename}`;
                                return { filename, content };
                            }));

                            if (cancelled) return;

                            const loadedSubsheets: EcadSource[] = [];
                            for (const result of subsheetResults) {
                                if (result.status === "fulfilled") {
                                    loadedSubsheets.push(result.value);
                                } else {
                                    console.warn(
                                        "Failed to load one subsheet",
                                        result.reason,
                                    );
                                }
                            }
                            setSubsheets(loadedSubsheets);
                        }
                    } else {
                        setSubsheets([]);
                    }
                } catch (err) {
                    if (!cancelled && !isAbortError(err)) {
                        console.error("Error loading schematic content", err);
                    }
                } finally {
                    if (!cancelled) {
                        setSchematicPending(false);
                        setSchematicContentLoaded(true);
                    }
                }
            };

            void loadSchematic();
            return () => {
                cancelled = true;
                controller.abort();
            };
        }
    }, [activeTab, schematicContentLoaded, projectId, appendCommit]);

    // Load PCB content eagerly, not on first PCB-tab visit. Waiting until the tab
    // was opened left the board unloaded behind a "open the PCB tab" placeholder;
    // fetching up front means the board is ready the moment the tab is shown.
    // It starts once the schematic on screen has loaded (pcbLoadReleased).
    useEffect(() => {
        if (pcbContentLoaded || !pcbLoadReleased) return;
        const controller = new AbortController();
        const signal = controller.signal;
        let cancelled = false;
        setPcbError(null);
        setPcbPending(false);

        const loadPcb = async () => {
            try {
                const baseUrl = `/api/projects/${projectId}`;
                const loaded = await fetchDesignText(
                    appendCommit(`${baseUrl}/pcb`),
                    { signal },
                    { onPending: () => { if (!cancelled) setPcbPending(true); } },
                );
                if (!cancelled) {
                    setPcbContent(loaded.data);
                    if (loaded.workingTreeDirty) setWorkingTreeDirty(true);
                }
            } catch (err) {
                if (!cancelled) {
                    const failure = designDataReadFailure(err, "PCB source could not be loaded");
                    if (!isAbortError(err) && failure.kind === "failed") {
                        console.error("Error loading PCB content", err);
                    }
                    setPcbContent(null);
                    setPcbError(failure);
                }
            } finally {
                if (!cancelled) {
                    setPcbPending(false);
                    setPcbContentLoaded(true);
                }
            }
        };

        void loadPcb();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [pcbContentLoaded, pcbLoadReleased, projectId, appendCommit]);

    // A read that ended pending keeps its settled state so the view can offer
    // "Check again"; clearing the settled flag starts the read again.
    const retrySchematicRead = useCallback(() => {
        setSchematicError(null);
        setSchematicContentLoaded(false);
    }, []);
    const retryPcbRead = useCallback(() => {
        setPcbError(null);
        setPcbContentLoaded(false);
    }, []);

    // A different project or commit is a different visualizer, not this one
    // with twenty-three values put back. ProjectDetailPage keys this component
    // on that pair, so React discards the whole tree -- state, refs, and the
    // cross-probe hook's own selection, which lives here too -- and there is no
    // render where the previous board's state is still on screen.

    // What the elements report: inset mode on the schematic mounts the board
    // (insets need both), the board's measure mode ends comment mode, a
    // finished load re-dispatches an active cross-probe, and comment pins.
    useEffect(() => {
        const offInsets = viewers.sch.on("inset-mode", ({ on }) => {
            if (on) dispatchMode({ type: "mount", view: "pcb" });
        });
        const offMeasure = viewers.pcb.on("measure-mode", ({ on }) => dispatchMode({ type: "measure-mode", on }));
        const offReady = viewers.on("ready", (_, view) => {
            notifyClientReady(view === "sch" ? "visualizer-schematic" : "visualizer-pcb");
        });
        const offPin = viewers.on("comment-overlay-click", (detail) => {
            const commentId = commentIdFromOverlayHit(detail);
            if (!commentId) return;
            dispatchMode({ type: "select-comment", id: commentId });
            setCommentCardScreenPosition(viewers.get(detail.context === "SCH" ? "sch" : "pcb").screenPoint(detail.x, detail.y));
        });
        const offArea = viewers.on("comment-area", (detail) => {
            dispatchMode({ type: "comment-area", context: detail.context, location: commentLocationFromArea(detail) });
        });
        return () => {
            offInsets();
            offMeasure();
            offReady();
            offPin();
            offArea();
        };
    }, [notifyClientReady, viewers]);

    // Re-apply an active cross-probe when SCH/PCB becomes visible so hatch/net
    // Focus paints that ran while the canvas was hidden are rebuilt. For SCH,
    // also force the hierarchical page from the probe so the correct sheet is
    // visible when the user opens the tab after probing from PCB.
    useEffect(() => {
        if (activeTab === "pcb") {
            notifyClientReady("visualizer-pcb");
            return;
        }
        if (activeTab !== "sch") return;

        const selection = globalSelection;
        if (viewers.sch.element && selection) {
            const request = crossProbeRequestForSelection(selection, "SCH", semanticIndex);
            // Only force the page for a probe that arrived from somewhere else.
            //
            // This effect also runs on every selection change while the reviewer
            // is already in the schematic, and the page hint is derived from the
            // selection's own anchor. Clicking a hierarchical sheet symbol
            // anchors the selection to the *child* sheet, so forcing the page
            // here navigated into it: a single click opened the subsheet. The
            // viewer already reserves that for a double click. A selection made
            // in the schematic is by definition already on the right page.
            const arrivedFromElsewhere = selection.sourceContext !== "SCH";
            const shown = arrivedFromElsewhere && request.page ? viewers.sch.showPage(request.page) : null;
            if (shown) {
                void shown.finally(() => {
                    notifyClientReady("visualizer-schematic");
                });
                return;
            }
            // No resolvable page hint (common when the semantic index only has
            // human sheet paths). Still re-dispatch so uuid/designator lookup
            // can activate the correct hierarchical page.
            notifyClientReady("visualizer-schematic");
            return;
        }
        notifyClientReady("visualizer-schematic");
    }, [activeTab, globalSelection, notifyClientReady, semanticIndex, viewers]);

    // a2 carries the design key; a0 and a1 the revision key.
    const semanticKey = semanticIndex?.designKey ?? semanticIndex?.sourceRevisionKey;

    useEffect(() => {
        const revisionKey = semanticKey ?? commit ?? undefined;
        const offSelection = viewers.on("selection", (detail) => {
            lastSelectionRef.current = detail;
            const normalized = normalizeEcadSelection(detail, revisionKey);
            if (normalized) {
                selectGlobal(normalized);
                // A shift-click carries its intent on the event: toggle the
                // item's net in the collection as well as inspecting it.
                if (detail.operation === "toggle") toggleNetForSelection(normalized);
            } else {
                // Empty selection: a click on empty canvas away from any item.
                // Clear the current selection so it deselects and the selection
                // side panel closes, rather than leaving the last item stuck.
                clearGlobalSelection();
            }
        });
        const offProbe = viewers.on("crossprobe", (detail) => {
            lastSelectionRef.current = detail;
            const normalized = normalizeEcadSelection(detail, revisionKey);
            if (normalized) crossProbeGlobal(normalized);
        });
        // The board viewer reports the set whenever it changes it itself
        // (double-click cross-probe, clear), so the collection follows.
        const offNets = viewers.pcb.on("highlight-change", (detail) => {
            setHighlightedNets((current) => adoptViewerNets(current, detail.nets));
        });
        return () => {
            offSelection();
            offProbe();
            offNets();
        };
    }, [commit, clearGlobalSelection, crossProbeGlobal, selectGlobal, semanticKey, toggleNetForSelection, viewers]);

    // Project the collection onto the board. Keyed on the ready generation so
    // nets accumulated before the board finished loading are applied once it
    // has; a re-applied identical set is a no-op in the viewer.
    useEffect(() => {
        if (pcb.generation === 0) return;
        viewers.pcb.setHighlightedNets(highlightRefs(highlightedNets));
    }, [highlightedNets, pcb.element, pcb.generation, viewers]);

    useEffect(() => {
        const applySelection = (
            viewer: EcadViewer,
            targetContext: "SCH" | "PCB",
            selection: PrismSelection | null,
        ) => {
            if (!viewer.element) return;
            if (!selection) {
                // The collection is the visualizer's; deselecting the
                // inspected object must not drop it from the board.
                viewer.clearSelection();
                return;
            }
            const probe = viewer.requestCrossProbe(crossProbeRequestForSelection(selection, targetContext, semanticIndex));
            if (!probe) return;
            void (async () => {
                const resolved = await probe;
                if (!resolved && selection.kind === "terminal") {
                    await viewer.requestCrossProbe({
                        sourceContext: selection.sourceContext,
                        targetContext,
                        mode: "select",
                        kind: "designator",
                        value: selection.reference,
                        designator: selection.reference,
                        pin: selection.pin,
                    });
                }
            })();
        };

        const unregisterSchematic = registerClient({
            id: "visualizer-schematic",
            context: "SCH",
            revisionKey: semanticKey ?? commit ?? undefined,
            isReady: () => viewers.sch.isReady(buildViewerKey("schematic", projectId, commit)),
            applySelection: (selection) => applySelection(viewers.sch, "SCH", selection),
        });
        const unregisterPcb = registerClient({
            id: "visualizer-pcb",
            context: "PCB",
            revisionKey: semanticKey ?? commit ?? undefined,
            isReady: () => viewers.pcb.isReady(buildViewerKey("pcb", projectId, commit)),
            applySelection: (selection) => applySelection(viewers.pcb, "PCB", selection),
        });
        return () => {
            unregisterSchematic();
            unregisterPcb();
        };
    }, [commit, pcb.element, projectId, registerClient, sch.element, semanticIndex, semanticKey, viewers]);

    const handleDesignSearchPick = useCallback((hit: DesignSearchHit) => {
        const sourceContext = selectionContextForTab(activeTab);
        const currentPage = activeSchematicPage?.filename
            || activeSchematicPage?.page
            || activeSchematicPage?.projectPath
            || null;
        const selection = selectionFromDesignSearchHit(hit, sourceContext, currentPage);
        if (!selection) return;
        // Search is not a click inside a viewer, so the bus would skip the
        // source SCH/PCB client. Probe everyone, then apply to the source too.
        crossProbeGlobal(selection);
        if (sourceContext !== "SCH" && sourceContext !== "PCB") return;
        void viewers.get(sourceContext === "SCH" ? "sch" : "pcb").requestCrossProbe(
            crossProbeRequestForSelection(selection, sourceContext, semanticIndex),
        );
    }, [activeSchematicPage, activeTab, crossProbeGlobal, semanticIndex, viewers]);

    // Apply the URL's view state once the active view has loaded its document
    // and the semantic index is in, and again whenever the URL changes. A
    // reference in `sel` selects the way a design-search pick does, so the
    // selection panel, the other views and window.prism all see it; uuids,
    // the sheet, insets and the framed region go to the element directly,
    // with bbox last so it wins the camera.
    const appliedViewState = useRef<string | null>(null);
    useEffect(() => {
        if (!viewerActive) appliedViewState.current = null;
    }, [viewerActive]);
    useEffect(() => {
        if (!viewerActive || !semanticIndex) return;
        const view = activeTab === "sch" ? "sch" : activeTab === "pcb" ? "pcb" : null;
        if (!view) return;
        const viewerKey = view === "sch" ? schematicViewerKey : pcbViewerKey;
        const loaded = (view === "sch" ? sch.readyRevision : pcb.readyRevision) === viewerKey;
        const element = viewers.get(view).element;
        if (!loaded || !element) return;
        const signature = `${view}|${viewerKey}|${buildViewStateParams(requestedViewState).toString()}`;
        if (appliedViewState.current === signature) return;
        appliedViewState.current = signature;

        const selected = requestedViewState.sel ?? [];
        const firstComponent = selected
            .map((reference) => semanticIndex.components.find((entry) => entry.reference === reference))
            .find((component) => component !== undefined);
        const direct = {
            ...requestedViewState,
            // A sheet path belongs to the schematic; the board ignores it.
            page: view === "sch" ? requestedViewState.page : undefined,
            sel: selected.filter((item) => !semanticIndex.components.some((entry) => entry.reference === item)),
        };
        void (async () => {
            if (firstComponent) {
                handleDesignSearchPick({
                    kind: "component",
                    id: firstComponent.reference,
                    title: firstComponent.reference,
                    subtitle: "",
                    score: 0,
                    component: firstComponent,
                });
            }
            await applyViewState(element, direct);
        })();
        if (requestedViewState.nets?.length) {
            setHighlightedNets(requestedViewState.nets.map((netName) => ({ netName })));
        }
    }, [activeTab, handleDesignSearchPick, pcb.readyRevision, pcbViewerKey, requestedViewState, sch.readyRevision,
        schematicViewerKey, semanticIndex, setHighlightedNets, viewerActive, viewers]);

    // The active CAD view, or null on non-CAD tabs (3D, stackup, ...).
    const activeViewContext: "SCH" | "PCB" | null =
        activeTab === "pcb" ? "PCB" : activeTab === "sch" ? "SCH" : null;

    // Whether the selection card belongs on the active view.
    // Single-click: stay on SCH and PCB; close on 3D/stackup/BOM.
    // Double-click (cross-probe): stay on every tab.
    const selectionVisibleInActiveView = Boolean(
        globalSelection
        && (
            selectionIsProbing
            || activeTab === "sch"
            || activeTab === "pcb"
        ),
    );

    // The highlight collection is a selection in its own right on the CAD
    // views: the panel lists it even when nothing is inspected.
    const highlightsVisibleInActiveView = highlightedNets.length > 0 && activeViewContext !== null;
    const inspectorHasContent = (globalSelection !== null && selectionVisibleInActiveView) || highlightsVisibleInActiveView;

    // Nothing for this view (cleared, or a single-view selection that
    // belongs to the other view) closes the selection panel; comments stay.
    useEffect(() => {
        dispatchMode({ type: "inspector", hasContent: inspectorHasContent });
    }, [inspectorHasContent]);

    // Routed length / layers / counts for the selected net, read from the
    // board the PCB viewer has loaded. Keyed on the ready generation so a
    // selection made before the board finished parsing (SCH cross-probe, BOM)
    // fills in once it has.
    const netStatistics = useMemo(() => {
        const ref = netStatisticsRefForSelection(globalSelection);
        return ref ? viewers.pcb.getNetStatistics(ref) : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the board loads or is replaced
    }, [globalSelection, pcb.element, pcb.generation, viewers]);

    // The same summary for every highlighted net, so the panel can list the
    // whole collection (#305). Names the board does not know come back null.
    const highlightedNetEntries = useMemo<HighlightedNetEntry[]>(
        () => highlightedNets.map((net) => ({
            net,
            statistics: viewers.pcb.getNetStatistics({ name: net.netName, netCode: net.netCode }),
        })),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the board loads or is replaced
        [highlightedNets, pcb.element, pcb.generation, viewers],
    );

    // Layer name -> swatch color, read from the board so the inspector can
    // show a layer's color the same way the layer menu does.
    const layerColors = useMemo(
        () => Object.fromEntries((pcb.pcbViewState?.layers ?? []).map((layer) => [layer.name, layer.color])),
        [pcb.pcbViewState],
    );

    // Selection Next/Prev over the label instances sharing a schematic net's name.
    const labelInstances = useMemo<LabelInstanceRef[]>(() => {
        const selection = globalSelection;
        if (!selection || selection.kind !== "net" || selection.sourceContext !== "SCH") return [];
        return filterLabelInstances(viewers.sch.findLabelInstances(selection.netName), selection.anchor?.itemType);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the schematic element is replaced
    }, [globalSelection, sch.element, viewers]);

    const focusLabelInstance = useCallback(async (uuid: string) => {
        const focusing = viewers.sch.focusLabelInstance(uuid);
        if (!focusing) return;
        setNavigatingLabelInstance(true);
        try {
            await focusing;
        } finally {
            setNavigatingLabelInstance(false);
        }
    }, [viewers]);

    const navigateLabelInstance = useCallback(
        (direction: -1 | 1) => {
            if (labelInstances.length < 2) return;
            const activeUuid = globalSelection?.uuid || globalSelection?.anchor?.uuid;
            const currentIndex = Math.max(
                0,
                labelInstances.findIndex((instance) => instance.uuid === activeUuid),
            );
            const nextIndex =
                (currentIndex + direction + labelInstances.length) % labelInstances.length;
            const next = labelInstances[nextIndex];
            if (next) void focusLabelInstance(next.uuid);
        },
        [focusLabelInstance, globalSelection?.anchor?.uuid, globalSelection?.uuid, labelInstances],
    );

    const focusPendingComment = useCallback((
        resolutions: Record<string, EcadCommentAnchorResolution>,
        tab: VisualizerTab,
        page: ActiveSchematicPage | null,
    ) => {
        const id = pendingCommentFocusRef.current;
        if (!id) return;
        const comment = comments.find((entry) => entry.id === id);
        if (!comment) {
            pendingCommentFocusRef.current = null;
            return;
        }
        const expectedTab = comment.context === "SCH" ? "sch" : "pcb";
        if (tab !== expectedTab) return;
        if (expectedTab === "sch") {
            const targetPage = commentCurrentLocation(comment).page;
            const current = [page?.projectPath, page?.filename, page?.page];
            if (targetPage && !current.includes(targetPage)) {
                viewers.sch.switchPage(targetPage);
                return;
            }
        }
        const resolution = resolutions[id];
        if (!resolution || resolution.state === "not-loaded") return;
        pendingCommentFocusRef.current = null;
        if (resolution.state === "missing" || !resolution.location) {
            toast.message("This comment's source object is missing on this revision.");
            return;
        }
        const viewer = viewers.get(expectedTab);
        if (!viewer.element) return;
        if (resolution.location.page) viewer.switchPage(resolution.location.page);
        viewer.zoomToLocation(resolution.location.x, resolution.location.y);
        setCommentCardScreenPosition(viewer.screenPoint(resolution.location.x, resolution.location.y));
    }, [comments, viewers]);

    // Publish comment markers to the ecad-viewer overlay layer. This never
    // touches replaceSources/appendSources - overlays are a separate render pass.
    useEffect(() => {
        let resolutions: EcadCommentAnchorResolution[] = [];
        if (activeTab === "sch") {
            resolutions = viewers.sch.setCommentOverlays(commentOverlaySet(comments, "SCH", activeSchematicPage));
            viewers.pcb.clearCommentOverlays("PCB");
        } else if (activeTab === "pcb") {
            resolutions = viewers.pcb.setCommentOverlays(commentOverlaySet(comments, "PCB"));
            viewers.sch.clearCommentOverlays("SCH");
        } else {
            viewers.sch.clearCommentOverlays("SCH");
            viewers.pcb.clearCommentOverlays("PCB");
        }
        const byId = Object.fromEntries(resolutions.map((resolution) => [resolution.id, resolution]));
        setCommentMarkerResolutions(byId);
        focusPendingComment(byId, activeTab, activeSchematicPage);
    }, [activeTab, activeSchematicPage, comments, pcb.generation, pcb.element,
        sch.generation, sch.element, focusPendingComment, viewers]);

    // Apply the modes to each element: comment mode only on its own tab, and
    // the board stops measuring while comment mode is on.
    const schematicModes = elementModes(modes, "sch");
    const pcbModes = elementModes(modes, "pcb");
    useEffect(() => {
        viewers.sch.setCommentMode(schematicModes.commentMode);
    }, [schematicModes.commentMode, sch.element, viewers]);
    useEffect(() => {
        viewers.pcb.setCommentMode(pcbModes.commentMode);
        if (pcbModes.endMeasure) viewers.pcb.setMeasureMode(false);
    }, [pcbModes.commentMode, pcbModes.endMeasure, pcb.element, viewers]);

    const submitComment = useCallback(async (payload: CommentFormSubmitPayload) => {
        if (!commentDraft) return;
        const { context, location, element } = commentDraft;
        setIsSubmittingComment(true);
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments`, {
                method: "POST",
                body: JSON.stringify({
                    context,
                    location,
                    content: payload.content,
                    contentFormat: payload.contentFormat,
                    author: user?.name,
                    elementId: element?.elementId,
                    elementRef: element?.elementRef,
                    elementType: element?.elementType,
                    ...(element?.relativePoint
                        ? { metadata: { anchorRelativePoint: element.relativePoint } }
                        : {}),
                    commentClass: payload.commentClass,
                    severity: payload.severity,
                    mentions: payload.mentions,
                    ...(commit ? { revision: { commit } } : {}),
                }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to post comment"));
            const created = normalizeComment(await response.json() as Comment);
            setComments((prev) => [...prev, created]);
            dispatchMode({ type: "close-draft" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to post comment");
        } finally {
            setIsSubmittingComment(false);
        }
    }, [commit, commentDraft, projectId, setComments, user?.name]);

    const resolveComment = useCallback(async (commentId: string, resolved: boolean) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "PATCH",
                body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to update comment"));
            const updated = normalizeComment(await response.json() as Comment);
            setComments((prev) => prev.map((entry) => (entry.id === commentId
                ? { ...updated, anchorResolution: entry.anchorResolution } : entry)));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update comment");
        }
    }, [projectId, setComments]);

    const replyToComment = useCallback(async (commentId: string, content: string) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}/replies`, {
                method: "POST",
                body: JSON.stringify({ content, contentFormat: "md" }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to add reply"));
            const payload = await response.json() as { comment: Comment };
            setComments((prev) => prev.map((entry) => (entry.id === commentId
                ? { ...normalizeComment(payload.comment), anchorResolution: entry.anchorResolution } : entry)));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add reply");
        }
    }, [projectId, setComments]);

    const applyThread = useCallback((updated: Comment) => {
        setComments((prev) => prev.map((entry) => (entry.id === updated.id
            ? { ...normalizeComment(updated), anchorResolution: entry.anchorResolution } : entry)));
    }, [setComments]);

    const deleteComment = useCallback(async (commentId: string) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "DELETE",
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to delete comment"));
            setComments((prev) => prev.filter((entry) => entry.id !== commentId));
            dispatchMode({ type: "comment-deleted", id: commentId });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete comment");
        }
    }, [projectId, setComments]);

    const promoteComment = useCallback(async (commentId: string) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}/promote`, {
                method: "POST",
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to create issue"));
            refreshComments();
            toast.success("Issue publication queued.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create issue");
        }
    }, [projectId, refreshComments]);

    const retryCommentSync = useCallback(async (commentId: string) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}/tracker/retry`, {
                method: "POST",
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to retry issue sync"));
            refreshComments();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to retry issue sync");
        }
    }, [projectId, refreshComments]);

    const shareReply = useCallback(async (commentId: string, replyId: string) => {
        try {
            const response = await fetchApi(
                `/api/projects/${projectId}/comments/${commentId}/replies/${replyId}/share`,
                { method: "POST" },
            );
            if (!response.ok) throw new Error(await readApiError(response, "Failed to share reply"));
            refreshComments();
            toast.success("Reply queued for the linked issue.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to share reply");
        }
    }, [projectId, refreshComments]);

    const reattachComment = useCallback(async (comment: Comment) => {
        const selected = lastSelectionRef.current;
        if (!commit || !selected?.uuid || selected.x === undefined || selected.y === undefined
            || selected.sourceContext !== comment.context || !comment.revision) {
            toast.error("Select an object in the matching viewer revision before reattaching.");
            return;
        }
        const bounds = selected.bounds;
        const relativePoint = bounds && bounds[2] > 0 && bounds[3] > 0
            ? [
                Math.max(0, Math.min(1, (selected.x - bounds[0]) / bounds[2])),
                Math.max(0, Math.min(1, (selected.y - bounds[1]) / bounds[3])),
            ]
            : undefined;
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${comment.id}/reattach`, {
                method: "POST",
                headers: ifMatch("comment", comment.id, comment.revision),
                body: JSON.stringify({
                    commit,
                    elementId: selected.uuid,
                    relativePoint,
                    location: { x: selected.x, y: selected.y, layer: selected.layer ?? "", page: selected.page ?? "" },
                }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to reattach comment"));
            refreshComments();
            toast.success("Comment reattached on this revision.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to reattach comment");
        }
    }, [commit, projectId, refreshComments]);

    const handleCommentClick = useCallback((comment: Comment) => {
        dispatchMode({ type: "select-comment", id: comment.id });
        if (comment.anchorResolution?.state === "unresolved") {
            toast.message("This comment's anchor needs review on this revision.");
            return;
        }
        const targetTab: VisualizerTab = comment.context === "SCH" ? "sch" : "pcb";
        setActiveTab(targetTab);
        const location = commentCurrentLocation(comment);
        if (location.page) viewers.get(targetTab).switchPage(location.page);
        pendingCommentFocusRef.current = comment.id;
        focusPendingComment(commentMarkerResolutions, activeTab, activeSchematicPage);
    }, [activeSchematicPage, activeTab, commentMarkerResolutions, focusPendingComment, setActiveTab, viewers]);

    const selectedComment = useMemo(
        () => comments.find((entry) => entry.id === selectedCommentId) ?? null,
        [comments, selectedCommentId],
    );

    useEffect(() => {
        const handleKeyboard = (event: KeyboardEvent) => {
            const target = event.target;
            if (event.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"]')) return;
            if (
                target instanceof HTMLInputElement
                || target instanceof HTMLTextAreaElement
                || (target instanceof HTMLElement && target.isContentEditable)
            ) return;

            const intent = viewerKeyIntent(event, activeTab, canModifyComments);
            if (!intent) return;
            if (intent.kind === "escape") {
                const element = activeTab === "sch" || activeTab === "pcb" ? viewers.get(activeTab).element : null;
                if (consumeElementEscape(activeTab, element)) {
                    event.preventDefault();
                    return;
                }
                clearSelectionAndHighlights();
                lastSelectionRef.current = null;
                dispatchMode({ type: "escape" });
                return;
            }
            if (intent.kind === "tab") {
                dispatchMode({ type: "tab", tab: intent.tab });
                event.preventDefault();
                return;
            }
            if (intent.kind === "comment") {
                dispatchMode({ type: "comment-key", selection: lastSelectionRef.current });
                event.preventDefault();
                return;
            }
            const handled = intent.kind === "schematic-page"
                ? viewers.sch.navigateSchematicPage(intent.direction)
                : viewers.sch.navigateSchematicParent();
            if (handled) event.preventDefault();
        };
        // Capture before the embedded canvas can consume bracket/backspace keys.
        // ecad-viewer still receives every key Prism does not handle.
        window.addEventListener("keydown", handleKeyboard, true);
        return () => window.removeEventListener("keydown", handleKeyboard, true);
    }, [activeTab, canModifyComments, clearSelectionAndHighlights, viewers]);

    const schematicRootSource = useMemo<EcadSource | null>(
        () => (schematicContent ? { filename: "root.kicad_sch", content: schematicContent } : null),
        [schematicContent],
    );
    const schematicSources = useMemo<EcadSource[]>(
        () => (schematicRootSource
            ? [schematicRootSource, ...(viewerSupportFiles ?? []), ...subsheets]
            : []),
        [schematicRootSource, subsheets, viewerSupportFiles],
    );
    const pcbSources = useMemo<EcadSource[]>(
        () => (pcbContent
            ? [{ filename: "board.kicad_pcb", content: pcbContent }, ...(viewerSupportFiles ?? [])]
            : []),
        [pcbContent, viewerSupportFiles],
    );
    // One bundle failure fails the index and the open view alike; the view
    // below already says it, so the banner does not repeat the same text.
    const viewFailure = activeTab === "sch" ? schematicError : activeTab === "pcb" ? pcbError : null;
    const bannerIndexError = semanticIndexError
        && !(viewFailure?.kind === "failed" && viewFailure.detail === semanticIndexError)
        ? semanticIndexError
        : null;

    return (
        <div className="relative flex h-full min-h-0 flex-col bg-background">
            <DesignSearchField
                semanticIndex={semanticIndex}
                components={effectiveComponents}
                currentPage={activeSchematicPage?.filename || activeSchematicPage?.page || activeSchematicPage?.projectPath}
                loading={semanticIndexLoading}
                active={viewerActive}
                onPick={handleDesignSearchPick}
            />
            {/* Toolbar */}
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-2 py-1">
                {VIEWER_TABS.map((tab, index) => {
                    const { label, icon: Icon } = TAB_LABELS[tab];
                    return (
                        <Button
                            key={tab}
                            variant={activeTab === tab ? "secondary" : "ghost"}
                            size="sm"
                            data-visualizer-tab={tab}
                            onClick={() => setActiveTab(tab)}
                            title={`${label} (${index + 1})`}
                            className="text-xs h-8"
                        >
                            <Icon className="w-3 h-3 mr-2" />
                            {label}
                        </Button>
                    );
                })}
                <div className="flex-1" />
                {activeTab !== "assembly" && (
                    <DesignVariantSelector
                        resolution={variantSelection}
                        variants={semanticIndex?.assembly?.catalog ?? []}
                        requested={requestedVariant}
                        onSelect={handleVariantSelect}
                        onRetry={() => { void generateSemanticIdentity(); }}
                    />
                )}
                {commentModeAvailable(activeTab, canModifyComments) && (
                    <Button
                        variant={commentMode ? "default" : "ghost"}
                        size="sm"
                        className={
                            commentMode
                                ? "h-8 text-xs bg-warning text-warning-foreground hover:bg-warning/90"
                                : "h-8 text-xs"
                        }
                        aria-pressed={commentMode}
                        onClick={() => dispatchMode({ type: "toggle-comment-mode" })}
                    >
                        <MessageSquarePlus className="mr-2 h-3 w-3" />
                        Commenting Mode
                        <span
                            className={
                                commentMode
                                    ? "ml-2 rounded bg-warning-foreground/15 px-1 text-[10px]"
                                    : "ml-2 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                            }
                        >
                            C
                        </span>
                    </Button>
                )}
                <Button
                    variant={rightRailTab === "comments" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => dispatchMode({ type: "toggle-rail", tab: "comments" })}
                    className="text-xs h-8"
                    aria-pressed={rightRailTab === "comments"}
                >
                    <MessageSquare className="w-3 h-3 mr-2" />
                    Comments
                    {comments.length > 0 && (
                        <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                            {comments.length}
                        </span>
                    )}
                </Button>
            </div>

            {semanticIndexPending || bannerIndexError || workingTreeDirty ? (
                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/20 px-3 py-1.5">
                    {semanticIndexPending ? (
                        <DesignDataPending
                            className="text-xs"
                            onRetry={semanticIndexLoading ? undefined : retrySemanticIndexRead}
                        />
                    ) : null}
                    {bannerIndexError ? (
                        <DesignDataFailed
                            detail={bannerIndexError}
                            onRetry={() => { void generateSemanticIdentity(); }}
                            className="flex-row items-center gap-2 text-left"
                        />
                    ) : null}
                    {workingTreeDirty ? <WorkingTreeDirtyNotice /> : null}
                </div>
            ) : null}

            {/* Content Area */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="relative min-w-0 flex-1 overflow-hidden">
                    {/* Schematic View - always mounted after first visit */}
                    <div aria-hidden={activeTab !== "sch"} className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "sch" ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0"}`}>
                        {schematicContentLoaded && viewerSupportFiles ? (
                            schematicError ? (
                                <div className="flex h-full items-center justify-center p-8">
                                    {schematicError.kind === "pending" ? (
                                        <DesignDataPending onRetry={retrySchematicRead} />
                                    ) : (
                                        <DesignDataFailed detail={schematicError.detail} onRetry={retrySchematicRead} />
                                    )}
                                </div>
                            ) : schematicSources.length > 0 ? (
                                <div className="relative h-full min-w-0 overflow-hidden">
                                    <div className="absolute inset-0 min-h-0 min-w-0">
                                        <EcadViewerHost
                                            viewer={viewers.sch}
                                            revisionKey={schematicViewerKey}
                                            sources={schematicSources}
                                            active={viewerActive && activeTab === "sch"}
                                            viewportInsets={{
                                                left: schematicLeftInset,
                                                right: rightRailInset,
                                            }}
                                        />
                                    </div>
                                    <EcadViewerControls
                                        context="SCH"
                                        viewer={viewers.sch}
                                        onVisibleWidthChange={setSchematicLeftInset}
                                    />
                                    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-2">
                                        <MeasureReadout viewer={viewers.pcb} />
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-2">
                                        <NetHighlightBar
                                            nets={highlightedNets}
                                            onRemove={removeHighlighted}
                                            onClear={clearSelectionAndHighlights}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-muted-foreground">
                                    <p>No schematic files found.</p>
                                </div>
                            )
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                {schematicPending ? (
                                    <DesignDataPending />
                                ) : (
                                    <p>Loading schematic…</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* PCB View - always mounted after first visit */}
                    <div aria-hidden={activeTab !== "pcb"} className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "pcb" ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0"}`}>
                        {!modes.mounted.pcb ? null : pcbContentLoaded && viewerSupportFiles ? (
                            pcbError ? (
                                <div className="flex h-full items-center justify-center p-8">
                                    {pcbError.kind === "pending" ? (
                                        <DesignDataPending onRetry={retryPcbRead} />
                                    ) : (
                                        <DesignDataFailed detail={pcbError.detail} onRetry={retryPcbRead} />
                                    )}
                                </div>
                            ) : pcbSources.length > 0 ? (
                                <div className="relative h-full min-w-0 overflow-hidden">
                                    <div className="absolute inset-0 min-h-0 min-w-0">
                                        <EcadViewerHost
                                            viewer={viewers.pcb}
                                            revisionKey={pcbViewerKey}
                                            sources={pcbSources}
                                            active={viewerActive && activeTab === "pcb"}
                                            viewportInsets={{
                                                left: pcbLeftInset,
                                                right: rightRailInset,
                                            }}
                                        />
                                    </div>
                                    <EcadViewerControls
                                        context="PCB"
                                        viewer={viewers.pcb}
                                        onVisibleWidthChange={setPcbLeftInset}
                                    />
                                    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-2">
                                        <MeasureReadout viewer={viewers.pcb} />
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-2">
                                        <NetHighlightBar
                                            nets={highlightedNets}
                                            onRemove={removeHighlighted}
                                            onClear={clearSelectionAndHighlights}
                                            onFit={fitHighlightedNets}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-muted-foreground">
                                    <p>No PCB files found.</p>
                                </div>
                            )
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                {pcbPending ? (
                                    <DesignDataPending />
                                ) : (
                                    <p>Loading the board source…</p>
                                )}
                            </div>
                        )}
                    </div>

                    {modes.mounted["3d"] && (
                        <div aria-hidden={activeTab !== "3d" && activeTab !== "stackup"} className={`absolute inset-0 bg-background transition-opacity duration-200 ${activeTab === "3d" || activeTab === "stackup" ? "visible z-20 pointer-events-auto opacity-100" : "invisible z-0 pointer-events-none opacity-0"}`}>
                            <WebGpu3dTab
                                projectId={projectId}
                                commit={commit}
                                user={user}
                                active={viewerActive && (activeTab === "3d" || activeTab === "stackup")}
                                workspace={activeTab === "stackup" ? "stackup" : "pcb"}
                                selection={globalSelection}
                                highlightedNets={highlightedNets}
                                onSelection={crossProbeGlobal}
                                onClearSelection={clearGlobalSelection}
                                hiddenComponents={dnpPlan.hidden}
                                ambiguousComponents={dnpPlan.ambiguous}
                                showDnp={showDnp}
                                onShowDnpChange={setShowDnp}
                                insetScene={insetScene3d}
                            />
                        </div>
                    )}

                    {activeTab === "bom" && (
                        <div className="absolute inset-0 z-20 bg-background">
                            <EngineeringBomTable
                                projectId={projectId}
                                atHead={supplyAtHead}
                                semanticIndex={semanticIndex}
                                components={effectiveComponents}
                                user={user}
                                loading={semanticIndexLoading}
                                pending={semanticIndexPending}
                                error={semanticIndexError}
                                selection={globalSelection}
                                onSelection={crossProbeGlobal}
                                onRetry={() => {
                                    if (semanticIndexError) void generateSemanticIdentity();
                                    else retrySemanticIndexRead();
                                }}
                            />
                        </div>
                    )}

                    {activeTab === "assembly" && (
                        <div className="absolute inset-0 z-20 flex flex-col bg-background">
                            {requestedVariant && (
                                <div className="shrink-0 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                    This committed assembly artifact does not
                                    follow the selected design variant.
                                </div>
                            )}
                            <div className="min-h-0 flex-1">
                                {ibomUrl ? (
                                    <iframe
                                        title="Assembly Assistant"
                                        src={ibomUrl}
                                        className="h-full w-full border-0 bg-background"
                                        // InteractiveHtmlBom needs scripts plus
                                        // same-origin to run, and downloads for
                                        // its exports. Content is generated by
                                        // our backend from the repo's own design
                                        // files, so the scripts+same-origin pair
                                        // is accepted by design here.
                                        // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
                                        sandbox="allow-scripts allow-same-origin allow-downloads"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                                        No interactive assembly HTML was found for this revision.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <ViewerOverlayRail
                        activeTab={rightRailTab}
                        tabs={[
                            {
                                id: "selection",
                                label: "Selection",
                                icon: <Cpu className="mr-1.5 size-3.5" />,
                            },
                            {
                                id: "comments",
                                label: "Comments",
                                icon: <MessageSquare className="mr-1.5 size-3.5" />,
                                badge: comments.length > 0
                                    ? <span className="rounded-full bg-muted px-1.5 text-[10px]">{comments.length}</span>
                                    : null,
                            },
                        ]}
                        onTabChange={(tab) => dispatchMode({ type: "rail", tab })}
                        onClose={() => dispatchMode({ type: "rail", tab: null })}
                        onVisibleWidthChange={setRightRailInset}
                        ariaLabel="Viewer details"
                        resizable={
                            (activeTab === "sch" || activeTab === "pcb")
                                && rightRailTab === "selection"
                                ? SELECTION_INSPECTOR_RAIL_RESIZE
                                : undefined
                        }
                    >
                        {rightRailTab === "comments" ? (
                            <div className="flex h-full min-h-0 flex-col">
                            {(commentsError || !commentsLoaded || commentConnectionStatus !== "live") && (
                                <div className="border-b px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
                                    {commentsError
                                        ? `${commentsError}${commentsLoaded ? " Showing the last loaded comments." : ""}`
                                        : !commentsLoaded
                                            ? "Loading comments…"
                                            : "Live comments reconnecting; updates may be delayed."}
                                </div>
                            )}
                            <div className="min-h-0 flex-1">
                            <ThreadUpdateContext.Provider value={applyThread}>
                            <CommentPanel
                                projectId={projectId}
                                comments={comments}
                                onClose={() => dispatchMode({ type: "rail", tab: null })}
                                onResolve={(commentId, resolved) => void resolveComment(commentId, resolved)}
                                onReply={replyToComment}
                                onDelete={deleteComment}
                                onCommentClick={handleCommentClick}
                                canModify={canModifyComments}
                                highlightedId={selectedCommentId}
                                anchorStatuses={commentMarkerResolutions}
                                onReattach={reattachComment}
                                onPromote={promoteComment}
                                onRetrySync={retryCommentSync}
                                onShareReply={shareReply}
                                embedded
                            />
                            </ThreadUpdateContext.Provider>
                            </div>
                            </div>
                        ) : inspectorHasContent ? (
                            <SelectionInspector
                                open
                                selection={globalSelection && selectionVisibleInActiveView ? globalSelection : null}
                                semanticIndex={semanticIndex}
                                components={effectiveComponents}
                                layerColors={layerColors}
                                netStatistics={netStatistics}
                                viewContext={activeViewContext ?? undefined}
                                highlightedNets={highlightsVisibleInActiveView ? highlightedNetEntries : undefined}
                                onInspectHighlightedNet={inspectHighlighted}
                                onRemoveHighlightedNet={removeHighlighted}
                                onOpenChange={(open) => {
                                    if (!open) dispatchMode({ type: "rail", tab: null });
                                }}
                                onClear={clearSelectionAndHighlights}
                                onImportComponent={globalSelection?.kind === "net" ? undefined : handleImportSelectedComponent}
                                canImportComponent={canImportLibraryComponent}
                                importingComponent={componentImportPending}
                                supplyUser={supplyAtHead ? (user ?? null) : null}
                                labelInstances={labelInstances}
                                onNavigateLabelInstance={navigateLabelInstance}
                                onFocusLabelInstance={(uuid) => void focusLabelInstance(uuid)}
                                navigatingLabelInstance={navigatingLabelInstance}
                                embedded
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
                                Select a component, net, pad, via, zone, or track to inspect it.
                            </div>
                        )}
                    </ViewerOverlayRail>
                </div>
            </div>

            {commentDraft && <CommentForm
                projectId={projectId}
                // Each pin is its own draft, so each is its own component.
                key={`${commentDraft.location.x}:${commentDraft.location.y}`}
                isOpen
                onClose={() => dispatchMode({ type: "close-draft" })}
                onSubmit={(payload) => void submitComment(payload)}
                location={commentDraft.location}
                context={commentDraft.context}
                isSubmitting={isSubmittingComment}
                mentionCandidates={mentionCandidates}
            />}

            {selectedComment && (
                <ThreadUpdateContext.Provider value={applyThread}>
                <CommentCard
                    projectId={projectId}
                    comment={selectedComment}
                    screenPosition={commentCardScreenPosition}
                    canModify={canModifyComments}
                    onClose={() => dispatchMode({ type: "select-comment", id: null })}
                    onResolve={(commentId, resolved) => void resolveComment(commentId, resolved)}
                    onReply={replyToComment}
                    onDelete={deleteComment}
                    onPromote={promoteComment}
                    onRetrySync={retryCommentSync}
                />
                </ThreadUpdateContext.Provider>
            )}
        </div>
    );
}
