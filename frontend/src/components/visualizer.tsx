import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Cpu, Box, FileText, CircuitBoard, Layers3, PackageCheck, MessageSquare, MessageSquarePlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EngineeringBomTable } from "./engineering-bom-table";
import { SelectionInspector, type LabelInstanceRef } from "./selection-inspector";
import { WebGpu3dTab } from "./webgpu-3d-tab";
import { EcadViewerControls } from "./ecad-viewer-controls";
import { CommentForm, type CommentFormSubmitPayload } from "./comment-form";
import { CommentCard } from "./comment-card";
import { CommentPanel } from "./comment-panel";
import { ViewerOverlayRail } from "./viewer-overlay-rail";
import { fetchApi, readApiError } from "@/lib/api";
import { throwIfJobFailed, watchPrismJob } from "@/lib/jobs";
import { canWriteCatalog } from "@/lib/roles";
import { crossProbeRequestForSelection, normalizeEcadSelection } from "@/lib/prism-selection";
import { usePrismCrossProbe } from "@/hooks/use-prism-cross-probe";
import type { User } from "@/types/auth";
import type {
    ECadViewerElement,
    EcadCommentAnchor,
    EcadCommentAreaDetail,
    EcadCommentOverlayHitDetail,
    EcadSemanticSelectionDetail,
    EcadViewportInsets,
} from "@/types/ecad-viewer";
import type { PrismSelection, PrismSemanticIndex } from "@/types/prism-selection";
import type { Comment, CommentContext, CommentLocation, CommentsFile, MentionCandidate } from "@/types/comments";
import {
    DEFAULT_COMMENT_CLASS,
    DEFAULT_COMMENT_SEVERITY,
} from "@/types/comments";

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

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

function normalizeComment(raw: Comment): Comment {
    return {
        ...raw,
        commentClass: raw.commentClass ?? DEFAULT_COMMENT_CLASS,
        severity: raw.severity ?? DEFAULT_COMMENT_SEVERITY,
        mentions: raw.mentions ?? [],
        replies: raw.replies ?? [],
    };
}

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

function worldToViewportScreen(
    viewer: ECadViewerElement | null,
    x: number,
    y: number,
): { x: number; y: number } | null {
    if (!viewer) return null;
    const local = viewer.getScreenLocation(x, y);
    if (!local) return null;
    const rect = viewer.getBoundingClientRect();
    return { x: rect.left + local.x, y: rect.top + local.y };
}

function publishCommentsOverlay(
    viewer: ECadViewerElement | null,
    context: CommentContext,
    comments: Comment[],
    activePage?: {
        projectPath: string;
        filename: string;
        page?: string;
    } | null,
): void {
    if (!viewer) return;

    const filtered = comments.filter((comment) => {
        if (comment.context !== context) return false;
        if (context === "SCH" && activePage && comment.location.page) {
            // New comments use the unique instance path. Continue accepting
            // filename/page identifiers so existing comment files still show.
            return [activePage.projectPath, activePage.filename, activePage.page]
                .filter(Boolean)
                .includes(comment.location.page);
        }
        return true;
    });

    viewer.setCommentOverlays({
        context,
        comments: filtered.map((comment) => {
            const page = comment.location.page;
            const anchor: EcadCommentAnchor = comment.elementId
                ? { kind: "source-item", uuid: comment.elementId, page }
                : {
                      kind: "world",
                      x: comment.location.x,
                      y: comment.location.y,
                      page,
                  };
            return {
                id: comment.id,
                anchor,
                areaBounds: comment.location.bounds,
                metadata: { commentId: comment.id },
                accessibilityLabel: comment.content.slice(0, 80),
            };
        }),
    });
}

type EcadViewerHostProps = {
    viewerKey: string;
    sources: ViewerBlobSource[];
    active: boolean;
    setViewerRef: (node: ECadViewerElement | null) => void;
    onReady: () => void;
    viewportInsets: EcadViewportInsets;
};

