import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Cpu, Box, FileText, CircuitBoard, Layers3, PackageCheck, MessageSquare, MessageSquarePlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EngineeringBomTable } from "./engineering-bom-table";
import { SelectionInspector, type HighlightedNetEntry } from "./selection-inspector";
import { filterLabelInstances, type LabelInstanceRef } from "@/lib/label-instances";
import { WebGpu3dTab } from "./webgpu-3d-tab";
import { EcadViewerControls } from "./ecad-viewer-controls";
import { CommentForm, type CommentFormSubmitPayload } from "./comment-form";
import { CommentCard } from "./comment-card";
import { CommentPanel } from "./comment-panel";
import { useLiveComments } from "@/features/live-comments/use-live-comments";
import { ViewerOverlayRail, SELECTION_INSPECTOR_RAIL_RESIZE } from "./viewer-overlay-rail";
import { fetchApi, readApiError } from "@/lib/api";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { canWriteCatalog } from "@/lib/roles";
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
    worldToViewportScreen,
    type ActiveSchematicPage,
} from "@/lib/comment-overlays";
import { DesignSearchField } from "./design-search-field";
import {
    requestedVariantFromSearchParams,
    resolveVariantSelection,
    variantSearchParams,
} from "./design-variants/variant-selection";
import { DesignVariantSelector } from "./design-variants/variant-selector";
import { usePrismCrossProbe } from "@/hooks/use-prism-cross-probe";
import {
    projectAssemblyState,
    physicalVisibility,
} from "@/lib/design-variants";
import { dnpVisibilityPlan, EMPTY_DNP_PLAN } from "./design-variants/dnp-visibility";
import {
    syncViewerVariant,
    viewerVariantNotice,
    type ViewerVariantTarget,
} from "@/lib/ecad-viewer-variant";
import type { User } from "@/types/auth";
import type {
    ECadViewerElement,
    EcadCommentAreaDetail,
    EcadCommentOverlayHitDetail,
    EcadHighlightChangeDetail,
    EcadNetStatistics,
    EcadSemanticSelectionDetail,
    EcadViewportInsets,
    EcadCommentAnchorResolution,
} from "@/types/ecad-viewer";
import type { PrismSelection, PrismSelectionContext, PrismSemanticIndex } from "@/types/prism-selection";
import type { Comment, CommentContext, CommentLocation, MentionCandidate } from "@/types/comments";

interface VisualizerProps {
    projectId: string;
    user: User | null;
    commit?: string | null;
    active?: boolean;
}

type VisualizerTab = "sch" | "pcb" | "3d" | "bom" | "stackup" | "assembly";
type ViewerRightRailTab = "selection" | "comments";

/**
 * Toolbar order is also the shortcut order: pressing 1 through 6 selects the
 * nth tab, so the two must be defined together and never drift apart.
 */
const VISUALIZER_TABS: { id: VisualizerTab; label: string; icon: LucideIcon }[] = [
    { id: "sch", label: "Schematic", icon: Cpu },
    { id: "pcb", label: "PCB", icon: CircuitBoard },
    { id: "3d", label: "3D", icon: Box },
    { id: "bom", label: "BOM", icon: FileText },
    { id: "stackup", label: "Stackup", icon: Layers3 },
    { id: "assembly", label: "Assembly Assistant", icon: PackageCheck },
];

function selectionContextForTab(tab: VisualizerTab): PrismSelectionContext {
    if (tab === "pcb") return "PCB";
    if (tab === "3d" || tab === "stackup") return "3D";
    if (tab === "bom" || tab === "assembly") return "BOM";
    return "SCH";
}

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

type ViewerBlobSource = {
    filename: string;
    content: string;
};

const buildViewerKey = (
    kind: "schematic" | "pcb",
    projectId: string,
    commit: string | null | undefined,
) => `${kind}:${projectId}:${commit ?? "latest"}`;

interface PendingCommentElement {
    elementId?: string;
    elementRef?: string;
    elementType?: string;
    relativePoint?: [number, number];
}

function applyCommentMode(viewer: ECadViewerElement | null, enabled: boolean): void {
    if (!viewer) return;
    viewer.setCommentMode?.(enabled);
    if (enabled) {
        viewer.setAttribute("comment-mode", "true");
    } else {
        viewer.removeAttribute("comment-mode");
    }
}

/** Attach the overlay set for one view to its viewer; overlays are a separate render pass. */
function publishCommentsOverlay(
    viewer: ECadViewerElement | null,
    context: CommentContext,
    comments: Comment[],
    activePage?: ActiveSchematicPage | null,
): EcadCommentAnchorResolution[] {
    if (!viewer) return [];
    return viewer.setCommentOverlays(commentOverlaySet(comments, context, activePage));
}

type EcadViewerHostProps = {
    viewerKey: string;
    sources: ViewerBlobSource[];
    active: boolean;
    setViewerRef: (node: ECadViewerElement | null) => void;
    onReady: () => void;
    viewportInsets: EcadViewportInsets;
};

/**
 * Load the root sheet, and give a failed paint one more go.
 *
 * The viewer paints as soon as sources land and throws "Image not ready" when
 * a bitmap on the sheet has not finished decoding, which rejects
 * `replaceSources`. Nothing here used to catch that, so a transient decode
 * race ended the whole load: `ecadReadyRevision` stayed empty, `onReady` never
 * fired, and the sheet sat half-painted -- component bodies drawn, everything
 * after the failing layer missing -- with no way back short of a reload.
 *
 * A decode that lost one race has almost always finished by the next frame, so
 * the retry is a frame later rather than an interval. Two attempts, because a
 * third would be saying the failure is something other than a race, and if it
 * is then the caller should hear about it.
 */
async function loadRootSource(
    viewer: ECadViewerElement,
    payload: Parameters<ECadViewerElement["replaceSources"]>[0],
    isStale: () => boolean,
): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await viewer.replaceSources(payload);
            return;
        } catch (cause) {
            if (isStale()) return;
            if (attempt === 1) throw cause;
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            if (isStale()) return;
        }
    }
}

