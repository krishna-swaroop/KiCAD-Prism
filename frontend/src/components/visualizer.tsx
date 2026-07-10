import { lazy, Suspense, useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { Cpu, Box, FileText, MessageSquarePlus, MessageSquare, GitBranch, CircuitBoard, Link2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommentOverlay } from "./comment-overlay";
import { CommentForm } from "./comment-form";
import { CommentPanel } from "./comment-panel";
import { fetchApi } from "@/lib/api";
import type { User } from "@/types/auth";
import type { Comment, CommentContext } from "@/types/comments";
import type {
    CrossProbeContext,
    ECadViewerElement,
    KiCanvasSelectDetail,
} from "@/types/ecad-viewer";

const Model3DViewer = lazy(() =>
    import("./model-3d-viewer").then((module) => ({ default: module.Model3DViewer }))
);

interface VisualizerProps {
    projectId: string;
    user: User | null;
    commit?: string | null;
}

type VisualizerTab = "sch" | "pcb" | "3d" | "ibom";

interface CommentsSourceUrls {
    project_id: string;
    project_name: string;
    base_url: string;
    list_url: string;
    patch_url_template: string;
    reply_url_template: string;
    delete_url_template: string;
}

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError";

const CROSS_PROBE_MAX_RETRIES = 12;
const CROSS_PROBE_RETRY_DELAY_MS = 120;

type ViewerBlobSource = {
    filename: string;
    content: string;
};

const buildViewerKey = (
    kind: "schematic" | "pcb",
    projectId: string,
    commit: string | null | undefined,
    sources: ViewerBlobSource[],
) => {
    const signature = sources
        .map(({ filename, content }) => `${filename}:${content.length}`)
        .join("|");
    return `${kind}:${projectId}:${commit ?? "latest"}:${signature}`;
};

type EcadViewerHostProps = {
    viewerKey: string;
    sources: ViewerBlobSource[];
    setViewerRef: (node: ECadViewerElement | null) => void;
};

function EcadViewerHost({ viewerKey, sources, setViewerRef }: EcadViewerHostProps) {
    const hostRef = useRef<ECadViewerElement | null>(null);

    const attachViewerRef = useCallback((node: ECadViewerElement | null) => {
        hostRef.current = node;
        setViewerRef(node);
    }, [setViewerRef]);

    useLayoutEffect(() => {
        const viewer = hostRef.current;
        if (!viewer || sources.length === 0) return;

        let cancelled = false;

        const hydrateViewer = async () => {
            await customElements.whenDefined("ecad-blob");
            if (cancelled || !hostRef.current) return;

            const activeViewer = hostRef.current;
            activeViewer.querySelectorAll("ecad-blob").forEach((blob) => blob.remove());

            for (const source of sources) {
                const blob = document.createElement("ecad-blob") as HTMLElement & {
                    filename?: string;
                    content?: string;
                };
                blob.filename = source.filename;
                blob.content = source.content;
                activeViewer.appendChild(blob);
            }

            const viewerWithLoader = activeViewer as ECadViewerElement & {
                load_src?: () => Promise<void> | void;
            };
            if (typeof viewerWithLoader.load_src === "function") {
                await viewerWithLoader.load_src();
            }
        };

        void hydrateViewer();

        return () => {
            cancelled = true;
        };
    }, [sources, viewerKey]);

    return (
        <ecad-viewer
            ref={attachViewerRef}
            style={{ width: "100%", height: "100%" }}
            show-header="true"
            header-sections="beginning,end"
            key={viewerKey}
        />
    );
}

export function Visualizer({ projectId, user, commit }: VisualizerProps) {
    const [schematicViewerElement, setSchematicViewerElement] = useState<ECadViewerElement | null>(null);
    const [pcbViewerElement, setPcbViewerElement] = useState<ECadViewerElement | null>(null);
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

    const [activeTab, setActiveTab] = useState<VisualizerTab>("sch");
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<{ filename: string, content: string }[]>([]);
    const [pcbContent, setPcbContent] = useState<string | null>(null);
    const [modelUrl, setModelUrl] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [schematicContentLoaded, setSchematicContentLoaded] = useState(false);
    const [pcbContentLoaded, setPcbContentLoaded] = useState(false);
    const [loading, setLoading] = useState(true);

    const [comments, setComments] = useState<Comment[]>([]);
    const [activePage, setActivePage] = useState<string>("root.kicad_sch");
    const [commentMode, setCommentMode] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [showCommentPanel, setShowCommentPanel] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<{ x: number, y: number, layer: string } | null>(null);
    const [pendingContext, setPendingContext] = useState<CommentContext>("PCB");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isPushingComments, setIsPushingComments] = useState(false);
    const [pushMessage, setPushMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showPushDialog, setShowPushDialog] = useState(false);
    const [commentsSourceUrls, setCommentsSourceUrls] = useState<CommentsSourceUrls | null>(null);
    const [isUrlsPopoverOpen, setIsUrlsPopoverOpen] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const canModifyComments = user?.role === "admin" || user?.role === "designer";
    const lastCrossProbeRef = useRef<Record<CrossProbeContext, string | null>>({
        SCH: null,
        PCB: null,
    });
    const crossProbeRetryTimerRef = useRef<Record<CrossProbeContext, number | null>>({
        SCH: null,
        PCB: null,
    });
    const crossProbeRunIdRef = useRef<Record<CrossProbeContext, number>>({
        SCH: 0,
        PCB: 0,
    });
    const activeCommentContext: CommentContext | null = activeTab === "sch" ? "SCH" : activeTab === "pcb" ? "PCB" : null;

    const applyCommentModeToViewer = useCallback((viewer: ECadViewerElement | null, enabled: boolean) => {
        if (!viewer) return;
        if (viewer.setCommentMode) {
            viewer.setCommentMode(enabled);
            return;
        }

        if (enabled) {
            viewer.setAttribute("comment-mode", "true");
        } else {
            viewer.removeAttribute("comment-mode");
        }
    }, []);

    const normalizeDesignator = useCallback((value: unknown): string | null => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        return /^[A-Za-z]+\d+[A-Za-z]*$/.test(trimmed) ? trimmed : null;
    }, []);

    const extractDesignatorFromSelection = useCallback((item: unknown, sourceContext?: CrossProbeContext): string | null => {
        const isFootprintLike = (value: Record<string, unknown>): boolean => {
            const typeName = String(value.constructor?.name ?? "").toLowerCase();
            const itemType = String(value.type ?? value.kind ?? value.itemType ?? "").toLowerCase();
            return (
                typeName.includes("footprint") ||
                typeName.includes("module") ||
                itemType.includes("footprint") ||
                itemType.includes("module") ||
                typeof value.fp_texts !== "undefined" ||
                typeof value.pads !== "undefined"
            );
        };

        const readDesignator = (entry: Record<string, unknown>): string | null => {
            const direct = [
                entry.reference,
                entry.Reference,
                entry.designator,
                entry.elementRef,
                entry.ref,
                entry.Ref,
            ];
            for (const candidate of direct) {
                const designator = normalizeDesignator(candidate);
                if (designator) return designator;
            }

            if (typeof entry.get_property_text === "function") {
                try {
                    const fromProperty = normalizeDesignator(
                        (entry.get_property_text as (name: string) => unknown)("Reference")
                    );
                    if (fromProperty) return fromProperty;
                } catch {
                    // noop
                }
            }

            const properties = entry.properties;
            if (properties instanceof Map) {
                const refProp = properties.get("Reference");
                if (refProp && typeof refProp === "object") {
                    const propEntry = refProp as Record<string, unknown>;
                    const fromMap = normalizeDesignator(
                        propEntry.shown_text ?? propEntry.text ?? propEntry.value
                    );
                    if (fromMap) return fromMap;
                }
            }

            const defaultInstance = entry.default_instance;
            if (defaultInstance && typeof defaultInstance === "object") {
                const fromDefault = normalizeDesignator(
                    (defaultInstance as Record<string, unknown>).reference
                );
                if (fromDefault) return fromDefault;
            }

            return null;
        };

        const collectObjectPath = (value: unknown, depth = 0): Record<string, unknown>[] => {
            if (!value || typeof value !== "object" || depth > 5) return [];
            const entry = value as Record<string, unknown>;
            return [
                entry,
                ...collectObjectPath(entry.parent, depth + 1),
                ...collectObjectPath(entry.item, depth + 1),
                ...collectObjectPath(entry.context, depth + 1),
            ];
        };

        const path = collectObjectPath(item);
        if (sourceContext === "PCB") {
            for (const entry of path) {
                if (!isFootprintLike(entry)) continue;
                const designator = readDesignator(entry);
                if (designator) return designator;
            }
        }

        for (const entry of path) {
            const designator = readDesignator(entry);
            if (designator) return designator;
        }

        const findDesignator = (value: unknown, depth = 0): string | null => {
            if (!value || typeof value !== "object" || depth > 3) return null;
            const entry = value as Record<string, unknown>;
            const designator = readDesignator(entry);
            if (designator) return designator;

            return (
                findDesignator(entry.parent, depth + 1) ||
                findDesignator(entry.item, depth + 1) ||
                findDesignator(entry.context, depth + 1)
            );
        };

        return findDesignator(item);
    }, [normalizeDesignator]);

    const getCrossProbeTargetContext = useCallback(
        (sourceContext: CrossProbeContext): CrossProbeContext =>
            sourceContext === "SCH" ? "PCB" : "SCH",
        [],
    );

    const clearCrossProbeRetry = useCallback((targetContext: CrossProbeContext) => {
        const timerId = crossProbeRetryTimerRef.current[targetContext];
        if (timerId !== null) {
            window.clearTimeout(timerId);
            crossProbeRetryTimerRef.current[targetContext] = null;
        }
    }, []);

    const runCrossProbe = useCallback(
        function runCrossProbe(
            targetViewer: ECadViewerElement | null,
            sourceContext: "SCH" | "PCB",
            designator: string,
            attempts = 0,
            runId?: number,
        ) {
            const targetContext = getCrossProbeTargetContext(sourceContext);

            if (attempts === 0) {
                clearCrossProbeRetry(targetContext);
                crossProbeRunIdRef.current[targetContext] += 1;
                runId = crossProbeRunIdRef.current[targetContext];
            }

            if (!targetViewer) {
                clearCrossProbeRetry(targetContext);
                return;
            }

            if (!runId || crossProbeRunIdRef.current[targetContext] !== runId) {
                return;
            }

            const result = targetViewer.requestCrossProbe({
                sourceContext,
                targetContext,
                mode: "select",
                kind: "designator",
                value: designator,
                designator,
            });

            if (
                !result.resolved &&
                result.reason === "target-not-available" &&
                attempts < CROSS_PROBE_MAX_RETRIES
            ) {
                crossProbeRetryTimerRef.current[targetContext] = window.setTimeout(() => {
                    runCrossProbe(
                        targetViewer,
                        sourceContext,
                        designator,
                        attempts + 1,
                        runId,
                    );
                }, CROSS_PROBE_RETRY_DELAY_MS);
                return;
            }

            clearCrossProbeRetry(targetContext);
        },
        [clearCrossProbeRetry, getCrossProbeTargetContext],
    );

    const copyToClipboard = async (label: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(label);
            setTimeout(() => setCopiedField(null), 1400);
        } catch (error) {
            console.warn("Failed to copy URL", error);
        }
    };

    const appendCommit = useCallback((url: string) => {
        if (!commit) return url;
        return `${url}${url.includes("?") ? "&" : "?"}commit=${encodeURIComponent(commit)}`;
    }, [commit]);

    useEffect(() => {
        setModelUrl(null);
        setIbomUrl(null);
        setSchematicContent(null);
        setPcbContent(null);
        setSubsheets([]);
        setSchematicContentLoaded(false);
        setPcbContentLoaded(false);
    }, [projectId, commit]);

    // Initial Data Fetch
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchData = async () => {
            setLoading(true);
            const baseUrl = `/api/projects/${projectId}`;

            try {
                // Parallel fetch for main assets (excluding schematic and PCB content for now)
                const [modelRes, ibomRes, commentsRes, filesRes] = await Promise.allSettled([
                    fetch(appendCommit(`${baseUrl}/3d-model`), { signal }),
                    fetch(appendCommit(`${baseUrl}/ibom`), { signal }),
                    fetch(`/api/projects/${projectId}/comments`, { signal }),
                    fetch(appendCommit(`${baseUrl}/files?type=design`), { signal })
                ]);

                // Handle 3D
                let glbUrl = null;
                if (filesRes.status === "fulfilled" && filesRes.value.ok) {
                    try {
                        const files = await filesRes.value.json();
                        if (signal.aborted) return;
                        const glbFile = files.find((f: any) =>
                            f.path.toLowerCase().startsWith("3dmodel/") &&
                            f.name.toLowerCase().endsWith(".glb")
                        );
                        if (glbFile) {
                            glbUrl = appendCommit(`${baseUrl}/download?path=${encodeURIComponent(glbFile.path)}&type=design&inline=true`);
                        }
                    } catch (e) {
                        if (!isAbortError(e)) {
                            console.warn("Error parsing design files", e);
                        }
                    }
                }

                if (glbUrl) {
                    setModelUrl(glbUrl);
                } else if (modelRes.status === "fulfilled" && modelRes.value.ok) {
                    setModelUrl(appendCommit(`${baseUrl}/3d-model`));
                } else {
                    setModelUrl(null);
                }

                // Handle iBoM
                if (ibomRes.status === "fulfilled" && ibomRes.value.ok) {
                    setIbomUrl(appendCommit(`${baseUrl}/ibom`));
                } else {
                    setIbomUrl(null);
                }

                // Handle Comments
                if (commentsRes.status === "fulfilled" && commentsRes.value.ok) {
                    const cData = await commentsRes.value.json();
                    if (signal.aborted) return;
                    setComments(cData.comments || []);
                } else {
                    setComments([]);
                }

                try {
                    const sourceResponse = await fetch(`/api/projects/${projectId}/comments/source-urls`, { signal });

                    if (sourceResponse.ok) {
                        const sourceData = await sourceResponse.json();
                        if (signal.aborted) return;
                        setCommentsSourceUrls(sourceData);
                    } else {
                        setCommentsSourceUrls(null);
                    }
                } catch (sourceError) {
                    if (!isAbortError(sourceError)) {
                        console.warn("Failed to load comments source URLs", sourceError);
                    }
                }

            } catch (err) {
                if (!isAbortError(err)) {
                    console.error("Error loading visualizer data", err);
                }
            } finally {
                if (!signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void fetchData();
        return () => controller.abort();
    }, [projectId, appendCommit]);

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

    // Lazy load PCB content when PCB tab is first accessed
    useEffect(() => {
        if (activeTab === "pcb" && !pcbContentLoaded) {
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
        }
    }, [activeTab, pcbContentLoaded, projectId, appendCommit]);

    // Reset lazy loading flags when project changes
    useEffect(() => {
        setSchematicContentLoaded(false);
        setPcbContentLoaded(false);
        setSchematicContent(null);
        setSubsheets([]);
        setPcbContent(null);
        setModelUrl(null);
        setIbomUrl(null);
        setComments([]);
        setCommentsSourceUrls(null);
        setActivePage("root.kicad_sch");
        setCommentMode(false);
        setShowCommentForm(false);
        setShowCommentPanel(false);
        setPendingLocation(null);
        setPendingContext("PCB");
        setIsSubmittingComment(false);
        setIsPushingComments(false);
        setPushMessage(null);
        setShowPushDialog(false);
        setIsUrlsPopoverOpen(false);
        setCopiedField(null);
        lastCrossProbeRef.current = { SCH: null, PCB: null };
        clearCrossProbeRetry("SCH");
        clearCrossProbeRetry("PCB");
        crossProbeRunIdRef.current = { SCH: 0, PCB: 0 };
    }, [projectId, clearCrossProbeRetry]);

    useEffect(() => {
        return () => {
            clearCrossProbeRetry("SCH");
            clearCrossProbeRetry("PCB");
        };
    }, [clearCrossProbeRetry]);

    // Event Listeners for ecad-viewer
    useEffect(() => {
        const schematicViewer = schematicViewerElement;
        const pcbViewer = pcbViewerElement;

        if (!schematicViewer && !pcbViewer) return;

        const handleCommentClick = (e: CustomEvent) => {
            if (!canModifyComments) {
                return;
            }
            if (activeCommentContext !== "SCH" && activeCommentContext !== "PCB") {
                return;
            }

            const detail = e.detail;
            setPendingLocation({
                x: detail.worldX,
                y: detail.worldY,
                layer: detail.layer || "F.Cu",
            });
            setPendingContext(activeCommentContext);
            setShowCommentForm(true);
        };

        const handleSheetLoad = (e: CustomEvent) => {
            if (typeof e.detail === 'string') setActivePage(e.detail);
            else if (e.detail?.filename) setActivePage(e.detail.filename);
            else if (e.detail?.sheetName) setActivePage(e.detail.sheetName);
        };

        // Add listeners to both viewers
        if (schematicViewer) {
            schematicViewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
            schematicViewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
        }

        if (pcbViewer) {
            pcbViewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
            pcbViewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
        }

        return () => {
            if (schematicViewer) {
                schematicViewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
                schematicViewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
            }
            if (pcbViewer) {
                pcbViewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
                pcbViewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
            }
        };
    }, [activeCommentContext, canModifyComments, schematicViewerElement, pcbViewerElement]);

    // Toggle Comment Mode
    const toggleCommentMode = () => {
        if (!canModifyComments) {
            return;
        }
        setCommentMode((previous) => {
            const next = !previous;
            applyCommentModeToViewer(schematicViewerRef.current, next);
            applyCommentModeToViewer(pcbViewerRef.current, next);
            return next;
        });
    };

    useEffect(() => {
        applyCommentModeToViewer(schematicViewerElement, commentMode);
        applyCommentModeToViewer(pcbViewerElement, commentMode);
    }, [commentMode, schematicViewerElement, pcbViewerElement, applyCommentModeToViewer]);

    useEffect(() => {
        if (!commentMode) return;

        if (activeTab === "sch") {
            applyCommentModeToViewer(schematicViewerRef.current, true);
            return;
        }

        if (activeTab === "pcb") {
            applyCommentModeToViewer(pcbViewerRef.current, true);
        }
    }, [activeTab, commentMode, applyCommentModeToViewer]);

    useEffect(() => {
        schematicViewerRef.current?.setCrossProbeEnabled(true);
        pcbViewerRef.current?.setCrossProbeEnabled(true);
    }, [schematicViewerElement, pcbViewerElement]);

    useEffect(() => {
        const schematicViewer = schematicViewerElement;
        const pcbViewer = pcbViewerElement;
        if (!schematicViewer && !pcbViewer) return;

        const handleCrossProbeSelection = (
            fallbackSourceContext: CrossProbeContext,
            targetViewer: ECadViewerElement | null,
            event: Event,
        ) => {
            const detail = (event as CustomEvent<KiCanvasSelectDetail>).detail;
            const sourceContext = detail?.sourceContext ?? fallbackSourceContext;
            const designator = extractDesignatorFromSelection(detail?.item, sourceContext);
            if (!designator) return;
            lastCrossProbeRef.current[sourceContext] = designator;
            runCrossProbe(targetViewer, sourceContext, designator);
        };

        const onSchematicSelect = (event: Event) =>
            handleCrossProbeSelection("SCH", pcbViewerRef.current, event);
        const onPcbSelect = (event: Event) =>
            handleCrossProbeSelection("PCB", schematicViewerRef.current, event);
        const onPcbFitterSelection = (event: Event) => {
            const detail = (event as CustomEvent<{ items?: unknown[] }>).detail;
            const items = Array.isArray(detail?.items) ? detail.items : [];
            const designators = Array.from(new Set(
                items
                    .map((entry) => extractDesignatorFromSelection(entry, "PCB"))
                    .filter((designator): designator is string => Boolean(designator))
            ));
            const designator = designators[0] ?? null;
            if (!designator) return;
            lastCrossProbeRef.current.PCB = designator;
            runCrossProbe(schematicViewerRef.current, "PCB", designator);
        };

        schematicViewer?.addEventListener("kicanvas:select", onSchematicSelect as EventListener);
        pcbViewer?.addEventListener("kicanvas:select", onPcbSelect as EventListener);
        pcbViewer?.addEventListener("kicanvas:fitter-selection", onPcbFitterSelection as EventListener);

        return () => {
            schematicViewer?.removeEventListener("kicanvas:select", onSchematicSelect as EventListener);
            pcbViewer?.removeEventListener("kicanvas:select", onPcbSelect as EventListener);
            pcbViewer?.removeEventListener("kicanvas:fitter-selection", onPcbFitterSelection as EventListener);
        };
    }, [
        schematicViewerElement,
        pcbViewerElement,
        extractDesignatorFromSelection,
        runCrossProbe,
    ]);

    useEffect(() => {
        if (activeTab === "pcb" && lastCrossProbeRef.current.SCH) {
            runCrossProbe(pcbViewerRef.current, "SCH", lastCrossProbeRef.current.SCH);
        } else if (activeTab === "sch" && lastCrossProbeRef.current.PCB) {
            runCrossProbe(schematicViewerRef.current, "PCB", lastCrossProbeRef.current.PCB);
        }
    }, [activeTab, runCrossProbe, schematicViewerElement, pcbViewerElement]);

    // Submit Comment
    const handleSubmitComment = async (content: string) => {
        if (!pendingLocation || !canModifyComments) return;
        setIsSubmittingComment(true);
        try {
            const location = { ...pendingLocation, page: pendingContext === "SCH" ? activePage : "" };
            const response = await fetchApi(`/api/projects/${projectId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    context: pendingContext,
                    location,
                    content,
                    author: user?.name || "anonymous"
                })
            });

            if (response.ok) {
                const newComment = await response.json();
                setComments(prev => [...prev, newComment]);
                setShowCommentForm(false);
                setPendingLocation(null);
                // Turn off comment mode after posting? User might want to post multiple. Keep it on.
            }
        } catch (err) {
            console.error("Create comment failed", err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    // Navigate to Comment
    const handleCommentNavigate = (comment: Comment) => {
        // Force switch to appropriate tab if in 3D/iBom
        if (comment.context === "SCH" && activeTab !== "sch") {
            setActiveTab("sch");
        } else if (comment.context === "PCB" && activeTab !== "pcb") {
            setActiveTab("pcb");
        }

        // Get the appropriate viewer
        const viewer = comment.context === "SCH" ? schematicViewerRef.current : pcbViewerRef.current;
        if (!viewer) return;

        if (comment.context === "SCH" && comment.location.page) {
            viewer.switchPage(comment.location.page);
        }

        if (viewer.zoomToLocation) {
            viewer.zoomToLocation(comment.location.x, comment.location.y);
        }
    };

    // Resolving/Replying
    const handleResolveComment = async (commentId: string, resolved: boolean) => {
        if (!canModifyComments) return;
        const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" })
        });
        if (response.ok) {
            const updated = await response.json();
            setComments(prev => prev.map(c => c.id === commentId ? updated : c));
        }
    };

    const handleReplyComment = async (commentId: string, content: string) => {
        if (!canModifyComments) return;
        const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}/replies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content,
                author: user?.name || "anonymous"
            })
        });
        if (response.ok) {
            const data = await response.json();
            setComments(prev => prev.map(c => c.id === commentId ? data.comment : c));
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!canModifyComments) return;
        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "DELETE",
            });
            if (response.ok) {
                setComments(prev => prev.filter(c => c.id !== commentId));
            }
        } catch (err) {
            console.error("Failed to delete comment", err);
        }
    };

    // Export comments.json artifact from DB snapshot
    const handlePushComments = async () => {
        if (!canModifyComments) return;
        setIsPushingComments(true);
        setPushMessage(null);

        try {
            const response = await fetchApi(`/api/projects/${projectId}/comments/push`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            const data = await response.json();

            if (response.ok) {
                const artifactPath = data.comments_path ? ` (${data.comments_path})` : "";
                setPushMessage({ type: "success", text: `${data.message || "Generated comments artifact."}${artifactPath}` });
                setShowPushDialog(false);
            } else {
                setPushMessage({ type: "error", text: data.detail || "Failed to generate comments artifact." });
            }
        } catch (err: any) {
            setPushMessage({ type: "error", text: err.message || "Network error while generating comments artifact." });
        } finally {
            setIsPushingComments(false);
            // Clear message after 5 seconds
            setTimeout(() => setPushMessage(null), 5000);
        }
    };

    // Filtering comments for Overlay
    const overlayComments = comments.filter(c => {
        if (!activeCommentContext) return false;

        // Must match context
        if (c.context !== activeCommentContext) return false;

        // If SCH, match page
        if (activeCommentContext === "SCH") {
            const norm = (p: string) => p ? p.split('/').pop() || p : "";
            const cPage = norm(c.location.page || "");
            const aPage = norm(activePage);
            // Root handling
            const isRootC = cPage === "root.kicad_sch" || cPage === "root";
            const isRootA = aPage === "root.kicad_sch" || aPage === "root";

            if (isRootA && isRootC) return true;
            return cPage === aPage;
        }
        return true;
    });

    const shouldShowOverlay =
        (activeTab === "sch" && Boolean(schematicContent && schematicViewerElement)) ||
        (activeTab === "pcb" && Boolean(pcbContent && pcbViewerElement));
    const schematicSources = useMemo<ViewerBlobSource[]>(
        () => (schematicContent
            ? [{ filename: "root.kicad_sch", content: schematicContent }, ...subsheets]
            : []),
        [schematicContent, subsheets],
    );
    const pcbSources = useMemo<ViewerBlobSource[]>(
        () => (pcbContent
            ? [{ filename: "board.kicad_pcb", content: pcbContent }]
            : []),
        [pcbContent],
    );
    const schematicViewerKey = buildViewerKey("schematic", projectId, commit, schematicSources);
    const pcbViewerKey = buildViewerKey("pcb", projectId, commit, pcbSources);

    // Tab Config
    const tabs: { id: VisualizerTab; label: string; icon: any }[] = [
        { id: "sch", label: "Schematic", icon: Cpu },
        { id: "pcb", label: "PCB Layout", icon: CircuitBoard },
        { id: "3d", label: "3D View", icon: Box },
        { id: "ibom", label: "iBoM", icon: FileText },
    ];

    if (loading) return <div className="flex justify-center items-center h-full">Loading Visualizer...</div>;

    return (
        <div className="flex flex-col h-full bg-background relative selection-none">
            {/* Toolbar */}
            <div className="flex items-center gap-1 border-b px-2 py-1 bg-muted/20">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setActiveTab(tab.id)}
                            className="text-xs h-8"
                        >
                            <Icon className="w-3 h-3 mr-2" />
                            {tab.label}
                        </Button>
                    );
                })}
                <div className="flex-1" />

                {/* Comment Controls */}
                {(activeTab === "sch" || activeTab === "pcb") && (
                    <>
                        <Popover open={isUrlsPopoverOpen} onOpenChange={setIsUrlsPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-8"
                                    aria-label="Show KiCad comments REST URLs"
                                >
                                    <Link2 className="w-3 h-3 mr-2" />
                                    REST URLs
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" side="bottom" className="w-[520px] max-w-[calc(100vw-2rem)] p-3">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm font-medium">KiCad Comments REST URLs</p>
                                        <p className="text-xs text-muted-foreground">
                                            Copy these into KiCad Comments Source Settings.
                                        </p>
                                    </div>
                                    {commentsSourceUrls ? (
                                        <div className="space-y-2">
                                            {[
                                                { label: "List URL", value: commentsSourceUrls.list_url },
                                                { label: "Patch URL Template", value: commentsSourceUrls.patch_url_template },
                                                { label: "Reply URL Template", value: commentsSourceUrls.reply_url_template },
                                                { label: "Delete URL Template", value: commentsSourceUrls.delete_url_template },
                                            ].map((entry) => (
                                                <div key={entry.label} className="rounded border bg-muted/30 p-2">
                                                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{entry.label}</div>
                                                    <div className="flex items-start gap-2">
                                                        <code className="flex-1 break-all rounded bg-background px-2 py-1 text-[11px]">{entry.value}</code>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 shrink-0"
                                                            onClick={() => copyToClipboard(entry.label, entry.value)}
                                                        >
                                                            {copiedField === entry.label ? (
                                                                <>
                                                                    <Check className="h-3 w-3 mr-1" />
                                                                    Copied
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="h-3 w-3 mr-1" />
                                                                    Copy
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Loading URL helpers...</p>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button
                            variant={commentMode ? "default" : "ghost"}
                            size="sm"
                            onClick={toggleCommentMode}
                            disabled={!canModifyComments}
                            className={`text-xs h-8 ${commentMode ? "bg-amber-600 text-white hover:bg-amber-700" : ""}`}
                        >
                            <MessageSquarePlus className="w-3 h-3 mr-2" />
                            {commentMode ? "Commenting Mode" : "Add Comment"}
                        </Button>
                        <Button
                            variant={showCommentPanel ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setShowCommentPanel(!showCommentPanel)}
                            className="text-xs h-8 ml-1"
                        >
                            <MessageSquare className="w-3 h-3 mr-2" />
                            Comments
                            <span className="ml-1 bg-muted-foreground/20 px-1 rounded-full text-[10px]">
                                {comments.length}
                            </span>
                        </Button>
                        {canModifyComments && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowPushDialog(true)}
                                className="text-xs h-8 ml-1"
                                title="Generate comments.json artifact from DB"
                            >
                                <GitBranch className="w-3 h-3 mr-2" />
                                Generate JSON
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* Push Message Feedback */}
            {pushMessage && (
                <div className={`px-4 py-2 text-sm border-b ${pushMessage.type === "success"
                    ? "bg-green-500/10 border-green-500/20 text-green-500"
                    : "bg-red-500/10 border-red-500/20 text-red-500"
                    }`}>
                    {pushMessage.text}
                    <button
                        onClick={() => setPushMessage(null)}
                        className="ml-2 text-xs underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Generate comments.json Dialog */}
            <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate Comments Artifact</DialogTitle>
                        <DialogDescription>
                            This writes the latest DB comments to `.comments/comments.json`. Push to remote is handled by your Git workflow.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPushDialog(false)} disabled={isPushingComments}>
                            Cancel
                        </Button>
                        <Button onClick={handlePushComments} disabled={isPushingComments}>
                            {isPushingComments ? "Generating..." : "Generate"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden">
                {/* Schematic View - always mounted but conditionally visible */}
                <div className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "sch" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                    {schematicContentLoaded ? (
                        schematicSources.length > 0 ? (
                            <EcadViewerHost
                                viewerKey={schematicViewerKey}
                                sources={schematicSources}
                                setViewerRef={setSchematicViewerRef}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>No schematic files found.</p>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p>Loading schematic...</p>
                        </div>
                    )}
                </div>

                {/* PCB View - always mounted but conditionally visible */}
                <div className={`absolute inset-0 z-10 transition-opacity duration-200 ${activeTab === "pcb" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
                    {pcbContentLoaded ? (
                        pcbSources.length > 0 ? (
                            <EcadViewerHost
                                viewerKey={pcbViewerKey}
                                sources={pcbSources}
                                setViewerRef={setPcbViewerRef}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>No PCB files found.</p>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p>Loading PCB...</p>
                        </div>
                    )}
                </div>

                {/* Comment Overlay - only visible on sch/pcb tabs */}
                {shouldShowOverlay ? (
                    <CommentOverlay
                        comments={overlayComments}
                        viewerRef={activeTab === "sch" ? schematicViewerRef : pcbViewerRef}
                        onPinClick={() => {
                            setShowCommentPanel(true);
                        }}
                    />
                ) : null}

                {/* 3D View */}
                {activeTab === "3d" && (
                    <div className="absolute inset-0 z-20 bg-background">
                        {modelUrl ? (
                            <Suspense fallback={<div className="p-10">Loading 3D Viewer...</div>}>
                                <Model3DViewer modelUrl={modelUrl} sceneKey={`project:${projectId}:tab:3d`} />
                            </Suspense>
                        ) : (
                            <div className="p-10">No 3D Model</div>
                        )}
                    </div>
                )}

                {/* iBoM View */}
                {activeTab === "ibom" && (
                    <div className="absolute inset-0 z-20 bg-white">
                        {ibomUrl ? <iframe src={ibomUrl} className="w-full h-full border-0" /> : <div className="p-10">No iBoM Found</div>}
                    </div>
                )}

                {/* Sidebar Overlay */}
                {showCommentPanel && (
                    <div className="absolute top-0 right-0 bottom-0 z-50 animate-in slide-in-from-right">
                        <CommentPanel
                            comments={comments}
                            onClose={() => setShowCommentPanel(false)}
                            onResolve={handleResolveComment}
                            onReply={handleReplyComment}
                            onDelete={handleDeleteComment}
                            onCommentClick={handleCommentNavigate}
                            canModify={canModifyComments}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
            <CommentForm
                isOpen={showCommentForm}
                onClose={() => setShowCommentForm(false)}
                onSubmit={handleSubmitComment}
                location={pendingLocation}
                context={pendingContext}
                isSubmitting={isSubmittingComment}
            />
        </div>
    );
}