function EcadViewerHost({
    viewerKey,
    sources,
    active,
    setViewerRef,
    onReady,
    viewportInsets,
}: EcadViewerHostProps) {
    const hostRef = useRef<ECadViewerElement | null>(null);
    const replaceReadyRef = useRef<Promise<void>>(Promise.resolve());
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
            await hostRef.current.replaceSources({
                revisionKey: viewerKey,
                sources: [rootSource],
            });
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

        replaceReadyRef.current = replaceRoot();

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
        void appendRemainingSources();
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
    const [searchParams] = useSearchParams();
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
    const [activeSchematicPage, setActiveSchematicPage] = useState<{
        projectPath: string;
        filename: string;
        page?: string;
    } | null>(null);

    // Comment collaboration state
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentMode, setCommentMode] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<CommentLocation | null>(null);
    const [pendingContext, setPendingContext] = useState<CommentContext | null>(null);
    const [pendingElement, setPendingElement] = useState<PendingCommentElement | null>(null);
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [commentCardScreenPosition, setCommentCardScreenPosition] = useState<{ x: number; y: number } | null>(null);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
    const lastSelectionRef = useRef<EcadSemanticSelectionDetail | null>(null);

    const {
        selection: globalSelection,
        select: selectGlobal,
        crossProbe: crossProbeGlobal,
        clear: clearGlobalSelection,
        registerClient,
        notifyClientReady,
    } = usePrismCrossProbe(semanticIndex);
    const notifySchematicViewerReady = useCallback(
        () => notifyClientReady("visualizer-schematic"),
        [notifyClientReady],
    );
    const notifyPcbViewerReady = useCallback(
        () => notifyClientReady("visualizer-pcb"),
        [notifyClientReady],
    );
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

        const fetchData = async () => {
            const baseUrl = `/api/projects/${projectId}`;

            try {
                const [ibomRes, supportRes, commentsRes, mentionsRes] = await Promise.all([
                    fetch(appendCommit(`${baseUrl}/ibom`), { signal }),
                    fetch(appendCommit(`${baseUrl}/viewer/support-files`), { signal }),
                    fetchApi(`${baseUrl}/comments`, { signal }),
                    fetchApi(`${baseUrl}/comments/mention-candidates`, { signal }),
                ]);

                if (ibomRes.ok) {
                    setIbomUrl(appendCommit(`${baseUrl}/ibom`));
                } else {
                    setIbomUrl(null);
                }
                if (supportRes.ok) {
                    const payload = await supportRes.json() as { files?: ViewerBlobSource[] };
                    setViewerSupportFiles(payload.files ?? []);
                } else {
                    setViewerSupportFiles([]);
                }
                if (commentsRes.ok) {
                    const payload = await commentsRes.json() as CommentsFile;
                    setComments((payload.comments ?? []).map(normalizeComment));
                } else {
                    setComments([]);
                }
                if (mentionsRes.ok) {
                    const candidates = await mentionsRes.json() as MentionCandidate[];
                    setMentionCandidates(candidates);
                } else {
                    setMentionCandidates([]);
                }

            } catch (err) {
                if (!isAbortError(err)) {
                    console.error("Error loading visualizer data", err);
                }
            } finally {
                // SCH/PCB source loading is intentionally independent of these helpers.
            }
        };

        void fetchData();
        return () => controller.abort();
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

            const loadSchematic = async () => {
                try {
                    const baseUrl = `/api/projects/${projectId}`;

                    const [schRes, subsheetsRes] = await Promise.allSettled([
                        fetch(appendCommit(`${baseUrl}/schematic`), { signal }),
                        fetch(appendCommit(`${baseUrl}/schematic/subsheets`), { signal })
                    ]);

                    // Handle Schematic
                    if (schRes.status === "fulfilled" && schRes.value.ok) {
                        const schematicText = await schRes.value.text();
                        if (signal.aborted) return;
                        setSchematicContent(schematicText);
                    } else {
                        console.error("Schematic not found");
                        setSchematicContent(null);
                    }

                    // Handle Subsheets
                    if (subsheetsRes.status === "fulfilled" && subsheetsRes.value.ok) {
                        const data = await subsheetsRes.value.json();
                        if (signal.aborted) return;
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

                            if (signal.aborted) return;

                            const loadedSubsheets = subsheetResults
                                .filter((result): result is PromiseFulfilledResult<{ filename: string; content: string }> => result.status === "fulfilled")
                                .map((result) => result.value);
                            setSubsheets(loadedSubsheets);

                            subsheetResults
                                .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                                .forEach((result) => {
                                    console.warn("Failed to load one subsheet", result.reason);
                                });
                        }
                    } else {
                        setSubsheets([]);
                    }
                } catch (err) {
                    if (!isAbortError(err)) {
                        console.error("Error loading schematic content", err);
                    }
                } finally {
                    if (!signal.aborted) {
                        setSchematicContentLoaded(true);
                    }
                }
            };

            void loadSchematic();
            return () => controller.abort();
        }
    }, [activeTab, schematicContentLoaded, projectId, appendCommit]);

    // Load PCB content eagerly, not on first PCB-tab visit. Waiting until the tab
    // was opened left the board unloaded behind a "open the PCB tab" placeholder;
    // fetching up front means the board is ready the moment the tab is shown.
    useEffect(() => {
        if (pcbContentLoaded) return;
        const controller = new AbortController();
        const signal = controller.signal;

        const loadPcb = async () => {
            try {
                const baseUrl = `/api/projects/${projectId}`;
                const pcbRes = await fetch(appendCommit(`${baseUrl}/pcb`), { signal });

                if (pcbRes.ok) {
                    const pcbText = await pcbRes.text();
                    if (signal.aborted) return;
                    setPcbContent(pcbText);
                } else {
                    console.error("PCB not found");
                    setPcbContent(null);
                }
            } catch (err) {
                if (!isAbortError(err)) {
                    console.error("Error loading PCB content", err);
                }
            } finally {
                if (!signal.aborted) {
                    setPcbContentLoaded(true);
                }
            }
        };

        void loadPcb();
        return () => controller.abort();
    }, [pcbContentLoaded, projectId, appendCommit]);

    // Reset lazy loading flags when project changes
    useEffect(() => {
        setSchematicContentLoaded(false);
        setPcbContentLoaded(false);
        setSchematicContent(null);
        setSubsheets([]);
        setViewerSupportFiles([]);
        setPcbContent(null);
        setIbomUrl(null);
        setSemanticIndex(null);
        setSemanticIndexLoading(true);
        setSemanticIndexError(null);
        setRightRailTab(null);
        setThreeDActivated(false);
        setPcbActivated(false);
        clearGlobalSelection();
        setComments([]);
        setMentionCandidates([]);
        setCommentMode(false);
        setShowCommentForm(false);
        setPendingLocation(null);
        setPendingContext(null);
        setPendingElement(null);
        setSelectedCommentId(null);
        setCommentCardScreenPosition(null);
        lastSelectionRef.current = null;
    }, [clearGlobalSelection, commit, projectId]);

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

        schematicViewer?.addEventListener("ecad-viewer:selection", handleSelection as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:selection", handleSelection as EventListener);
        schematicViewer?.addEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
        pcbViewer?.addEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);

        return () => {
            schematicViewer?.removeEventListener("ecad-viewer:selection", handleSelection as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:selection", handleSelection as EventListener);
            schematicViewer?.removeEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
            pcbViewer?.removeEventListener("ecad-viewer:crossprobe", handleCrossProbe as EventListener);
        };
    }, [commit, clearGlobalSelection, crossProbeGlobal, pcbViewerElement, schematicViewerElement, selectGlobal, semanticIndex?.sourceRevisionKey]);

    useEffect(() => {
        const applySelection = (
            viewer: ECadViewerElement | null,
            targetContext: "SCH" | "PCB",
            selection: PrismSelection | null,
        ) => {
            if (!viewer) return;
            if (!selection) {
                viewer.clearSelection();
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

    useEffect(() => {
        if (globalSelection) {
            setRightRailTab("selection");
        } else {
            // Selection cleared (deselect / click-away): close the selection panel
            // so the side menu does not linger with nothing selected. Leave other
            // rail tabs (comments) alone.
            setRightRailTab((tab) => (tab === "selection" ? null : tab));
        }
    }, [globalSelection]);

    // Refresh the layer color map when a selection carries a layer, so the
    // inspector can show a swatch matching the layer menu. Read lazily from the
    // PCB viewer; layer colors are stable for a board.
    useEffect(() => {
        if (!globalSelection?.anchor?.layer || !pcbViewerElement) return;
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
    }, [globalSelection, pcbViewerElement]);

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

        const itemType = (selection.anchor?.itemType || "").toLowerCase();
        if (itemType !== "global-label" && itemType !== "label") {
            setLabelInstances([]);
            return;
        }

        const all = viewer.findLabelInstances(selection.netName);
        const pageHint =
            activeSchematicPage?.filename ||
            selection.anchor?.page ||
            selection.anchor?.sheet ||
            undefined;
        const sheetBase = (value: string) => {
            const parts = value.split("/").filter(Boolean);
            return parts[parts.length - 1] || value;
        };
        const sheetMatches = (sheet: string, page: string | undefined) => {
            if (!page) return true;
            if (sheet === page) return true;
            return sheetBase(sheet) === sheetBase(page);
        };

        const filtered =
            itemType === "global-label"
                ? all.filter((instance) => instance.kind === "global")
                : all.filter(
                      (instance) =>
                          instance.kind === "net" && sheetMatches(instance.sheet, pageHint),
                  );
        setLabelInstances(filtered);
    }, [activeSchematicPage?.filename, globalSelection, schematicViewerElement]);

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

    // Publish comment markers to the ecad-viewer overlay layer. This never
    // touches replaceSources/appendSources - overlays are a separate render pass.
    useEffect(() => {
        if (activeTab === "sch") {
            publishCommentsOverlay(schematicViewerElement, "SCH", comments, activeSchematicPage);
            pcbViewerElement?.clearCommentOverlays("PCB");
        } else if (activeTab === "pcb") {
            publishCommentsOverlay(pcbViewerElement, "PCB", comments);
            schematicViewerElement?.clearCommentOverlays("SCH");
        } else {
            schematicViewerElement?.clearCommentOverlays("SCH");
            pcbViewerElement?.clearCommentOverlays("PCB");
        }
    }, [activeTab, activeSchematicPage, comments, pcbViewerElement, schematicViewerElement]);

    // Mirror comment mode onto whichever viewer is currently active.
    useEffect(() => {
        applyCommentMode(schematicViewerElement, commentMode && activeTab === "sch");
        applyCommentMode(pcbViewerElement, commentMode && activeTab === "pcb");
    }, [activeTab, commentMode, pcbViewerElement, schematicViewerElement]);

    const openCommentCardForOverlayHit = useCallback((event: Event) => {
        const detail = (event as CustomEvent<EcadCommentOverlayHitDetail>).detail;
        const metadata = detail.metadata as { commentId?: string } | null | undefined;
        const commentId = metadata?.commentId ?? detail.commentId;
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
        setPendingLocation({
            x: detail.x,
            y: detail.y,
            layer: detail.layer ?? "",
            page: detail.page,
            bounds: detail.bounds,
        });
        setPendingElement(null);
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
                    elementId: pendingElement?.elementId,
                    elementRef: pendingElement?.elementRef,
                    elementType: pendingElement?.elementType,
                    commentClass: payload.commentClass,
                    severity: payload.severity,
                    mentions: payload.mentions,
                }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to post comment"));
            const created = normalizeComment(await response.json() as Comment);
            setComments((prev) => [...prev, created]);
            setShowCommentForm(false);
            setPendingLocation(null);
            setPendingContext(null);
            setPendingElement(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to post comment");
        } finally {
            setIsSubmittingComment(false);
        }
    }, [pendingContext, pendingElement, pendingLocation, projectId, user?.name]);

    const resolveComment = useCallback(async (commentId: string, resolved: boolean) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "PATCH",
                body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to update comment"));
            const updated = normalizeComment(await response.json() as Comment);
            setComments((prev) => prev.map((entry) => (entry.id === commentId ? updated : entry)));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update comment");
        }
    }, [projectId]);

    const replyToComment = useCallback(async (commentId: string, content: string) => {
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}/replies`, {
                method: "POST",
                body: JSON.stringify({ content, author: user?.name }),
            });
            if (!response.ok) throw new Error(await readApiError(response, "Failed to add reply"));
            const payload = await response.json() as { comment: Comment };
            setComments((prev) => prev.map((entry) => (entry.id === commentId ? normalizeComment(payload.comment) : entry)));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add reply");
        }
    }, [projectId, user?.name]);

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
    }, [projectId]);

    const handleCommentClick = useCallback((comment: Comment) => {
        const targetTab: VisualizerTab = comment.context === "SCH" ? "sch" : "pcb";
        setActiveTab((current) => (current === targetTab ? current : targetTab));
        const viewer = targetTab === "sch" ? schematicViewerRef.current : pcbViewerRef.current;
        if (viewer) {
            if (comment.location.page) viewer.switchPage(comment.location.page);
            viewer.zoomToLocation(comment.location.x, comment.location.y);
        }
        setSelectedCommentId(comment.id);
        setCommentCardScreenPosition(
            worldToViewportScreen(viewer, comment.location.x, comment.location.y),
        );
    }, []);

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
                clearGlobalSelection();
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
                    setPendingElement({
                        elementId: selection.uuid,
                        elementRef: selection.reference,
                        elementType: selection.itemType,
                    });
                    setShowCommentForm(true);
                } else {
                    setCommentMode(true);
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
    }, [activeTab, canModifyComments, clearGlobalSelection]);

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
                                onSelection={crossProbeGlobal}
                                onClearSelection={clearGlobalSelection}
                            />
                        </div>
                    )}

                    {activeTab === "bom" && (
                        <div className="absolute inset-0 z-20 bg-background">
                            <EngineeringBomTable
                                semanticIndex={semanticIndex}
                                loading={semanticIndexLoading}
                                error={semanticIndexError}
                                selection={globalSelection}
                                onSelection={crossProbeGlobal}
                                onRetry={() => void generateSemanticIdentity()}
                            />
                        </div>
                    )}

                    {activeTab === "assembly" && (
                        <div className="absolute inset-0 z-20 bg-background">
                            {ibomUrl ? (
                                <iframe
                                    title="Assembly Assistant"
                                    src={ibomUrl}
                                    className="h-full w-full border-0 bg-background"
                                    sandbox="allow-scripts allow-same-origin allow-downloads"
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                                    No interactive assembly HTML was found for this revision.
                                </div>
                            )}
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
                    >
                        {rightRailTab === "comments" ? (
                            <CommentPanel
                                comments={comments}
                                onClose={() => setRightRailTab(null)}
                                onResolve={(commentId, resolved) => void resolveComment(commentId, resolved)}
                                onReply={replyToComment}
                                onDelete={deleteComment}
                                onCommentClick={handleCommentClick}
                                canModify={canModifyComments}
                                highlightedId={selectedCommentId}
                                embedded
                            />
                        ) : globalSelection ? (
                            <SelectionInspector
                                open
                                selection={globalSelection}
                                semanticIndex={semanticIndex}
                                layerColors={layerColors}
                                onOpenChange={(open) => {
                                    if (!open) setRightRailTab(null);
                                }}
                                onClear={clearGlobalSelection}
                                onImportComponent={globalSelection.kind === "net" ? undefined : handleImportSelectedComponent}
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

            <CommentForm
                isOpen={showCommentForm}
                onClose={() => {
                    setShowCommentForm(false);
                    setPendingLocation(null);
                    setPendingContext(null);
                    setPendingElement(null);
                }}
                onSubmit={(payload) => void submitComment(payload)}
                location={pendingLocation}
                context={pendingContext ?? "SCH"}
                isSubmitting={isSubmittingComment}
                mentionCandidates={mentionCandidates}
            />

            {selectedComment && (
                <CommentCard
                    comment={selectedComment}
                    screenPosition={commentCardScreenPosition}
                    canModify={canModifyComments}
                    onClose={() => setSelectedCommentId(null)}
                    onResolve={(commentId, resolved) => void resolveComment(commentId, resolved)}
                    onReply={replyToComment}
                    onDelete={deleteComment}
                />
            )}
        </div>
    );
}
