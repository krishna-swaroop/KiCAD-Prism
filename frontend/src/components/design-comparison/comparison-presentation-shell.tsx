import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    AlertCircle,
    ChevronDown,
    FileText,
    Layers3,
    Loader2,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { SchematicPageTree } from "@/components/ecad-viewer-controls";
import { ViewerOverlayRail } from "@/components/viewer-overlay-rail";
import { cn } from "@/lib/utils";
import type {
    ECadViewerElement,
    EcadComparisonSession,
    EcadDocumentComparisonPreparation,
    EcadPcbLayerState,
    EcadTransitionTraceDetail,
} from "@/types/ecad-viewer";
import {
    ComparisonPcbLayersPanel,
    ComparisonPcbLayersToggle,
} from "./comparison-pcb-layers-panel";
import {
    resolveNativeSelection,
    type ComparisonSelection,
} from "./comparison-selection-bridge";
import { ComparisonViewerHost } from "./comparison-viewer-host";
import {
    focusVisibleLayers,
    routeFocusForChanges,
    type RouteFocusSide,
} from "./comparison-route-focus";
import {
    resolveSelectedDocument,
    revisionSourceKey,
    selectedChanges,
    useRevisionSources,
    type ComparisonDomain,
} from "./revision-sources";
import type {
    ChangeItem,
    DesignCompareResult,
    KiCadProjectDiffBundle,
} from "./types";
import type { ComparisonPresentationMode } from "./comparison-url";
import { useComparisonCameraSync } from "./use-comparison-camera-sync";
import {
    logComparisonDebug,
    logComparisonDebugError,
} from "./comparison-debug-log";
import { buildDiffResolutionReport } from "./diff-resolution-report";

type ComparisonPresentationShellProps = {
    projectId: string;
    domain: ComparisonDomain;
    base: string;
    compare: string;
    presentationMode: ComparisonPresentationMode;
    documentDiff: KiCadProjectDiffBundle;
    files: DesignCompareResult["files"];
    selection: ComparisonSelection;
    previewSelection?: ComparisonSelection;
    reviewGroups: Array<{ id: string; changes: ChangeItem[] }>;
    initialVisibleLayers: string[];
    onVisibleLayersChange: (layers: string[]) => void;
    /**
     * Raised with the board's full layer state so the host can colour a
     * selected net's "layers used" list with the same swatches the layer
     * panel uses. Without it the panel can only name layers, not show them.
     */
    onPcbLayersChange?: (layers: EcadPcbLayerState[]) => void;
    rightRailTab?: "layers" | null;
    onRightRailTabChange?: (tab: "layers" | null) => void;
    /**
     * Rendered at the head of the panel's own top bar. The presentation
     * switcher belongs visually to the panel it controls, but both domain
     * shells stay mounted at once, so it cannot be rendered *by* the shell —
     * two of them would sit in the DOM sharing one accessible name, one of
     * them inside `hidden`. The workspace owns the single instance and hands
     * it to whichever shell is on screen.
     */
    toolbarContent?: ReactNode;
};

type SessionPhase = "waiting-layout" | "loading" | "ready" | "error";
type OldNewSide = "base" | "compare";
const ignoreRightRailChange = () => undefined;
/**
 * Ceiling on one prepareComparison call. Generous on purpose: a cold parse of
 * two revisions of a large board is legitimately slow, and this exists to turn
 * a hang into an error, not to police performance.
 */
const PREPARE_COMPARISON_TIMEOUT_MS = 45_000;

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