function EcadViewerHost({
    viewerKey,
    sources,
    active,
    setViewerRef,
    onReady,
    viewportInsets,
}: EcadViewerHostProps) {
    const hostRef = useRef<ECadViewerElement | null>(null);
    const replaceReadyRef = useRef<Promise<void> | null>(null);
    const rootSource = sources[0];
    const appendedSources = useMemo(() => sources.slice(1), [sources]);
    const viewportLeft = viewportInsets.left ?? 0;
    const viewportRight = viewportInsets.right ?? 0;
    const viewportTop = viewportInsets.top ?? 0;
    const viewportBottom = viewportInsets.bottom ?? 0;

    const attachViewerRef = useCallback((node: ECadViewerElement | null) => {
        hostRef.current = node;
        setViewerRef(node);
    }, [setViewerRef]);

    useLayoutEffect(() => {
        const viewer = hostRef.current;
        if (!viewer || !rootSource) return;

        let cancelled = false;

        const replaceRoot = async () => {
            await customElements.whenDefined("ecad-viewer");
            if (cancelled || !hostRef.current) return;
            hostRef.current.dataset.ecadReadyRevision = "";
            await loadRootSource(
                hostRef.current,
                { revisionKey: viewerKey, sources: [rootSource] },
                () => cancelled || !hostRef.current,
            );
            if (cancelled || !hostRef.current) return;
            // Wait for project load. Do not gate on host.isReady — the custom
            // element exposes `ready` (Promise), not a boolean isReady flag.
            // Gating on undefined left ecadReadyRevision unset forever, which
            // blocked Escape clears and SCH cross-probe apply.
            if (appendedSources.length === 0) {
                await hostRef.current.ready;
                if (cancelled || !hostRef.current) return;
                hostRef.current.dataset.ecadReadyRevision = viewerKey;
                onReady();
            }
        };

        replaceReadyRef.current = replaceRoot().catch((cause) => {
            if (cancelled) return;
            // Left unhandled this surfaced only as an uncaught rejection in the
            // console, with the sheet stuck half-drawn and no hint why.
            console.error("[Visualizer] Could not load the sheet", cause);
            toast.error(
                cause instanceof Error && cause.message
                    ? `Could not draw this sheet: ${cause.message}`
                    : "Could not draw this sheet.",
            );
        });

        return () => {
            cancelled = true;
        };
    }, [appendedSources.length, onReady, rootSource, viewerKey]);

    useEffect(() => {
        if (!appendedSources.length) return;
        if (hostRef.current) hostRef.current.dataset.ecadReadyRevision = "";
        let cancelled = false;
        const appendRemainingSources = async () => {
            await replaceReadyRef.current;
            if (cancelled || !hostRef.current) return;
            await hostRef.current.appendSources({
                revisionKey: viewerKey,
                sources: appendedSources,
            });
            if (cancelled || !hostRef.current) return;
            await hostRef.current.ready;
            if (cancelled || !hostRef.current) return;
            hostRef.current.dataset.ecadReadyRevision = viewerKey;
            onReady();
        };
        void appendRemainingSources().catch((cause) => {
            if (cancelled) return;
            // Same shape as the root load: an unhandled rejection here left
            // the extra sheets missing and the viewer never marked ready.
            console.error("[Visualizer] Could not load the remaining sheets", cause);
            toast.error("Some sheets in this design could not be drawn.");
        });
        return () => { cancelled = true; };
    }, [appendedSources, onReady, viewerKey]);

    useEffect(() => {
        let cancelled = false;
        void customElements.whenDefined("ecad-viewer").then(() => {
            if (!cancelled) hostRef.current?.setActive(active);
        });
        return () => { cancelled = true; };
    }, [active]);

    useLayoutEffect(() => {
        const viewer = hostRef.current;
        if (!viewer) return;
        let cancelled = false;
        void customElements.whenDefined("ecad-viewer").then(() => {
            if (!cancelled && hostRef.current === viewer) {
                viewer.setViewportInsets({
                    left: viewportLeft,
                    right: viewportRight,
                    top: viewportTop,
                    bottom: viewportBottom,
                });
            }
        });
        return () => { cancelled = true; };
    }, [viewportBottom, viewportLeft, viewportRight, viewportTop]);

    return (
        <ecad-viewer
            ref={attachViewerRef}
            style={{ width: "100%", height: "100%" }}
            show-header="false"
            show-selection-panel="false"
            source-mode="host"
        />
    );
}

// react-doctor-disable-next-line no-giant-component - viewer event orchestration and the comment system share the viewer refs
export function Visualizer({ projectId, user, commit, active: viewerActive = true }: VisualizerProps) {
    const [schematicViewerElement, setSchematicViewerElement] = useState<ECadViewerElement | null>(null);
    const [pcbViewerElement, setPcbViewerElement] = useState<ECadViewerElement | null>(null);
    // Layer name -> swatch color, read from the PCB viewer so the inspector can
    // show a layer's color the same way the layer menu does.
    const [layerColors, setLayerColors] = useState<Record<string, string>>({});
    const schematicViewerRef = useRef<ECadViewerElement | null>(null);
    const pcbViewerRef = useRef<ECadViewerElement | null>(null);

    // Callback refs to sync state and refs
    const setSchematicViewerRef = useCallback((node: ECadViewerElement | null) => {
        schematicViewerRef.current = node;
        setSchematicViewerElement(node);
    }, []);

    const setPcbViewerRef = useCallback((node: ECadViewerElement | null) => {
        pcbViewerRef.current = node;
        setPcbViewerElement(node);
    }, []);

    // Open on the tab a caller asked for (e.g. clicking a changed .kicad_pcb in
    // the history file list), read once on mount; defaults to the schematic.
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<VisualizerTab>(() => {
        const requested = searchParams.get("tab");
        return requested === "pcb"
            || requested === "3d"
            || requested === "bom"
            || requested === "stackup"
            || requested === "assembly"
            ? requested
            : "sch";
    });
    const [threeDActivated, setThreeDActivated] = useState(false);
    /**
     * Whether the PCB tab has ever been opened.
     *
     * The board *source* is fetched eagerly so the tab is ready the moment it is
     * shown, but mounting the viewer is what parses the board, and that parse
     * runs on the main thread. Mounting it as soon as the fetch resolved froze
     * the whole UI while the reviewer was still reading the schematic. Fetch
     * early, parse on first visit; once visited it stays mounted so switching
     * back does not re-parse.
     */
    const [pcbActivated, setPcbActivated] = useState(false);
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<{ filename: string, content: string }[]>([]);
    const [viewerSupportFiles, setViewerSupportFiles] = useState<ViewerBlobSource[]>([]);
    const [pcbContent, setPcbContent] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [schematicContentLoaded, setSchematicContentLoaded] = useState(false);
    const [pcbContentLoaded, setPcbContentLoaded] = useState(false);
    const [semanticIndex, setSemanticIndex] = useState<PrismSemanticIndex | null>(null);
    const [semanticIndexLoading, setSemanticIndexLoading] = useState(true);
    const [semanticIndexError, setSemanticIndexError] = useState<string | null>(null);
    const [semanticIndexRetryToken, setSemanticIndexRetryToken] = useState(0);
    const [rightRailTab, setRightRailTab] =
        useState<ViewerRightRailTab | null>(null);
    const [schematicLeftInset, setSchematicLeftInset] = useState(0);
    const [pcbLeftInset, setPcbLeftInset] = useState(0);
    const [rightRailInset, setRightRailInset] = useState(0);
    const [componentImportPending, setComponentImportPending] = useState(false);
    const [labelInstances, setLabelInstances] = useState<LabelInstanceRef[]>([]);
    const [navigatingLabelInstance, setNavigatingLabelInstance] = useState(false);
    const [activeSchematicPage, setActiveSchematicPage] = useState<ActiveSchematicPage | null>(null);
    // Bumped every time a host reports ready; the variant sync effect keys on
    // it so a ready arriving after the selection still converges.
    const [schematicReadyGeneration, setSchematicReadyGeneration] = useState(0);
    const [pcbReadyGeneration, setPcbReadyGeneration] = useState(0);

    // Comment collaboration state
    const { comments, setComments, refresh: refreshComments, status: commentConnectionStatus, error: commentsError,
        hasLoaded: commentsLoaded } = useLiveComments(projectId, { kind: "canvas", revision: commit ?? undefined });
    const [commentMarkerResolutions, setCommentMarkerResolutions] = useState<Record<string, EcadCommentAnchorResolution>>({});
    const [commentMode, setCommentMode] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<CommentLocation | null>(null);
    const [pendingContext, setPendingContext] = useState<CommentContext | null>(null);
    // The pending comment element is read only when the comment submits,
    // never on screen.
    const pendingElementRef = useRef<PendingCommentElement | null>(null);
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
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
    const fitHighlightedNets = useCallback(() => {
        pcbViewerRef.current?.focusHighlightedNets?.();
    }, []);
    // Escape and the bar's Clear drop the inspected object and the nets.
    const clearSelectionAndHighlights = useCallback(() => {
        clearGlobalSelection();
        clearHighlightedNets();
    }, [clearGlobalSelection, clearHighlightedNets]);
    const notifySchematicViewerReady = useCallback(
        () => {
            setSchematicReadyGeneration((generation) => generation + 1);
            notifyClientReady("visualizer-schematic");
        },
        [notifyClientReady],
    );
    const notifyPcbViewerReady = useCallback(
        () => {
            setPcbReadyGeneration((generation) => generation + 1);
            notifyClientReady("visualizer-pcb");
        },
        [notifyClientReady],
    );

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

    // The ecad-viewer elements own replay across source replacement and page
    // switches (the reflected `variant` attribute is durable). These effects
    // cover what they cannot: a freshly mounted element, and a ready arriving
    // after the selection. A bundle older than the vendored API is reported,
    // never skipped silently.
    const reportedViewerVariantIssues = useRef(new Set<string>());
    const reportViewerVariantSync = useCallback(
        (target: ViewerVariantTarget, result: ReturnType<typeof syncViewerVariant>) => {
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
    useEffect(() => {
        let cancelled = false;
        void customElements.whenDefined("ecad-viewer").then(() => {
            if (cancelled) return;
            reportViewerVariantSync(
                "schematic",
                syncViewerVariant(schematicViewerElement, variantSelection.effective),
            );
        });
        return () => { cancelled = true; };
    }, [
        reportViewerVariantSync,
        schematicReadyGeneration,
        schematicViewerElement,
        variantSelection.effective,
    ]);
    useEffect(() => {
        let cancelled = false;
        void customElements.whenDefined("ecad-viewer").then(() => {
            if (cancelled) return;
            reportViewerVariantSync(
                "pcb",
                syncViewerVariant(pcbViewerElement, variantSelection.effective),
            );
        });
        return () => { cancelled = true; };
    }, [
        pcbReadyGeneration,
        pcbViewerElement,
        reportViewerVariantSync,
        variantSelection.effective,
    ]);

    const canImportLibraryComponent = canWriteCatalog(user?.role);
    const canModifyComments = user?.role === "admin" || user?.role === "designer";

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
                const [ibomRes, supportRes, mentionsRes] = await Promise.all([
                    fetch(appendCommit(`${baseUrl}/ibom`), { signal }),
                    fetch(appendCommit(`${baseUrl}/viewer/support-files`), { signal }),
                    fetchApi(`${baseUrl}/comments/mention-candidates`, { signal }),
                ]);
                if (cancelled) return;

                if (ibomRes.ok) {
                    setIbomUrl(appendCommit(`${baseUrl}/ibom`));
                } else {
                    setIbomUrl(null);
                }
                if (supportRes.ok) {
                    const payload = await supportRes.json() as { files?: ViewerBlobSource[] };
                    if (cancelled) return;
                    setViewerSupportFiles(payload.files ?? []);
                } else {
                    setViewerSupportFiles([]);
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

    useEffect(() => {
        if (semanticIndex) return;
        const controller = new AbortController();
        setSemanticIndexLoading(true);
        setSemanticIndexError(null);
        // The compact identity artifact is generated independently from 3D
        // assets and loaded in the background. It never gates SCH/PCB source
        // rendering, but is ready before the first normal selection whenever
        // generation completes quickly.
        fetch(appendCommit(`/api/projects/${projectId}/semantic-index/identity`), {
            signal: controller.signal,
            credentials: "include",
        })
            .then(async (response) => {
                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { detail?: string } | null;
                    throw new Error(payload?.detail || "Semantic identity index is unavailable");
                }
                return response.json() as Promise<PrismSemanticIndex>;
            })
            .then((payload) => {
                if (!controller.signal.aborted) setSemanticIndex(payload);
            })
            .catch((error: unknown) => {
                if (!isAbortError(error) && !controller.signal.aborted) {
                    setSemanticIndexError(error instanceof Error ? error.message : "Semantic identity index is unavailable");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setSemanticIndexLoading(false);
            });
        return () => controller.abort();
    }, [appendCommit, projectId, semanticIndex, semanticIndexRetryToken]);

    const generateSemanticIdentity = useCallback(async () => {
        setSemanticIndexLoading(true);
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
            const job = await watchPrismJob(payload.job_id);
            throwIfJobFailed(job, "Failed to generate semantic identity index");
            setSemanticIndexRetryToken((token) => token + 1);
        } catch (error) {
            setSemanticIndexError(error instanceof Error ? error.message : "Failed to generate semantic identity index");
            setSemanticIndexLoading(false);
        }
    }, [commit, projectId]);

    // Lazy load schematic content when schematic tab is first accessed
    useEffect(() => {
        if (activeTab === "sch" && !schematicContentLoaded) {
            const controller = new AbortController();
            const signal = controller.signal;
            let cancelled = false;

            const loadSchematic = async () => {
                try {
                    const baseUrl = `/api/projects/${projectId}`;

                    const [schRes, subsheetsRes] = await Promise.allSettled([
                        fetch(appendCommit(`${baseUrl}/schematic`), { signal }),
                        fetch(appendCommit(`${baseUrl}/schematic/subsheets`), { signal })
                    ]);
                    if (cancelled) return;

                    // Handle Schematic
                    if (schRes.status === "fulfilled" && schRes.value.ok) {
                        const schematicText = await schRes.value.text();
                        if (cancelled) return;
                        setSchematicContent(schematicText);
                    } else {
                        console.error("Schematic not found");
                        setSchematicContent(null);
                    }

                    // Handle Subsheets
                    if (subsheetsRes.status === "fulfilled" && subsheetsRes.value.ok) {
                        const data = await subsheetsRes.value.json();
                        if (cancelled) return;
                        if (data.files?.length) {
                            const subsheetResults = await Promise.allSettled(data.files.map(async (f: any) => {
                                const cRes = await fetch(f.url, { signal });
                                if (!cRes.ok) {
                                    throw new Error(`Failed to load subsheet: ${f.url}`);
                                }
                                let filename = f.name || f.path || f.url.split("/")?.pop() || "subsheet.kicad_sch";
                                if (!filename.endsWith('.kicad_sch')) filename += '.kicad_sch';
                                if (!filename.includes("/") && f.url.includes("Subsheets")) filename = `Subsheets/${filename}`;
                                return { filename, content: await cRes.text() };
                            }));

                            if (cancelled) return;

                            const loadedSubsheets: Array<{
                                filename: string;
                                content: string;
                            }> = [];
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
    useEffect(() => {
        if (pcbContentLoaded) return;
        const controller = new AbortController();
        const signal = controller.signal;
        let cancelled = false;

        const loadPcb = async () => {
            try {
                const baseUrl = `/api/projects/${projectId}`;
                const pcbRes = await fetch(appendCommit(`${baseUrl}/pcb`), { signal });
                if (cancelled) return;

                if (pcbRes.ok) {
                    const pcbText = await pcbRes.text();
                    if (cancelled) return;
                    setPcbContent(pcbText);
                } else {
                    console.error("PCB not found");
                    setPcbContent(null);
                }
            } catch (err) {
                if (!cancelled && !isAbortError(err)) {
                    console.error("Error loading PCB content", err);
                }
            } finally {
                if (!cancelled) {
                    setPcbContentLoaded(true);
                }
            }
        };

        void loadPcb();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [pcbContentLoaded, projectId, appendCommit]);

    // A different project or commit is a different visualizer, not this one
    // with twenty-three values put back. ProjectDetailPage keys this component
    // on that pair, so React discards the whole tree -- state, refs, and the
    // cross-probe hook's own selection, which lives here too -- and there is no
    // render where the previous board's state is still on screen.

    useEffect(() => {
        if (activeTab === "3d" || activeTab === "stackup") setThreeDActivated(true);
        if (activeTab === "pcb") setPcbActivated(true);
    }, [activeTab]);

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

        const viewer = schematicViewerRef.current;
        const selection = globalSelection;
        if (viewer && selection) {
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
            if (arrivedFromElsewhere && request.page && typeof viewer.showPage === "function") {
                void viewer.showPage(request.page).finally(() => {
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
    }, [activeTab, globalSelection, notifyClientReady, semanticIndex]);

    useEffect(() => {
        const schematicViewer = schematicViewerElement;
        const pcbViewer = pcbViewerElement;
        if (!schematicViewer && !pcbViewer) return;

        const revisionKey = semanticIndex?.sourceRevisionKey ?? commit ?? undefined;

        const handleSelection = (event: Event) => {
            const detail = (event as CustomEvent<EcadSemanticSelectionDetail>).detail;
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
        };

        const handleCrossProbe = (event: Event) => {
            const detail = (event as CustomEvent<EcadSemanticSelectionDetail>).detail;
            lastSelectionRef.current = detail;
            const normalized = normalizeEcadSelection(detail, revisionKey);
            if (normalized) crossProbeGlobal(normalized);
        };

        // The board viewer reports the set whenever it changes it itself
        // (double-click cross-probe, clear), so the collection follows.
        const handleHighlightChange = (event: Event) => {
            const detail = (event as CustomEvent<EcadHighlightChangeDetail>).detail;
            setHighlightedNets((current) => adoptViewerNets(current, detail.nets));
        };

        schematicViewer?.addEventListener("ecad-viewer:selection", handleSelection as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:selection", handleSelection as EventListener);
        schematicViewer?.addEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:highlight-change", handleHighlightChange as EventListener);

        return () => {
            schematicViewer?.removeEventListener("ecad-viewer:selection", handleSelection as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:selection", handleSelection as EventListener);
            schematicViewer?.removeEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:highlight-change", handleHighlightChange as EventListener);
        };
    }, [commit, clearGlobalSelection, crossProbeGlobal, pcbViewerElement, schematicViewerElement, selectGlobal, semanticIndex?.sourceRevisionKey, toggleNetForSelection]);

    // Project the collection onto the board. Keyed on the ready generation so
    // nets accumulated before the board finished loading are applied once it
    // has; a re-applied identical set is a no-op in the viewer.
    useEffect(() => {
        const viewer = pcbViewerElement;
        if (!viewer || pcbReadyGeneration === 0) return;
        viewer.setHighlightedNets?.(highlightRefs(highlightedNets));
    }, [highlightedNets, pcbReadyGeneration, pcbViewerElement]);

    useEffect(() => {
        const applySelection = (
            viewer: ECadViewerElement | null,
            targetContext: "SCH" | "PCB",
            selection: PrismSelection | null,
        ) => {
            if (!viewer) return;
            if (!selection) {
                // The collection is the visualizer's; deselecting the
                // inspected object must not drop it from the board.
                viewer.clearSelection({ keepHighlights: true });
                return;
            }
            if (typeof viewer.requestCrossProbe !== "function") return;
            const request = crossProbeRequestForSelection(selection, targetContext, semanticIndex);
            void (async () => {
                const resolved = await viewer.requestCrossProbe(request);
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
            revisionKey: semanticIndex?.sourceRevisionKey ?? commit ?? undefined,
            isReady: () =>
                schematicViewerRef.current?.dataset.ecadReadyRevision ===
                buildViewerKey("schematic", projectId, commit),
            applySelection: (selection) => applySelection(schematicViewerRef.current, "SCH", selection),
        });
        const unregisterPcb = registerClient({
            id: "visualizer-pcb",
            context: "PCB",
            revisionKey: semanticIndex?.sourceRevisionKey ?? commit ?? undefined,
            isReady: () =>
                pcbViewerRef.current?.dataset.ecadReadyRevision ===
                buildViewerKey("pcb", projectId, commit),
            applySelection: (selection) => applySelection(pcbViewerRef.current, "PCB", selection),
        });
        return () => {
            unregisterSchematic();
            unregisterPcb();
        };
    }, [commit, pcbViewerElement, projectId, registerClient, schematicViewerElement, semanticIndex]);

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
        const viewer = sourceContext === "SCH" ? schematicViewerRef.current : pcbViewerRef.current;
        if (typeof viewer?.requestCrossProbe !== "function") return;
        void viewer.requestCrossProbe(
            crossProbeRequestForSelection(selection, sourceContext, semanticIndex),
        );
    }, [activeSchematicPage, activeTab, crossProbeGlobal, semanticIndex]);

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

    useEffect(() => {
        if (inspectorHasContent) {
            setRightRailTab("selection");
        } else {
            // Nothing for this view (cleared, or a single-view selection
            // that belongs to the other view): close the selection panel so it
            // does not linger. Leave other rail tabs (comments) alone.
            setRightRailTab((tab) => (tab === "selection" ? null : tab));
        }
    }, [inspectorHasContent]);

    // Routed length / layers / counts for the selected net, read from the
    // board the PCB viewer has loaded. Keyed on the ready generation so a
    // selection made before the board finished parsing (SCH cross-probe, BOM)
    // fills in once it has.
    const netStatistics = useMemo(() => {
        const ref = netStatisticsRefForSelection(globalSelection);
        if (!ref || !pcbViewerElement || pcbReadyGeneration === 0) return null;
        try {
            return pcbViewerElement.getNetStatistics?.(ref) ?? null;
        } catch {
            return null;
        }
    }, [globalSelection, pcbReadyGeneration, pcbViewerElement]);

    // The same summary for every highlighted net, so the panel can list the
    // whole collection (#305). Names the board does not know come back null.
    const highlightedNetEntries = useMemo<HighlightedNetEntry[]>(() => {
        const read = (net: HighlightedNet): EcadNetStatistics | null => {
            if (!pcbViewerElement || pcbReadyGeneration === 0) return null;
            try {
                return pcbViewerElement.getNetStatistics?.({ name: net.netName, netCode: net.netCode }) ?? null;
            } catch {
                return null;
            }
        };
        return highlightedNets.map((net) => ({ net, statistics: read(net) }));
    }, [highlightedNets, pcbReadyGeneration, pcbViewerElement]);

    // Refresh the layer color map when a selection carries a layer or its net
    // has routing layers, so the inspector can show swatches matching the
    // layer menu. Read lazily from the PCB viewer; layer colors are stable for
    // a board.
    useEffect(() => {
        if (!pcbViewerElement) return;
        const highlightedLayers = highlightedNetEntries.some((entry) => entry.statistics?.layers.length);
        if (!globalSelection?.anchor?.layer && !netStatistics?.layers.length && !highlightedLayers) return;
        void customElements.whenDefined("ecad-viewer").then(() => {
            const layers = pcbViewerElement.getPcbViewState?.()?.layers;
            if (!layers?.length) return;
            setLayerColors((previous) => {
                const next: Record<string, string> = { ...previous };
                let changed = false;
                for (const layer of layers) {
                    if (next[layer.name] !== layer.color) {
                        next[layer.name] = layer.color;
                        changed = true;
                    }
                }
                return changed ? next : previous;
            });
        });
    }, [globalSelection, highlightedNetEntries, netStatistics, pcbViewerElement]);

    useEffect(() => {
        const selection = globalSelection;
        const viewer = schematicViewerRef.current;
        if (
            !selection ||
            selection.kind !== "net" ||
            selection.sourceContext !== "SCH" ||
            !viewer?.findLabelInstances
        ) {
            setLabelInstances([]);
            return;
        }

        const all = viewer.findLabelInstances(selection.netName);
        setLabelInstances(filterLabelInstances(all, selection.anchor?.itemType));
    }, [globalSelection, schematicViewerElement]);

    const focusLabelInstance = useCallback(async (uuid: string) => {
        const viewer = schematicViewerRef.current;
        if (!viewer?.focusLabelInstance) return;
        setNavigatingLabelInstance(true);
        try {
            await viewer.focusLabelInstance(uuid);
        } finally {
            setNavigatingLabelInstance(false);
        }
    }, []);

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

    // Track the active schematic page so comment overlay filtering can match
    // comments to the currently visible sheet.
    useEffect(() => {
        const viewer = schematicViewerElement;
        if (!viewer) {
            setActiveSchematicPage(null);
            return;
        }
        const refresh = () => {
            const active = viewer.getActiveSchematicPage?.();
            setActiveSchematicPage(
                active
                    ? {
                          projectPath: active.projectPath,
                          filename: active.filename,
                          page: active.page,
                      }
                    : null,
            );
        };
        refresh();
        viewer.addEventListener("ecad-viewer:view-state-change", refresh);
        return () => viewer.removeEventListener("ecad-viewer:view-state-change", refresh);
    }, [schematicViewerElement]);

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
                schematicViewerRef.current?.switchPage(targetPage);
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
        const viewer = expectedTab === "sch" ? schematicViewerRef.current : pcbViewerRef.current;
        if (!viewer) return;
        if (resolution.location.page) viewer.switchPage(resolution.location.page);
        viewer.zoomToLocation(resolution.location.x, resolution.location.y);
        setCommentCardScreenPosition(worldToViewportScreen(viewer, resolution.location.x, resolution.location.y));
    }, [comments]);

    // Publish comment markers to the ecad-viewer overlay layer. This never
    // touches replaceSources/appendSources - overlays are a separate render pass.
    useEffect(() => {
        let resolutions: EcadCommentAnchorResolution[] = [];
        if (activeTab === "sch") {
            resolutions = publishCommentsOverlay(schematicViewerElement, "SCH", comments, activeSchematicPage);
            pcbViewerElement?.clearCommentOverlays("PCB");
        } else if (activeTab === "pcb") {
            resolutions = publishCommentsOverlay(pcbViewerElement, "PCB", comments);
            schematicViewerElement?.clearCommentOverlays("SCH");
        } else {
            schematicViewerElement?.clearCommentOverlays("SCH");
            pcbViewerElement?.clearCommentOverlays("PCB");
        }
        const byId = Object.fromEntries(resolutions.map((resolution) => [resolution.id, resolution]));
        setCommentMarkerResolutions(byId);
        focusPendingComment(byId, activeTab, activeSchematicPage);
    }, [activeTab, activeSchematicPage, comments, pcbReadyGeneration, pcbViewerElement,
        schematicReadyGeneration, schematicViewerElement, focusPendingComment]);

    // Mirror comment mode onto whichever viewer is currently active.
    useEffect(() => {
        applyCommentMode(schematicViewerElement, commentMode && activeTab === "sch");
        applyCommentMode(pcbViewerElement, commentMode && activeTab === "pcb");
    }, [activeTab, commentMode, pcbViewerElement, schematicViewerElement]);

    const openCommentCardForOverlayHit = useCallback((event: Event) => {
        const detail = (event as CustomEvent<EcadCommentOverlayHitDetail>).detail;
        const commentId = commentIdFromOverlayHit(detail);
        if (!commentId) return;
        const viewer = detail.context === "SCH" ? schematicViewerRef.current : pcbViewerRef.current;
        setSelectedCommentId(commentId);
        setCommentCardScreenPosition(
            worldToViewportScreen(viewer, detail.x, detail.y),
        );
    }, []);

    const handleCommentAreaEvent = useCallback((event: Event) => {
        const detail = (event as CustomEvent<EcadCommentAreaDetail>).detail;
        setCommentMode(false);
        setPendingContext(detail.context);
        setPendingLocation(commentLocationFromArea(detail));
        pendingElementRef.current = null;
        setShowCommentForm(true);
    }, []);

    useEffect(() => {
        const schematicViewer = schematicViewerElement;
        const pcbViewer = pcbViewerElement;
        if (!schematicViewer && !pcbViewer) return;

        schematicViewer?.addEventListener("ecad-viewer:comment-overlay-click", openCommentCardForOverlayHit as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:comment-overlay-click", openCommentCardForOverlayHit as EventListener);
        schematicViewer?.addEventListener("ecad-viewer:comment-area", handleCommentAreaEvent as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:comment-area", handleCommentAreaEvent as EventListener);

        return () => {
            schematicViewer?.removeEventListener("ecad-viewer:comment-overlay-click", openCommentCardForOverlayHit as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:comment-overlay-click", openCommentCardForOverlayHit as EventListener);
            schematicViewer?.removeEventListener("ecad-viewer:comment-area", handleCommentAreaEvent as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:comment-area", handleCommentAreaEvent as EventListener);
        };
    }, [handleCommentAreaEvent, openCommentCardForOverlayHit, pcbViewerElement, schematicViewerElement]);

    const submitComment = useCallback(async (payload: CommentFormSubmitPayload) => {
        if (!pendingLocation || !pendingContext) return;
        setIsSubmittingComment(true);
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments`, {
                method: "POST",
                body: JSON.stringify({
                    context: pendingContext,
                    location: pendingLocation,
                    content: payload.content,
                    author: user?.name,
                    elementId: pendingElementRef.current?.elementId,
                    elementRef: pendingElementRef.current?.elementRef,
                    elementType: pendingElementRef.current?.elementType,
                    ...(pendingElementRef.current?.relativePoint
                        ? { metadata: { anchorRelativePoint: pendingElementRef.current.relativePoint } }
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
            setShowCommentForm(false);
            setPendingLocation(null);
            setPendingContext(null);
            pendingElementRef.current = null;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to post comment");
        } finally {
            setIsSubmittingComment(false);
        }
    }, [commit, pendingContext, pendingLocation, projectId, setComments, user?.name]);

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
                body: JSON.stringify({ content }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to add reply"));
            const payload = await response.json() as { comment: Comment };
            setComments((prev) => prev.map((entry) => (entry.id === commentId
                ? { ...normalizeComment(payload.comment), anchorResolution: entry.anchorResolution } : entry)));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add reply");
        }
    }, [projectId, setComments]);

    const deleteComment = useCallback(async (commentId: string) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "DELETE",
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to delete comment"));
            setComments((prev) => prev.filter((entry) => entry.id !== commentId));
            setSelectedCommentId((current) => (current === commentId ? null : current));
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
                body: JSON.stringify({
                    commit,
                    expectedRevision: comment.revision,
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
        setSelectedCommentId(comment.id);
        if (comment.anchorResolution?.state === "unresolved") {
            toast.message("This comment's anchor needs review on this revision.");
            return;
        }
        const targetTab: VisualizerTab = comment.context === "SCH" ? "sch" : "pcb";
        setActiveTab((current) => (current === targetTab ? current : targetTab));
        const viewer = targetTab === "sch" ? schematicViewerRef.current : pcbViewerRef.current;
        const location = commentCurrentLocation(comment);
        if (location.page) viewer?.switchPage(location.page);
        pendingCommentFocusRef.current = comment.id;
        focusPendingComment(commentMarkerResolutions, activeTab, activeSchematicPage);
    }, [activeSchematicPage, activeTab, commentMarkerResolutions, focusPendingComment]);

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

            if (event.key === "Escape") {
                clearSelectionAndHighlights();
                setRightRailTab(null);
                setCommentMode(false);
                setShowCommentForm(false);
                setSelectedCommentId(null);
                lastSelectionRef.current = null;
                return;
            }
            // Number keys jump straight to a tab. Modifiers are excluded so the
            // browser keeps Cmd/Ctrl+1..9 for its own tab switching.
            if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                const tabIndex = Number.parseInt(event.code.startsWith("Digit") ? event.code.slice(5) : event.key, 10);
                if (Number.isInteger(tabIndex) && tabIndex >= 1 && tabIndex <= VISUALIZER_TABS.length) {
                    setActiveTab(VISUALIZER_TABS[tabIndex - 1].id);
                    event.preventDefault();
                    return;
                }
            }
            if (
                canModifyComments
                && (activeTab === "sch" || activeTab === "pcb")
                && event.key.toLowerCase() === "c"
                && !event.metaKey
                && !event.ctrlKey
                && !event.altKey
            ) {
                const selection = lastSelectionRef.current;
                if (selection && selection.x !== undefined && selection.y !== undefined) {
                    setCommentMode(false);
                    setPendingContext(activeTab === "sch" ? "SCH" : "PCB");
                    setPendingLocation({
                        x: selection.x,
                        y: selection.y,
                        layer: selection.layer ?? "",
                        page: selection.page,
                        // Element comments use marker-at-center only; do not
                        // treat the selected item bbox as an area comment.
                    });
                    pendingElementRef.current = {
                        elementId: selection.uuid,
                        elementRef: selection.reference,
                        elementType: selection.itemType,
                        relativePoint: selection.bounds && selection.bounds[2] > 0 && selection.bounds[3] > 0
                            ? [
                                Math.max(0, Math.min(1, (selection.x - selection.bounds[0]) / selection.bounds[2])),
                                Math.max(0, Math.min(1, (selection.y - selection.bounds[1]) / selection.bounds[3])),
                            ]
                            : undefined,
                    };
                    setShowCommentForm(true);
                } else {
                    // No selection: C toggles commenting mode, so pressing it
                    // again turns it back off.
                    setCommentMode((enabled) => !enabled);
                }
                event.preventDefault();
                return;
            }
            if (activeTab === "sch") {
                const bracketDirection = event.key === "[" || event.code === "BracketLeft"
                    ? -1
                    : event.key === "]" || event.code === "BracketRight"
                        ? 1
                        : null;
                if (bracketDirection) {
                    const handled = schematicViewerRef.current?.navigateSchematicPage?.(
                        bracketDirection,
                    );
                    if (handled) event.preventDefault();
                    return;
                }
                if (event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
                    const handled = schematicViewerRef.current?.navigateSchematicParent?.();
                    if (handled) event.preventDefault();
                    return;
                }
            }
        };
        // Capture before the embedded canvas can consume bracket/backspace keys.
        // ecad-viewer still receives every key Prism does not handle.
        window.addEventListener("keydown", handleKeyboard, true);
        return () => window.removeEventListener("keydown", handleKeyboard, true);
    }, [activeTab, canModifyComments, clearSelectionAndHighlights]);

    const schematicRootSource = useMemo<ViewerBlobSource | null>(
        () => (schematicContent ? { filename: "root.kicad_sch", content: schematicContent } : null),
        [schematicContent],
    );
    const schematicSources = useMemo<ViewerBlobSource[]>(
        () => (schematicRootSource ? [schematicRootSource, ...viewerSupportFiles, ...subsheets] : []),
        [schematicRootSource, subsheets, viewerSupportFiles],
    );
    const pcbSources = useMemo<ViewerBlobSource[]>(
        () => (pcbContent
            ? [{ filename: "board.kicad_pcb", content: pcbContent }, ...viewerSupportFiles]
            : []),
        [pcbContent, viewerSupportFiles],
    );
    const schematicViewerKey = buildViewerKey("schematic", projectId, commit);
    const pcbViewerKey = buildViewerKey("pcb", projectId, commit);

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
                {VISUALIZER_TABS.map((tab, index) => {
                    const Icon = tab.icon;
                    return (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? "secondary" : "ghost"}
                            size="sm"
                            data-visualizer-tab={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            title={`${tab.label} (${index + 1})`}
                            className="text-xs h-8"
                        >
                            <Icon className="w-3 h-3 mr-2" />
                            {tab.label}
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
                {(activeTab === "sch" || activeTab === "pcb") && canModifyComments && (
                    <Button
                        variant={commentMode ? "default" : "ghost"}
                        size="sm"
                        className={
                            commentMode
                                ? "h-8 text-xs bg-warning text-warning-foreground hover:bg-warning/90"
                                : "h-8 text-xs"
                        }
                        aria-pressed={commentMode}
                        onClick={() => setCommentMode((enabled) => !enabled)}
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
                    onClick={() => setRightRailTab((tab) =>
                        tab === "comments" ? null : "comments"
                    )}
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

            {/* Content Area */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="relative min-w-0 flex-1 overflow-hidden">
                    {/* Schematic View - always mounted after first visit */}
                    <div aria-hidden={activeTab !== "sch"} className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "sch" ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0"}`}>
                        {schematicContentLoaded ? (
                            schematicSources.length > 0 ? (
                                <div className="relative h-full min-w-0 overflow-hidden">
                                    <div className="absolute inset-0 min-h-0 min-w-0">
                                        <EcadViewerHost
                                            viewerKey={schematicViewerKey}
                                            sources={schematicSources}
                                            active={viewerActive && activeTab === "sch"}
                                            setViewerRef={setSchematicViewerRef}
                                            onReady={notifySchematicViewerReady}
                                            viewportInsets={{
                                                left: schematicLeftInset,
                                                right: rightRailInset,
                                            }}
                                        />
                                    </div>
                                    <EcadViewerControls
                                        context="SCH"
                                        viewer={schematicViewerElement}
                                        onVisibleWidthChange={setSchematicLeftInset}
                                    />
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
                                <p>Loading schematic…</p>
                            </div>
                        )}
                    </div>

                    {/* PCB View - always mounted after first visit */}
                    <div aria-hidden={activeTab !== "pcb"} className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "pcb" ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0"}`}>
                        {!pcbActivated ? null : pcbContentLoaded ? (
                            pcbSources.length > 0 ? (
                                <div className="relative h-full min-w-0 overflow-hidden">
                                    <div className="absolute inset-0 min-h-0 min-w-0">
                                        <EcadViewerHost
                                            viewerKey={pcbViewerKey}
                                            sources={pcbSources}
                                            active={viewerActive && activeTab === "pcb"}
                                            setViewerRef={setPcbViewerRef}
                                            onReady={notifyPcbViewerReady}
                                            viewportInsets={{
                                                left: pcbLeftInset,
                                                right: rightRailInset,
                                            }}
                                        />
                                    </div>
                                    <EcadViewerControls
                                        context="PCB"
                                        viewer={pcbViewerElement}
                                        onVisibleWidthChange={setPcbLeftInset}
                                    />
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
                                <p>Loading the board source…</p>
                            </div>
                        )}
                    </div>

                    {threeDActivated && (
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
                            />
                        </div>
                    )}

                    {activeTab === "bom" && (
                        <div className="absolute inset-0 z-20 bg-background">
                            <EngineeringBomTable
                                semanticIndex={semanticIndex}
                                components={effectiveComponents}
                                loading={semanticIndexLoading}
                                error={semanticIndexError}
                                selection={globalSelection}
                                onSelection={crossProbeGlobal}
                                onRetry={() => void generateSemanticIdentity()}
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
                        onTabChange={setRightRailTab}
                        onClose={() => setRightRailTab(null)}
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
                            <CommentPanel
                                comments={comments}
                                onClose={() => setRightRailTab(null)}
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
                                    if (!open) setRightRailTab(null);
                                }}
                                onClear={clearSelectionAndHighlights}
                                onImportComponent={globalSelection?.kind === "net" ? undefined : handleImportSelectedComponent}
                                canImportComponent={canImportLibraryComponent}
                                importingComponent={componentImportPending}
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

            {showCommentForm && pendingLocation && <CommentForm
                // Each pin is its own draft, so each is its own component.
                key={`${pendingLocation.x}:${pendingLocation.y}`}
                isOpen
                onClose={() => {
                    setShowCommentForm(false);
                    setPendingLocation(null);
                    setPendingContext(null);
                    pendingElementRef.current = null;
                }}
                onSubmit={(payload) => void submitComment(payload)}
                location={pendingLocation}
                context={pendingContext ?? "SCH"}
                isSubmitting={isSubmittingComment}
                mentionCandidates={mentionCandidates}
            />}

            {selectedComment && (
                <CommentCard
                    comment={selectedComment}
                    screenPosition={commentCardScreenPosition}
                    canModify={canModifyComments}
                    onClose={() => setSelectedCommentId(null)}
                    onResolve={(commentId, resolved) => void resolveComment(commentId, resolved)}
                    onReply={replyToComment}
                    onDelete={deleteComment}
                    onPromote={promoteComment}
                    onRetrySync={retryCommentSync}
                />
            )}
        </div>
    );
}