function normalizedPath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function sameDocument(left?: string | null, right?: string | null): boolean {
    if (!left || !right) return true;
    const a = normalizedPath(left);
    const b = normalizedPath(right);
    return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function revisionHasDocument(
    sources: DesignCompareResult["files"]["base"],
    documentPath: string | null,
): boolean {
    return Boolean(
        documentPath
        && sources.some((source) => sameDocument(source.path, documentPath)),
    );
}

function viewerState(viewer: ECadViewerElement | null) {
    return {
        connected: viewer?.isConnected ?? false,
        isReady: viewer?.isReady ?? false,
        activePage: viewer?.getActiveSchematicPage?.() ?? null,
        camera: viewer?.camera ?? null,
    };
}

function diffForDocument(
    documentDiff: KiCadProjectDiffBundle,
    documentPath: string | null,
    domain: ComparisonDomain,
): KiCadProjectDiffBundle["project"] {
    if (!documentPath) return documentDiff.project;
    if (
        documentDiff.project.documents.some((document) =>
            sameDocument(document.path, documentPath),
        )
    ) {
        return documentDiff.project;
    }
    return {
        documents: [{
            path: documentPath,
            docType: domain === "pcb" ? "kicad_pcb" : "kicad_sch",
            changes: [],
        }],
    };
}

function MissingRevisionPane({
    side,
    documentPath,
}: {
    side: "base" | "compare";
    documentPath: string;
}) {
    const opposite = side === "base" ? "compare" : "base";
    return (
        <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-background p-8 text-center"
            role="status"
        >
            <div className="max-w-sm">
                <AlertCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" />
                <h3 className="text-sm font-medium">
                    Not present in the {side} revision
                </h3>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                    {documentPath} exists only in the {opposite} revision.
                </p>
            </div>
        </div>
    );
}

export function ComparisonPresentationShell({
    projectId,
    domain,
    base,
    compare,
    presentationMode,
    documentDiff,
    files,
    selection,
    previewSelection = null,
    reviewGroups,
    initialVisibleLayers,
    onVisibleLayersChange,
    onPcbLayersChange,
    rightRailTab = null,
    onRightRailTabChange = ignoreRightRailChange,
    toolbarContent = null,
}: ComparisonPresentationShellProps) {
    const [primaryViewer, setPrimaryViewer] =
        useState<ECadViewerElement | null>(null);
    const [secondaryViewer, setSecondaryViewer] =
        useState<ECadViewerElement | null>(null);
    const [primaryLayoutReady, setPrimaryLayoutReady] = useState(false);
    const [secondaryLayoutReady, setSecondaryLayoutReady] = useState(false);
    const [session, setSession] = useState<EcadComparisonSession | null>(null);
    const [sessionPhase, setSessionPhase] =
        useState<SessionPhase>("waiting-layout");
    const [presentationSwitching, setPresentationSwitching] = useState(false);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [preparation, setPreparation] =
        useState<EcadDocumentComparisonPreparation | null>(null);
    const [oldNewSide, setOldNewSide] = useState<OldNewSide>("compare");
    const [selectionPending, setSelectionPending] = useState(false);
    const [selectionDiagnostic, setSelectionDiagnostic] =
        useState<string | null>(null);
    const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
    const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);
    const [rightRailInset, setRightRailInset] = useState(0);
    const [pcbLayers, setPcbLayers] = useState<EcadPcbLayerState[]>([]);
    useEffect(() => {
        onPcbLayersChange?.(pcbLayers);
    }, [onPcbLayersChange, pcbLayers]);
    const [layerFocusOverridden, setLayerFocusOverridden] = useState(false);

    const sessionGenerationRef = useRef(0);
    const presentationGenerationRef = useRef(0);
    const presentationReadyKeyRef = useRef<string | null>(null);
    const selectionGenerationRef = useRef(0);
    const lastSelectionKeyRef = useRef<string | null>(null);
    /** Selection that produced no native target, so its notice fires once. */
    const unresolvedSelectionKeyRef = useRef<string | null>(null);
    const cameraSyncSuppressedRef = useRef(false);
    /** Layer visibility owned by the reviewer, captured when a focus takes over. */
    const preFocusLayersRef = useRef<string[] | null>(null);
    const mountedSecondaryRef = useRef(false);
    const sessionRef = useRef<EcadComparisonSession | null>(null);
    if (presentationMode === "side-by-side") {
        mountedSecondaryRef.current = true;
    }

    const allChanges = useMemo(
        () => selectedChanges(selection, reviewGroups),
        [reviewGroups, selection],
    );
    const previewChanges = useMemo(
        () => selectedChanges(previewSelection, reviewGroups),
        [previewSelection, reviewGroups],
    );
    const activeDocument = useMemo(
        () => resolveSelectedDocument(
            domain,
            documentDiff,
            allChanges,
            selection?.documentPath,
        ),
        [allChanges, documentDiff, domain, selection?.documentPath],
    );
    const baseSources = useRevisionSources(
        projectId,
        domain,
        base,
        files.base,
    );
    const compareSources = useRevisionSources(
        projectId,
        domain,
        compare,
        files.head,
    );
    const documentPath =
        activeDocument?.path
        ?? baseSources.rootName
        ?? compareSources.rootName
        ?? null;
    const comparisonDiff = useMemo(
        () => diffForDocument(documentDiff, documentPath, domain),
        [documentDiff, documentPath, domain],
    );
    const baseMissingRoot = useMemo(
        () =>
            !baseSources.loading
            && !baseSources.sources.some(
                (source) => source.filename === baseSources.rootName,
            ),
        [baseSources.loading, baseSources.rootName, baseSources.sources],
    );
    const compareMissingRoot = useMemo(
        () =>
            !compareSources.loading
            && !compareSources.sources.some(
                (source) => source.filename === compareSources.rootName,
            ),
        [compareSources.loading, compareSources.rootName, compareSources.sources],
    );
    const sourcesReady =
        !baseSources.loading
        && !compareSources.loading
        && (!baseMissingRoot || !compareMissingRoot);
    const baseRevisionKey = revisionSourceKey(projectId, base, domain);
    const compareRevisionKey = revisionSourceKey(projectId, compare, domain);
    const comparisonKey = `${projectId}:${base}:${compare}:${domain}`;
    const primaryHostKey = `${comparisonKey}:primary`;
    const secondaryHostKey = `${comparisonKey}:secondary`;
    /**
     * What "the scene is ready" means right now.
     *
     * Scoped by document as well as by presentation: a page transition
     * re-prepares the session, and a ready key left over from the previous page
     * must never satisfy the selection guard for the new one.
     */
    const presentationKey =
        `${comparisonKey}:${documentPath}:${presentationMode}:${oldNewSide}`;
    const baseHasDocument = preparation
        ? !preparation.missingReference
        : revisionHasDocument(files.base, documentPath);
    const compareHasDocument = preparation
        ? !preparation.missingComparison
        : revisionHasDocument(files.head, documentPath);
    /**
     * The panes on screen: each attached viewer, the revision it shows, and
     * whether that revision actually contains the current document.
     *
     * One derivation for all three consumers. The side travels with the viewer
     * rather than with its position in the array — deriving it from the index
     * meant that whenever one pane had not attached yet, the survivor took
     * index 0 and was handed the *base* revision's layer set, so a removed
     * route lit up the compare pane, which cannot contain it. Keeping three
     * copies of this reasoning is what let that happen in the first place.
     *
     * `hasDocument` is the axis the consumers genuinely differ on: painting a
     * selection skips a pane whose revision lacks the document, while layer
     * visibility still applies to it.
     */
    const panes = useMemo((): Array<{
        viewer: ECadViewerElement;
        side: RouteFocusSide;
        hasDocument: boolean;
    }> => {
        if (presentationMode === "side-by-side") {
            const slots: Array<[ECadViewerElement | null, RouteFocusSide, boolean]> = [
                [primaryViewer, "reference", baseHasDocument],
                [secondaryViewer, "comparison", compareHasDocument],
            ];
            return slots.flatMap(([viewer, side, hasDocument]) =>
                viewer ? [{ viewer, side, hasDocument }] : [],
            );
        }
        if (!primaryViewer) return [];
        if (presentationMode === "old-new") {
            const base = oldNewSide === "base";
            return [{
                viewer: primaryViewer,
                side: base ? "reference" : "comparison",
                hasDocument: base ? baseHasDocument : compareHasDocument,
            }];
        }
        // Composite carries both revisions in one pane, so it shows the union
        // and always has something to paint.
        return [{ viewer: primaryViewer, side: "both", hasDocument: true }];
    }, [
        baseHasDocument,
        compareHasDocument,
        oldNewSide,
        presentationMode,
        primaryViewer,
        secondaryViewer,
    ]);

    const activeLayerViewers = useMemo(
        () => panes.map((pane) => pane.viewer),
        [panes],
    );

    const selectionKey = useMemo(
        () =>
            selection
                ? `${selection.kind}:${selection.id}:${selection.documentPath ?? "default"}:${allChanges
                    .map((change) => change.id)
                    .join(",")}`
                : "none",
        [allChanges, selection],
    );

    const showLayers = rightRailTab === "layers";
    const changedDocuments = useMemo(
        () => new Set(
            documentDiff.project.documents
                .filter((document) => document.changes.length > 0)
                .map((document) => document.path.split("/").at(-1) ?? document.path),
        ),
        [documentDiff],
    );
    const oneSidedSheetNotice = documentPath && baseHasDocument !== compareHasDocument
        ? `${documentPath} exists only in the ${
            baseHasDocument ? "base" : "compare"
        } revision.`
        : null;

    const attachPrimary = useCallback((viewer: ECadViewerElement | null) => {
        setPrimaryViewer(viewer);
        setPrimaryLayoutReady(false);
    }, []);
    const attachSecondary = useCallback((viewer: ECadViewerElement | null) => {
        setSecondaryViewer(viewer);
        setSecondaryLayoutReady(false);
    }, []);

    useEffect(() => {
        setDismissedBanner(null);
    }, [comparisonKey, documentPath]);

    useEffect(() => {
        const cleanups: Array<() => void> = [];
        for (const [slot, viewer] of [
            ["primary", primaryViewer],
            ["secondary", secondaryViewer],
        ] as const) {
            if (!viewer) continue;
            const listener = ((event: CustomEvent<EcadTransitionTraceDetail>) => {
                logComparisonDebug("viewer.transition", {
                    slot,
                    presentationMode,
                    oldNewSide,
                    viewer: event.detail,
                });
            }) as EventListener;
            viewer.addEventListener("ecad-viewer:transition-trace", listener);
            cleanups.push(() =>
                viewer.removeEventListener(
                    "ecad-viewer:transition-trace",
                    listener,
                ),
            );
        }
        return () => cleanups.forEach((cleanup) => cleanup());
    }, [oldNewSide, presentationMode, primaryViewer, secondaryViewer]);

    useEffect(() => {
        if (
            !primaryViewer
            || !primaryLayoutReady
            || !sourcesReady
            || !documentPath
        ) {
            setSessionPhase("waiting-layout");
            return;
        }
        if (typeof primaryViewer.prepareComparison !== "function") {
            setSessionPhase("error");
            setSessionError(
                "This ecad-viewer build does not expose prepareComparison. Rebuild and sync the viewer bundle.",
            );
            return;
        }
        const generation = ++sessionGenerationRef.current;
        let cancelled = false;
        let created: EcadComparisonSession | null = null;
        sessionRef.current?.dispose();
        sessionRef.current = null;
        setSession(null);
        setPreparation(null);
        setSessionError(null);
        setSessionPhase("loading");
        presentationReadyKeyRef.current = null;
        lastSelectionKeyRef.current = null;
        unresolvedSelectionKeyRef.current = null;
        logComparisonDebug("session.prepare.start", {
            generation,
            comparisonKey,
            documentPath,
            baseRevisionKey,
            compareRevisionKey,
        });
        // Guard against the viewer promise never settling. prepareComparison
        // lives in the vendored ecad-viewer bundle; if it hangs on input it
        // cannot render it neither resolves nor rejects, and the panel spins on
        // "Preparing native comparison…" forever with nothing to catch. Race it
        // against a timeout so a hang becomes a surfaced, logged error through
        // the existing .catch instead of an unbounded spinner. The inputs are
        // logged so the stuck payload can be inspected afterwards.
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const prepareTimeout = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                logComparisonDebug("session.prepare.timeout", {
                    generation,
                    documentPath,
                    domain,
                    timeoutMs: PREPARE_COMPARISON_TIMEOUT_MS,
                    baseSourceCount: baseSources.sources.length,
                    compareSourceCount: compareSources.sources.length,
                    hasDiff: Boolean(comparisonDiff),
                    viewerState: viewerState(primaryViewer),
                });
                reject(
                    new Error(
                        `The viewer did not finish preparing this comparison within ${
                            PREPARE_COMPARISON_TIMEOUT_MS / 1000
                        }s. This usually means the ${domain} document diff hit a case the viewer cannot render.`,
                    ),
                );
            }, PREPARE_COMPARISON_TIMEOUT_MS);
        });
        void Promise.race([
            primaryViewer.prepareComparison({
                comparisonKey,
                reference: {
                    revisionKey: baseRevisionKey,
                    sources: baseSources.sources,
                },
                comparison: {
                    revisionKey: compareRevisionKey,
                    sources: compareSources.sources,
                },
                diff: comparisonDiff,
                diffFormat: "prism",
                documentPath,
                activeSheetPath: documentPath,
            }),
            prepareTimeout,
        ]).finally(() => {
            if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        }).then((next) => {
            created = next;
            if (cancelled || generation !== sessionGenerationRef.current) {
                next.dispose();
                return;
            }
            sessionRef.current = next;
            setSession(next);
            setPreparation(next.preparation);
            setSessionPhase("ready");
            logComparisonDebug("session.prepare.ready", {
                generation,
                documentPath,
                metrics: next.getMetrics(),
                viewerState: viewerState(primaryViewer),
            });
            logComparisonDebug(
                "session.prepare.resolution",
                buildDiffResolutionReport(next.preparation),
            );
        }).catch((caught) => {
            if (
                cancelled
                || generation !== sessionGenerationRef.current
                || isAbortError(caught)
            ) {
                return;
            }
            setSessionPhase("error");
            setSessionError(
                caught instanceof Error
                    ? caught.message
                    : "Failed to prepare comparison session",
            );
            logComparisonDebugError("session.prepare.failed", caught, {
                generation,
                documentPath,
                viewerState: viewerState(primaryViewer),
            });
        });
        return () => {
            cancelled = true;
            created?.dispose();
            primaryViewer.abortDocumentComparisonLoad?.();
        };
    }, [
        baseRevisionKey,
        baseSources.sources,
        compareRevisionKey,
        compareSources.sources,
        comparisonDiff,
        comparisonKey,
        documentPath,
        domain,
        primaryLayoutReady,
        primaryViewer,
        sourcesReady,
    ]);

    useEffect(() => {
        if (
            !session
            || sessionPhase !== "ready"
            || !primaryViewer
            || !primaryLayoutReady
            || (
                presentationMode === "side-by-side"
                && (!secondaryViewer || !secondaryLayoutReady)
            )
        ) {
            return;
        }
        const generation = ++presentationGenerationRef.current;
        let cancelled = false;
        const retainedOldNewCamera =
            presentationMode === "old-new"
                ? primaryViewer.camera
                : null;
        // This ref closes the same-commit gap before the state update below is
        // visible to the selection effect. Without it, Auto can change the
        // presentation and the selected diff is painted onto the outgoing
        // scene, then considered consumed before the new panes are ready.
        presentationReadyKeyRef.current = null;
        lastSelectionKeyRef.current = null;
        unresolvedSelectionKeyRef.current = null;
        setPresentationSwitching(true);
        setSessionError(null);
        const operation =
            presentationMode === "composite"
                ? session.setPresentation("composite", primaryViewer)
                    .then((primary) => ({ primary, secondary: null }))
                : presentationMode === "old-new"
                    ? session.setPresentation(
                        oldNewSide === "base" ? "reference" : "comparison",
                        primaryViewer,
                    ).then((primary) => ({ primary, secondary: null }))
                    : Promise.all([
                        session.setPresentation("reference", primaryViewer),
                        session.setPresentation("comparison", secondaryViewer!),
                    ]).then(([primary, secondary]) => ({ primary, secondary }));
        void operation.then((result) => {
            if (cancelled || generation !== presentationGenerationRef.current) {
                return;
            }
            if (retainedOldNewCamera) {
                // Old/New reuses one retained viewport and swaps its prepared
                // revision scene. Reapply the camera captured before the swap
                // so switching revisions never performs an implicit zoom-fit.
                primaryViewer.camera = retainedOldNewCamera;
            }
            setPreparation(session.preparation);
            presentationReadyKeyRef.current = presentationKey;
            setPresentationSwitching(false);
            logComparisonDebug("session.presentation.ready", {
                generation,
                presentationMode,
                oldNewSide,
                primary: {
                    switchMs: result.primary.switchMs,
                    parserCount: result.primary.parserCount,
                    paintCount: result.primary.paintCount,
                },
                secondary: result.secondary
                    ? {
                          switchMs: result.secondary.switchMs,
                          parserCount: result.secondary.parserCount,
                          paintCount: result.secondary.paintCount,
                      }
                    : null,
                metrics: session.getMetrics(),
            });
        }).catch((caught) => {
            if (
                cancelled
                || generation !== presentationGenerationRef.current
                || isAbortError(caught)
            ) {
                return;
            }
            setPresentationSwitching(false);
            setSessionError(
                caught instanceof Error
                    ? caught.message
                    : "Failed to switch comparison presentation",
            );
            logComparisonDebugError("session.presentation.failed", caught, {
                generation,
                presentationMode,
                oldNewSide,
            });
        });
        return () => {
            cancelled = true;
        };
    }, [
        oldNewSide,
        comparisonKey,
        documentPath,
        presentationKey,
        presentationMode,
        primaryLayoutReady,
        primaryViewer,
        secondaryLayoutReady,
        secondaryViewer,
        session,
        sessionPhase,
    ]);

    useEffect(() => {
        if (
            !session
            || sessionPhase !== "ready"
            || presentationSwitching
            || !primaryViewer
            || presentationReadyKeyRef.current !== presentationKey
        ) {
            return;
        }
        // A pane whose revision does not carry this document has nothing to
        // paint the selection onto.
        const viewers = panes
            .filter((pane) => pane.hasDocument)
            .map((pane) => pane.viewer);
        // The panes are part of the key, not just the selection.
        //
        // In side-by-side the two viewers do not attach on the same frame. Keyed
        // on the selection alone, a pass that ran while only the base pane
        // existed painted it, marked the selection consumed, and the compare
        // pane — attaching a moment later — never received it. Whether that
        // happened came down to how fast the machine was.
        const applicationKey = [
            presentationMode,
            oldNewSide,
            documentPath,
            selectionKey,
            panes.map((pane) => pane.side).join("+"),
        ].join(":");
        if (lastSelectionKeyRef.current === applicationKey) return;
        const nativeSelection = resolveNativeSelection(
            session.preparation,
            documentDiff,
            selection,
            allChanges,
        );
        if (!nativeSelection) {
            // Deliberately not marked as applied. When a selection sends the
            // reviewer to another page, this runs once against the outgoing
            // session, whose preparation still names the old document, and
            // nothing resolves. Consuming the key here left the selection
            // permanently unapplied until the reviewer picked something else
            // and came back; instead it retries once the new page is prepared.
            if (unresolvedSelectionKeyRef.current !== applicationKey) {
                unresolvedSelectionKeyRef.current = applicationKey;
                setSelectionDiagnostic(null);
                const hasVisualTarget = allChanges.some(
                    (change) => (change.details?.visualTargets?.length ?? 0) > 0,
                );
                setSelectionNotice(selection && hasVisualTarget
                    ? "The selected KiCad object could not be resolved on the canvas; use the structured old/new evidence for review."
                    : null);
                if (!selection) {
                    primaryViewer.clearDocumentDiffSelection?.();
                    secondaryViewer?.clearDocumentDiffSelection?.();
                }
            }
            return;
        }
        lastSelectionKeyRef.current = applicationKey;
        unresolvedSelectionKeyRef.current = null;
        const generation = ++selectionGenerationRef.current;
        cameraSyncSuppressedRef.current =
            presentationMode === "side-by-side";
        setSelectionPending(true);
        setSelectionDiagnostic(null);
        setSelectionNotice(null);
        void Promise.all(
            viewers.map((viewer) => viewer.selectDocumentDiff(nativeSelection)),
        ).then((frames) => {
            if (generation !== selectionGenerationRef.current) return;
            if (selection && frames.every((frame) => frame.status === "missing")) {
                setSelectionNotice(
                    "The selected KiCad object could not be resolved on the canvas; use the structured old/new evidence for review.",
                );
            }
            // An added route resolves only on the compare pane, a removed one
            // only on the base pane, and the pane that cannot resolve it never
            // moves its camera. Left alone the two panes look at different
            // parts of the board, which is the one thing side-by-side exists to
            // prevent: proving an absence means seeing the place it is absent
            // from. Camera sync is suppressed for the duration of a selection,
            // so the framing is carried across explicitly here.
            if (presentationMode === "side-by-side" && viewers.length === 2) {
                const resolved = frames.findIndex(
                    (frame) => frame.status === "applied",
                );
                const unresolved = frames.findIndex(
                    (frame) => frame.status === "missing",
                );
                const camera = resolved >= 0 ? viewers[resolved]?.camera : null;
                if (camera && unresolved >= 0 && viewers[unresolved]) {
                    viewers[unresolved]!.camera = camera;
                    logComparisonDebug("session.selection.frame.mirrored", {
                        generation,
                        from: resolved,
                        to: unresolved,
                    });
                }
            }
            logComparisonDebug("session.selection.complete", {
                generation,
                presentationMode,
                oldNewSide,
                nativeSelection,
                frames: frames.map((frame) => ({
                    status: frame.status,
                    clickToFrameMs: frame.clickToFrameMs,
                    paintCount: frame.paintCount,
                    parserCount: frame.parserCount,
                    bounds: frame.target?.bounds,
                })),
            });
        }).catch((caught) => {
            if (generation !== selectionGenerationRef.current) return;
            setSelectionDiagnostic(
                caught instanceof Error ? caught.message : "Selection failed",
            );
            logComparisonDebugError("session.selection.failed", caught, {
                generation,
                presentationMode,
                nativeSelection,
            });
        }).finally(() => {
            if (generation !== selectionGenerationRef.current) return;
            cameraSyncSuppressedRef.current = false;
            setSelectionPending(false);
        });
    }, [
        allChanges,
        panes,
        presentationKey,
        baseHasDocument,
        compareHasDocument,
        comparisonKey,
        documentDiff,
        documentPath,
        oldNewSide,
        presentationMode,
        presentationSwitching,
        primaryViewer,
        secondaryViewer,
        selection,
        selectionKey,
        session,
        sessionPhase,
    ]);

    useEffect(() => {
        if (
            !session
            || sessionPhase !== "ready"
            || presentationSwitching
            || !primaryViewer
        ) {
            return;
        }
        const nativePreview = previewSelection
            ? resolveNativeSelection(
                session.preparation,
                documentDiff,
                previewSelection,
                previewChanges,
            )
            : null;
        const viewers = activeLayerViewers;
        for (const viewer of viewers) {
            viewer.previewDocumentDiff?.(nativePreview);
        }
        return () => {
            for (const viewer of viewers) {
                viewer.previewDocumentDiff?.(null);
            }
        };
    }, [
        activeLayerViewers,
        documentDiff,
        presentationMode,
        presentationSwitching,
        previewChanges,
        previewSelection,
        primaryViewer,
        secondaryViewer,
        session,
        sessionPhase,
    ]);

    useComparisonCameraSync(
        primaryViewer,
        secondaryViewer,
        presentationMode === "side-by-side"
            && sessionPhase === "ready"
            && !presentationSwitching,
        cameraSyncSuppressedRef,
    );

    const routeFocus = useMemo(
        () => (domain === "pcb" ? routeFocusForChanges(allChanges) : null),
        [allChanges, domain],
    );
    const routeFocusKey = routeFocus
        ? [
            routeFocus.net ?? "",
            routeFocus.reference.join(","),
            routeFocus.comparison.join(","),
        ].join("|")
        : null;
    const layerFocusActive = Boolean(routeFocus) && !layerFocusOverridden;

    // A new route is a new focus: the reviewer's earlier manual override does
    // not carry across to a different net's evidence.
    useEffect(() => {
        setLayerFocusOverridden(false);
    }, [routeFocusKey]);

    useEffect(() => {
        if (domain !== "pcb" || sessionPhase !== "ready" || presentationSwitching) {
            return;
        }
        const viewers = activeLayerViewers;
        if (!viewers.length) return;
        const applyVisibility = (
            viewer: ECadViewerElement,
            visible: Set<string>,
        ) => {
            for (const layer of viewer.getPcbViewState?.()?.layers ?? []) {
                viewer.setPcbLayerVisibility?.(
                    layer.name,
                    visible.has(layer.name),
                );
            }
        };

        if (routeFocus && layerFocusActive) {
            // Capture once. Re-capturing on a presentation switch or a second
            // route would save the focused state as if the reviewer chose it.
            if (!preFocusLayersRef.current) {
                preFocusLayersRef.current =
                    (viewers[0]?.getPcbViewState?.()?.layers ?? [])
                        .filter((layer) => layer.visible)
                        .map((layer) => layer.name);
            }
            for (const pane of panes) {
                applyVisibility(
                    pane.viewer,
                    new Set(focusVisibleLayers(routeFocus, pane.side)),
                );
            }
            setPcbLayers(viewers[0]?.getPcbViewState?.()?.layers ?? []);
            logComparisonDebug("session.layers.focus", {
                net: routeFocus.net,
                viaOnly: routeFocus.viaOnly,
                presentationMode,
                reference: routeFocus.reference,
                comparison: routeFocus.comparison,
            });
            return;
        }

        const restore = preFocusLayersRef.current;
        if (!restore) return;
        preFocusLayersRef.current = null;
        const visible = new Set(restore);
        for (const viewer of viewers) applyVisibility(viewer, visible);
        setPcbLayers(viewers[0]?.getPcbViewState?.()?.layers ?? []);
        logComparisonDebug("session.layers.focus.restore", {
            presentationMode,
            layers: restore,
        });
    }, [
        activeLayerViewers,
        panes,
        domain,
        layerFocusActive,
        presentationMode,
        presentationSwitching,
        routeFocus,
        sessionPhase,
    ]);

    useEffect(() => {
        if (domain !== "pcb") {
            setPcbLayers([]);
            return;
        }
        const viewers = activeLayerViewers;
        if (
            sessionPhase !== "ready"
            || presentationSwitching
            || !viewers.length
        ) {
            return;
        }
        // A routing focus temporarily owns layer visibility. Re-applying the
        // reviewer's saved layers here would fight it on every URL update.
        if (initialVisibleLayers.length && !layerFocusActive) {
            const visible = new Set(initialVisibleLayers);
            for (const viewer of viewers) {
                for (const layer of viewer.getPcbViewState?.()?.layers ?? []) {
                    viewer.setPcbLayerVisibility?.(
                        layer.name,
                        visible.has(layer.name),
                    );
                }
            }
        }
        const refresh = () =>
            setPcbLayers(viewers[0]?.getPcbViewState?.()?.layers ?? []);
        refresh();
        for (const viewer of viewers) {
            viewer.addEventListener("ecad-viewer:view-state-change", refresh);
        }
        return () => {
            for (const viewer of viewers) {
                viewer.removeEventListener(
                    "ecad-viewer:view-state-change",
                    refresh,
                );
            }
        };
    }, [
        activeLayerViewers,
        domain,
        initialVisibleLayers,
        layerFocusActive,
        presentationSwitching,
        sessionPhase,
    ]);

    /**
     * Any hand-driven layer change hands visibility back to the reviewer for
     * as long as this route stays selected, and there is nothing left to
     * restore afterwards — the state they just built *is* their state.
     */
    const releaseLayerFocus = () => {
        preFocusLayersRef.current = null;
        setLayerFocusOverridden(true);
    };

    const toggleLayer = (name: string, visible: boolean) => {
        releaseLayerFocus();
        for (const viewer of activeLayerViewers) {
            viewer.setPcbLayerVisibility?.(name, visible);
        }
        const next = pcbLayers.map((layer) =>
            layer.name === name ? { ...layer, visible } : layer,
        );
        setPcbLayers(next);
        onVisibleLayersChange(
            next.filter((layer) => layer.visible).map((layer) => layer.name),
        );
    };
    const applyPreset = (
        preset: Parameters<
            NonNullable<ECadViewerElement["applyPcbLayerPreset"]>
        >[0],
    ) => {
        releaseLayerFocus();
        const viewers = activeLayerViewers;
        for (const viewer of viewers) {
            viewer.applyPcbLayerPreset?.(preset);
        }
        const next = viewers[0]?.getPcbViewState?.()?.layers ?? [];
        setPcbLayers(next);
        onVisibleLayersChange(
            next.filter((layer) => layer.visible).map((layer) => layer.name),
        );
    };
    const highlightLayer = (name: string | null) => {
        for (const viewer of activeLayerViewers) {
            viewer.setPcbLayerHighlight?.(name);
        }
    };

    const sourceError = baseSources.error ?? compareSources.error;
    const activeError = sourceError ?? sessionError ?? selectionDiagnostic;
    const bannerMessage = activeError ?? selectionNotice ?? oneSidedSheetNotice;
    const showBanner =
        Boolean(bannerMessage) && bannerMessage !== dismissedBanner;
    const loading =
        baseSources.loading
        || compareSources.loading
        || sessionPhase === "waiting-layout"
        || sessionPhase === "loading"
        || presentationSwitching;

    if (baseMissingRoot && compareMissingRoot) {
        return (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center">
                <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground/60" />
                <h3 className="text-sm font-medium">
                    Document missing in both revisions
                </h3>
                <p className="mt-2 max-w-md text-xs text-muted-foreground">
                    {baseSources.rootName} is not present in base or compare.
                    Pick another revision pair or switch tabs.
                </p>
            </section>
        );
    }

    const primaryActive =
        presentationMode !== "side-by-side"
        || baseHasDocument;
    const secondaryActive =
        presentationMode === "side-by-side"
        && compareHasDocument;
    const primaryPane = panes[0] ?? null;
    const primaryInset =
        presentationMode === "side-by-side" ? 0 : rightRailInset;

    return (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs">
                {toolbarContent}
                {presentationMode === "old-new" && (
                    // Sits beside the mode switcher rather than replacing it.
                    // Both carry explicit aria-labels: this group's "Old" and
                    // the switcher's "Old / New" otherwise collide on a bare
                    // /Old/ accessible-name query.
                    <div
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-background p-0.5"
                        role="group"
                        aria-label="Revision side"
                    >
                        <Button
                            variant={oldNewSide === "base" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setOldNewSide("base")}
                            aria-label="Old revision"
                            aria-pressed={oldNewSide === "base"}
                        >
                            Old
                        </Button>
                        <Button
                            variant={oldNewSide === "compare" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setOldNewSide("compare")}
                            aria-label="New revision"
                            aria-pressed={oldNewSide === "compare"}
                        >
                            New
                        </Button>
                    </div>
                )}
                {domain === "schematic" && primaryViewer && (
                    // The comparison had no way to browse sheets: the document
                    // was only ever a side effect of the selected change. This
                    // is the Visualizer's own page tree, in a popover.
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 max-w-56 shrink-0"
                            >
                                <FileText className="mr-2 h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                    {documentPath
                                        ? documentPath.split("/").at(-1)
                                        : "Sheet"}
                                </span>
                                <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="start"
                            className="flex max-h-96 w-72 flex-col p-0"
                        >
                            <SchematicPageTree
                                viewer={primaryViewer}
                                hasChanges={(page) => changedDocuments.has(
                                    page.filename,
                                )}
                            />
                        </PopoverContent>
                    </Popover>
                )}
                <span className="mr-auto" />
                {domain === "pcb" && (
                    <ComparisonPcbLayersToggle
                        open={showLayers}
                        onClick={() => onRightRailTabChange(
                            showLayers ? null : "layers",
                        )}
                        visibleCount={pcbLayers.filter((layer) => layer.visible).length}
                        totalCount={pcbLayers.length}
                    />
                )}
            </div>

            <div className="relative min-h-0 min-w-0 flex-1">
                <div
                    className={cn(
                        "absolute inset-0 grid min-h-0",
                        presentationMode === "side-by-side"
                            ? "grid-cols-2 divide-x"
                            : "grid-cols-1",
                    )}
                >
                    <div className="relative flex min-h-0 min-w-0 flex-col">
                        {presentationMode === "side-by-side" && (
                            <div className="shrink-0 border-b bg-muted/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Base
                            </div>
                        )}
                        <div className="relative min-h-0 flex-1">
                            <ComparisonViewerHost
                                key={primaryHostKey}
                                viewerKey={primaryHostKey}
                                active={primaryActive}
                                onViewer={attachPrimary}
                                onLayoutReady={() => setPrimaryLayoutReady(true)}
                                viewportInsets={{ right: primaryInset }}
                            />
                            {/* Three conditions collapsed into the one thing
                                they all asked: does the revision this pane is
                                showing carry the document? Composite always
                                does, because it holds both. */}
                            {primaryPane
                                && !primaryPane.hasDocument
                                && documentPath && (
                                <MissingRevisionPane
                                    side={primaryPane.side === "reference"
                                        ? "base"
                                        : "compare"}
                                    documentPath={documentPath}
                                />
                            )}
                        </div>
                    </div>

                    {mountedSecondaryRef.current && (
                        <div
                            className={cn(
                                "relative min-h-0 min-w-0 flex-col",
                                presentationMode === "side-by-side"
                                    ? "flex"
                                    : "hidden",
                            )}
                        >
                            <div className="shrink-0 border-b bg-muted/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Compare
                            </div>
                            <div className="relative min-h-0 flex-1">
                                <ComparisonViewerHost
                                    key={secondaryHostKey}
                                    viewerKey={secondaryHostKey}
                                    active={secondaryActive}
                                    onViewer={attachSecondary}
                                    onLayoutReady={() =>
                                        setSecondaryLayoutReady(true)}
                                    viewportInsets={{ right: rightRailInset }}
                                />
                                {!compareHasDocument && documentPath && (
                                    <MissingRevisionPane
                                        side="compare"
                                        documentPath={documentPath}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {(loading || selectionPending) && (
                    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                        <div className="inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {loading
                                ? sessionPhase === "loading"
                                    ? "Preparing comparison session…"
                                    : "Switching comparison view…"
                                : "Focusing change…"}
                        </div>
                    </div>
                )}

                {showBanner && bannerMessage && (
                    <div
                        className={cn(
                            "absolute inset-x-3 bottom-3 flex items-start gap-2 rounded border bg-background/95 p-3 text-xs shadow-sm",
                            activeError
                                ? "border-destructive/30 text-destructive"
                                : "border-warning/30 text-warning",
                        )}
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 break-words">
                            {bannerMessage}
                        </span>
                        <button
                            type="button"
                            className="shrink-0 rounded p-0.5 transition-colors hover:bg-muted"
                            aria-label="Dismiss warning"
                            onClick={() => setDismissedBanner(bannerMessage)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}


                <ViewerOverlayRail
                    activeTab={rightRailTab}
                    tabs={domain === "pcb"
                        ? [{
                            id: "layers" as const,
                            label: "Layers",
                            icon: <Layers3 className="mr-1.5 size-3.5" />,
                        }]
                        : []}
                    onTabChange={onRightRailTabChange}
                    onClose={() => onRightRailTabChange(null)}
                    onVisibleWidthChange={setRightRailInset}
                    ariaLabel="Comparison tools"
                    className="w-80"
                >
                    {rightRailTab === "layers" && domain === "pcb" ? (
                        <ComparisonPcbLayersPanel
                            layers={pcbLayers}
                            onToggleVisibility={toggleLayer}
                            onApplyPreset={applyPreset}
                            onHighlight={highlightLayer}
                        />
                    ) : null}
                </ViewerOverlayRail>
            </div>
        </section>
    );
}
