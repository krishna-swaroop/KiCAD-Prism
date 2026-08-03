import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    AlertCircle,
    Cpu,
    ChevronRight,
    CircuitBoard,
    Columns2,
    FileText,
    Factory,
    Layers3,
    Loader2,
    Square,
    ToggleLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { DifferencesPane } from "./differences-pane";
import { useDesignCompareJob } from "./use-design-compare-job";
import { useComparisonComments } from "./use-comparison-comments";
import { useComparisonUrlState } from "./use-comparison-url-state";
import { ComparisonPresentationShell } from "./comparison-presentation-shell";
import type { ComparisonSelection } from "./comparison-selection-bridge";
import {
    logComparisonDebug,
    startComparisonDebugSession,
} from "./comparison-debug-log";
import {
    readComparisonUrlState,
    type ComparisonPresentationMode,
    type ComparisonUrlTab,
} from "./comparison-url";
import { comparisonDomainStatus } from "./comparison-readiness";
import { BomPanel } from "./bom-panel";
import { StackupPanel } from "./stackup-panel";
import { FabricationPanel } from "./fabrication-panel";
import { ComparisonDiscussionRail } from "./comparison-discussion-rail";
import { ComparisonPropertyPanel } from "./comparison-property-panel";
import { recommendPresentationForTab } from "./comparison-review-policy";
import {
    prepareChangesForReview,
    semanticNetRenames,
} from "./comparison-review-noise";
import {
    createGroupingContext,
    groupChanges,
    type ChangeGroup,
} from "./comparison-review-groups";
import {
    groupMatchesSearch,
    reviewImpactCounts,
    reviewImpactForGroup,
    reviewStatusCounts,
    type ReviewImpact,
} from "./comparison-review-queue";
import {
    reviewReportCsv,
    reviewReportFilename,
} from "./comparison-review-report";
import type { EcadPcbLayerState } from "@/types/ecad-viewer";
import type {
    ChangeItem,
    ChangeKind,
} from "./types";

type WorkspaceTab = ComparisonUrlTab;
export type PresentationMode = ComparisonPresentationMode;

interface DesignComparisonWorkspaceProps {
    projectId: string;
    base: string;
    head: string;
    branchTipSha: string | null;
    canComment: boolean;
    onClose: () => void;
}

interface SemanticFocus {
    semanticId?: string | null;
    reference?: string | null;
    net?: string | null;
}

export function readInitialUrlState(
    search: string | URLSearchParams = window.location.search,
) {
    const state = readComparisonUrlState(search);
    return {
        activeTab: state.diff,
        presentationOverride: state.presentationOverride,
        selectedChangeId: state.item,
        showSecondary: state.showSecondary,
        layers: state.layers,
    };
}


export function DesignComparisonWorkspace({
    projectId,
    base,
    head,
    branchTipSha,
    canComment,
    onClose,
}: DesignComparisonWorkspaceProps) {
    const [searchParams] = useSearchParams();
    const { result, status: jobStatus, error } = useDesignCompareJob(
        projectId,
        base,
        head,
    );
    const [comments, setComments] = useComparisonComments(
        projectId,
        base,
        head,
    );
    const initial = useMemo(
        () => readInitialUrlState(searchParams),
        [searchParams],
    );
    const [activeTab, setActiveTab] = useState<WorkspaceTab>(initial.activeTab);
    /**
     * A reviewer's explicit presentation choice for the change they are looking
     * at right now, or null to follow the policy's recommendation.
     *
     * Auto is not a mode to select, it is what happens when nothing has been
     * selected. An override answers "show me *this* change differently" and is
     * discarded when the reviewer moves to another change, so the workspace
     * never carries a stale choice into evidence it was not made for.
     */
    const [presentationOverride, setPresentationOverride] =
        useState<PresentationMode | null>(initial.presentationOverride);
    const [statuses, setStatuses] = useState<Set<ChangeKind>>(
        () => new Set(["added", "changed", "removed"]),
    );
    // Empty means "no owner filter". Six owners would otherwise need five
    // clicks to isolate one, so these chips narrow rather than exclude.
    const [impacts, setImpacts] = useState<Set<ReviewImpact>>(() => new Set());
    const [search, setSearch] = useState("");
    const [showSecondary, setShowSecondary] = useState(initial.showSecondary);
    const [selectedChangeId, setSelectedChangeId] = useState<string | null>(
        initial.selectedChangeId,
    );
    const [reviewSelection, setReviewSelection] = useState<ComparisonSelection>(
        initial.selectedChangeId
            ? { kind: "item", id: initial.selectedChangeId }
            : null,
    );
    const [visibleLayers, setVisibleLayers] = useState<string[]>(initial.layers);
    // Board layer state, lifted so the property panel can draw a selected net's
    // layers with the same swatches the layer panel uses.
    const [pcbLayers, setPcbLayers] = useState<EcadPcbLayerState[]>([]);
    // Closed by default; the user opens it deliberately from the rail.
    const [comparisonRightRailTab, setComparisonRightRailTab] =
        useState<"layers" | null>(null);
    const [previewSelection, setPreviewSelection] =
        useState<ComparisonSelection>(null);
    const semanticFocusRef = useRef<SemanticFocus | null>(null);

    useEffect(() => {
        if (activeTab !== "pcb" && comparisonRightRailTab === "layers") {
            setComparisonRightRailTab(null);
        }
    }, [activeTab, comparisonRightRailTab]);

    useEffect(() => {
        startComparisonDebugSession({ projectId, base, compare: head });
        logComparisonDebug("workspace.mount", {
            base,
            compare: head,
        });
    }, [projectId, base, head]);

    const handleClose = () => {
        onClose();
    };

    /**
     * Escape clears the current selection rather than closing the comparison.
     *
     * Building a comparison is expensive and Escape is the reflex for
     * "dismiss this panel"; having it tear down the whole workspace made a
     * stray keypress cost a full rebuild. Closing stays on the X and on the
     * overlay. When there is nothing selected Escape does nothing, which is
     * deliberate — it never becomes a close shortcut again by accident.
     */
    const dismissSelection = () => {
        semanticFocusRef.current = null;
        setSelectedChangeId(null);
        setReviewSelection(null);
        setPreviewSelection(null);
        setComparisonRightRailTab(null);
    };

    const domain = activeTab === "pcb" ? "pcb" : "schematic";
    const schematicReview = useMemo(
        () => prepareChangesForReview(result?.schematic.changes ?? []),
        [result?.schematic.changes],
    );
    // Read from the raw schematic changes, not the prepared ones: the board's
    // rewritten net references are derivative even where the schematic pass
    // chose to drop the rename itself as generated noise.
    const netRenames = useMemo(
        () => semanticNetRenames(result?.schematic.changes ?? []),
        [result?.schematic.changes],
    );
    const pcbReview = useMemo(
        () => prepareChangesForReview(result?.pcb.changes ?? [], { netRenames }),
        [netRenames, result?.pcb.changes],
    );
    const domainReview = activeTab === "sch"
        ? schematicReview
        : activeTab === "pcb" ? pcbReview : { changes: [], suppressedCount: 0 };
    const domainChanges = domainReview.changes;
    /**
     * Built once per domain and shared by every grouping below.
     *
     * The queue is regrouped for each combination of filters, and rebuilding the
     * part index and the net aliases each time was both the expensive part and
     * the inconsistent one: aliases are derived from the copper's own old/new
     * net pairs, so deriving them from a filtered subset could hide the rename
     * that ties a conductor together and split one trace back into two rows.
     */
    const schematicGrouping = useMemo(
        () => createGroupingContext(schematicReview.changes, result?.bom),
        [result?.bom, schematicReview.changes],
    );
    const pcbGrouping = useMemo(
        () => createGroupingContext(pcbReview.changes, result?.bom),
        [pcbReview.changes, result?.bom],
    );
    const grouping = activeTab === "pcb" ? pcbGrouping : schematicGrouping;
    const statusFilteredChanges = useMemo(
        () => domainChanges.filter((change) => (
            statuses.has(change.kind)
            && (showSecondary || change.classification !== "secondary")
        )),
        [domainChanges, showSecondary, statuses],
    );
    // Counted before the status, owner, and search filters so a chip always
    // answers "how many review items of this kind exist", not "how many
    // survive the filters I already applied".
    const unfilteredGroups = useMemo(
        () => groupChanges(
            domainChanges.filter((change) => (
                showSecondary || change.classification !== "secondary"
            )),
            comments,
            grouping,
        ),
        [comments, domainChanges, grouping, showSecondary],
    );
    const statusCounts = useMemo(
        () => reviewStatusCounts(unfilteredGroups),
        [unfilteredGroups],
    );
    const impactCounts = useMemo(
        () => reviewImpactCounts(unfilteredGroups),
        [unfilteredGroups],
    );
    const groups = useMemo(
        () => groupChanges(statusFilteredChanges, comments, grouping)
            .filter((group) => groupMatchesSearch(group, search))
            .filter((group) => (
                !impacts.size || impacts.has(reviewImpactForGroup(group))
            )),
        [comments, grouping, impacts, search, statusFilteredChanges],
    );
    const secondaryGroupCount = useMemo(
        () => groupChanges(
            domainChanges.filter((change) => (
                statuses.has(change.kind) && change.classification === "secondary"
            )),
            [],
            grouping,
        ).length,
        [domainChanges, grouping, statuses],
    );
    // Exports the filtered queue, not the whole delta: the reviewer's filters
    // are the review scope, and an export that silently widens it is not the
    // record they just signed off.
    const exportReviewQueue = () => {
        logComparisonDebug("difference.export", {
            activeTab,
            rows: groups.length,
            impacts: [...impacts],
            statuses: [...statuses],
            search: search.trim().length > 0,
            showSecondary,
        });
        downloadCsv(
            reviewReportFilename({ domain, base, compare: head }),
            reviewReportCsv(groups),
        );
    };
    // The unfiltered queue for each domain, which is what selection and the
    // canvas resolve against — a change must stay reachable while a filter is
    // hiding its row.
    const schematicNavigationGroups = useMemo(
        () => groupChanges(schematicReview.changes, comments, schematicGrouping),
        [comments, schematicGrouping, schematicReview.changes],
    );
    const pcbNavigationGroups = useMemo(
        () => groupChanges(pcbReview.changes, comments, pcbGrouping),
        [comments, pcbGrouping, pcbReview.changes],
    );
    const navigationGroups = activeTab === "pcb"
        ? pcbNavigationGroups
        : schematicNavigationGroups;
    const visitedDomainsRef = useRef<Set<"schematic" | "pcb">>(new Set());
    if (activeTab === "sch") visitedDomainsRef.current.add("schematic");
    if (activeTab === "pcb") visitedDomainsRef.current.add("pcb");

    // Owners are domain-specific: "PCB fabrication" has no meaning in the
    // schematic queue, so a filter carried across tabs would silently empty it.
    useEffect(() => {
        setImpacts(new Set());
    }, [activeTab]);

    const selectedChange = useMemo(
        () => domainChanges.find((change) => change.id === selectedChangeId) ?? null,
        [domainChanges, selectedChangeId],
    );
    const selectedReviewGroup = useMemo(
        () => navigationGroups.find((group) =>
            group.id === (reviewSelection?.kind === "group" ? reviewSelection.id : "")
            || group.changes.some((change) => change.id === selectedChangeId),
        ) ?? null,
        [navigationGroups, reviewSelection, selectedChangeId],
    );
    /**
     * The evidence Auto reasons about: one change when the reviewer picked a
     * single instance, the whole group when they picked the row.
     *
     * Picking one designator out of a part row asks about *that* instance, and
     * recommending a view from its twenty-seven siblings would answer a
     * different question.
     */
    const presentationChanges = useMemo(
        () => (
            reviewSelection?.kind === "item" && selectedChange
                ? [selectedChange]
                : selectedReviewGroup?.changes ?? []
        ),
        [reviewSelection?.kind, selectedChange, selectedReviewGroup],
    );
    const presentationRecommendation = useMemo(
        () => recommendPresentationForTab(activeTab, presentationChanges),
        [activeTab, presentationChanges],
    );
    const presentationMode =
        presentationOverride ?? presentationRecommendation.mode;
    const compositeRecommended = presentationRecommendation.mode === "composite";

    useEffect(() => {
        logComparisonDebug("workspace.state", {
            activeTab,
            presentationMode,
            presentationOverride,
            selectedChangeId,
            selectionKind: reviewSelection?.kind ?? null,
            selectionId: reviewSelection?.id ?? null,
        });
    }, [
        activeTab,
        presentationMode,
        presentationOverride,
        reviewSelection,
        selectedChangeId,
    ]);

    useComparisonUrlState(
        {
            base,
            compare: head,
            activeTab,
            presentationOverride,
            selectedChangeId,
            showSecondary,
            visibleLayers,
        },
        {
            setActiveTab,
            setPresentationOverride,
            setSelectedChangeId,
            setShowSecondary,
            setVisibleLayers,
        },
    );

    // An override belongs to one change. Selecting a different one hands the
    // decision back to the policy. The ref makes the first render a no-op so a
    // deep link carrying `presentation` survives arriving at its own item.
    const presentationSelectionKey =
        `${reviewSelection?.kind ?? ""}:${reviewSelection?.id ?? ""}`;
    const lastPresentationSelectionRef = useRef(presentationSelectionKey);
    useEffect(() => {
        if (lastPresentationSelectionRef.current === presentationSelectionKey) {
            return;
        }
        lastPresentationSelectionRef.current = presentationSelectionKey;
        setPresentationOverride(null);
    }, [presentationSelectionKey]);

    const selectChange = (change: ChangeItem, documentPath?: string) => {
        logComparisonDebug("difference.click", {
            target: "item",
            activeTab,
            presentationMode,
            change: {
                id: change.id,
                kind: change.kind,
                category: change.category,
                classification: change.classification,
                label: change.label,
                reference: change.reference,
                net: change.net,
                page: change.page,
                reasons: change.reasons ?? [],
                sourceIdBase: change.source_id_base,
                sourceIdCompare: change.source_id_compare,
                visualTargets: change.details?.visualTargets ?? [],
            },
            navigation: result?.document_diff.navigation[change.id] ?? null,
            requestedDocumentPath: documentPath ?? null,
        });
        semanticFocusRef.current = {
            semanticId: change.semantic_id,
            reference: change.reference,
            net: change.net,
        };
        setSelectedChangeId(change.id);
        setReviewSelection({ kind: "item", id: change.id, documentPath });
    };

    const selectGroup = (group: ChangeGroup) => {
        const change = group.changes[0];
        if (!change) return;
        logComparisonDebug("difference.click", {
            target: "group",
            activeTab,
            presentationMode,
            group: {
                id: group.id,
                category: group.category,
                kind: group.kind,
                classification: group.classification,
                label: group.label,
                memberIds: group.changes.map((member) => member.id),
            },
            primaryChange: {
                id: change.id,
                page: change.page,
                reasons: change.reasons ?? [],
                reference: change.reference,
                net: change.net,
                visualTargets: change.details?.visualTargets ?? [],
            },
            navigation: result?.document_diff.navigation[change.id] ?? null,
        });
        semanticFocusRef.current = {
            semanticId: change.semantic_id,
            reference: change.reference,
            net: change.net,
        };
        setSelectedChangeId(change.id);
        setReviewSelection({ kind: "group", id: group.id });
    };

    useEffect(() => {
        if (!result) return;
        const current = domainChanges.find((change) => change.id === selectedChangeId);
        if (current) {
            semanticFocusRef.current = {
                semanticId: current.semantic_id,
                reference: current.reference,
                net: current.net,
            };
            // Search/status filters only change what is listed. They must not
            // dissolve the selected semantic group or change Auto's review
            // presentation while the reviewer refines the panel.
            const validGroupSelection = reviewSelection?.kind === "group"
                && navigationGroups.some((group) => (
                    group.id === reviewSelection.id
                    && group.changes.some((change) => change.id === current.id)
                ));
            if (
                !validGroupSelection
                && (
                    reviewSelection?.kind !== "item"
                    || reviewSelection.id !== current.id
                )
            ) {
                setReviewSelection({ kind: "item", id: current.id });
            }
            return;
        }
        const focus = semanticFocusRef.current;
        const counterpart = focus
            ? domainChanges.find((change) => (
                (focus.semanticId && change.semantic_id === focus.semanticId)
                || (focus.reference && change.reference === focus.reference)
                || (focus.net && change.net === focus.net)
            ))
            : null;
        if (counterpart) {
            setSelectedChangeId(counterpart.id);
            setReviewSelection({ kind: "item", id: counterpart.id });
        } else {
            setSelectedChangeId(null);
            setReviewSelection(null);
        }
    }, [activeTab, domainChanges, navigationGroups, result, reviewSelection, selectedChangeId]);

    const navigate = (direction: -1 | 1) => {
        if (!groups.length) return;
        const current = groups.findIndex((group) =>
            group.changes.some((change) => change.id === selectedChangeId)
        );
        const next = current < 0
            ? 0
            : (current + direction + groups.length) % groups.length;
        selectGroup(groups[next]!);
    };

    const tabs: Array<{
        id: WorkspaceTab;
        label: string;
        icon: typeof Cpu;
        badge?: number;
        status: "pending" | "building" | "ready" | "failed";
    }> = [
        {
            id: "sch",
            label: "Schematic",
            icon: Cpu,
            status: comparisonDomainStatus(result, "schematic"),
            badge: result
                ? schematicNavigationGroups.filter(
                    (group) => group.classification === "primary",
                ).length
                : undefined,
        },
        {
            id: "pcb",
            label: "PCB",
            icon: CircuitBoard,
            status: comparisonDomainStatus(result, "pcb"),
            badge: result
                ? pcbNavigationGroups.filter(
                    (group) => group.classification === "primary",
                ).length
                : undefined,
        },
        {
            id: "bom",
            label: "BOM",
            icon: FileText,
            status: comparisonDomainStatus(result, "bom"),
            badge: result?.bom
                ? result.bom.summary.added + result.bom.summary.removed + result.bom.summary.changed
                : undefined,
        },
        {
            id: "stackup",
            label: "Stackup",
            icon: Layers3,
            status: comparisonDomainStatus(result, "stackup"),
            badge: result?.stackup.changed ? 1 : undefined,
        },
        {
            id: "fabrication",
            label: "Fabrication",
            icon: Factory,
            status: comparisonDomainStatus(result, "fabrication"),
            badge: result?.fabrication?.summary?.changedLayers || undefined,
        },
    ];
    const activeTabStatus = tabs.find((tab) => tab.id === activeTab)?.status ?? "ready";
    const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "";

    const branchTipLabel = branchTipSha === head
        ? "Compare revision is branch tip"
        : branchTipSha === base
            ? "Base revision is branch tip"
            : null;

    const chooseTab = (next: WorkspaceTab) => {
        logComparisonDebug("control.tab.click", {
            from: activeTab,
            to: next,
            presentationMode,
            selectedChangeId,
        });
        setActiveTab(next);
    };

    const choosePresentationMode = (next: PresentationMode) => {
        logComparisonDebug("control.presentation.click", {
            from: presentationMode,
            to: next,
            activeTab,
            selectedChangeId,
            recommended: presentationRecommendation.mode,
            rule: presentationRecommendation.rule,
        });
        setPresentationOverride(next);
    };

    // The switcher belongs in the bar of the panel it controls, but both domain
    // shells stay mounted, so exactly one instance is built here and handed to
    // whichever shell is on screen. Rendering it inside the shell would put two
    // in the DOM under one accessible name, one of them hidden.
    const presentationSwitcher = (
        <div
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-background p-0.5"
            role="group"
            aria-label="Presentation mode"
        >
            <Button
                variant={presentationMode === "composite" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => choosePresentationMode("composite")}
                aria-pressed={presentationMode === "composite"}
                title={compositeRecommended ? presentationRecommendation.reason : undefined}
            >
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Composite
            </Button>
            <Button
                variant={presentationMode === "side-by-side" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => choosePresentationMode("side-by-side")}
                aria-pressed={presentationMode === "side-by-side"}
            >
                <Columns2 className="mr-1.5 h-3.5 w-3.5" />
                Side by side
            </Button>
            <Button
                variant={presentationMode === "old-new" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => choosePresentationMode("old-new")}
                aria-label="Single revision presentation mode"
                aria-pressed={presentationMode === "old-new"}
            >
                <ToggleLeft className="mr-1.5 h-3.5 w-3.5" />
                Old / New
            </Button>
        </div>
    );

    const renderDomainShell = (
        shellDomain: "schematic" | "pcb",
        shellGroups: ChangeGroup[],
    ) => {
        if (!result?.document_diff) return null;
        const isActive = domain === shellDomain;
        return (
            <div
                key={shellDomain}
                className={cn(
                    "flex min-h-0 min-w-0 flex-1",
                    !isActive && "hidden",
                )}
                aria-hidden={!isActive}
            >
                <ComparisonPresentationShell
                    key={`${shellDomain}:${base}:${head}`}
                    projectId={projectId}
                    domain={shellDomain}
                    base={base}
                    compare={head}
                    presentationMode={presentationMode}
                    documentDiff={result.document_diff}
                    files={result.files}
                    reviewGroups={shellGroups}
                    selection={isActive ? reviewSelection : null}
                    previewSelection={isActive ? previewSelection : null}
                    toolbarContent={isActive ? presentationSwitcher : null}
                    initialVisibleLayers={visibleLayers}
                    onVisibleLayersChange={setVisibleLayers}
                    onPcbLayersChange={isActive ? setPcbLayers : undefined}
                    rightRailTab={comparisonRightRailTab}
                    onRightRailTabChange={setComparisonRightRailTab}
                />
            </div>
        );
    };

    return (
        <Dialog open onOpenChange={(open) => !open && handleClose()}>
            <DialogContent
                className="flex h-[96vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0"
                onEscapeKeyDown={(event) => {
                    event.preventDefault();
                    dismissSelection();
                }}
            >
                <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <DialogTitle>Design comparison</DialogTitle>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {/* Label outside the chip, SHA inside it, so the tag
                                reads as a name pointing at a value rather than
                                one solid block. */}
                            <span className="flex items-center gap-1.5">
                                Base
                                <span className="rounded border bg-muted px-2 py-1 font-mono">
                                    {base.slice(0, 10)}
                                </span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5" />
                            <span className="flex items-center gap-1.5">
                                Compare
                                <span className="rounded border bg-primary/10 px-2 py-1 font-mono text-primary">
                                    {head.slice(0, 10)}
                                </span>
                            </span>
                            {branchTipLabel && (
                                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
                                    {branchTipLabel}
                                </span>
                            )}
                        </div>
                    </div>
                    <DialogDescription className="sr-only">
                        Compare schematic, PCB, BOM, stackup, and fabrication output between two immutable revisions.
                    </DialogDescription>
                </DialogHeader>

                {result ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {/* Every domain is a peer. The band already costs its
                            vertical space for Schematic and PCB, so hiding the
                            three report domains behind a dropdown bought no
                            room and made them harder to reach. */}
                        <nav
                            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-2 py-1"
                            aria-label="Comparison domain"
                        >
                            <div
                                className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5"
                                role="group"
                            >
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    return (
                                        <Button
                                            key={tab.id}
                                            variant={activeTab === tab.id ? "secondary" : "ghost"}
                                            size="sm"
                                            onClick={() => chooseTab(tab.id)}
                                            className="h-7 shrink-0 text-xs"
                                            aria-pressed={activeTab === tab.id}
                                            disabled={tab.status !== "ready"}
                                        >
                                            <Icon className="mr-2 h-3.5 w-3.5" />
                                            {tab.label}
                                            {tab.status === "building" && (
                                                <Loader2 className="ml-2 h-3 w-3 animate-spin" />
                                            )}
                                            {!!tab.badge && (
                                                <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                                                    {tab.badge}
                                                </span>
                                            )}
                                        </Button>
                                    );
                                })}
                            </div>
                        </nav>

                        {error && (
                            <div
                                role="alert"
                                className="flex shrink-0 items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive"
                            >
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>
                                    Schematic and BOM remain available, but the background comparison failed: {error}
                                </span>
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1">
                            {/* Keep the sch/pcb block mounted once visited, hidden
                                when a non-viewer tab (BOM/stackup) is active, so
                                switching away and back does not remount and reparse
                                the viewers. */}
                            {(visitedDomainsRef.current.has("schematic")
                                || visitedDomainsRef.current.has("pcb"))
                                && (activeTab === "sch" || activeTab === "pcb"
                                    ? activeTabStatus === "ready"
                                    : true) && (
                                <div
                                    className={cn(
                                        "flex min-h-0 min-w-0 flex-1",
                                        !(activeTab === "sch" || activeTab === "pcb")
                                            && "hidden",
                                    )}
                                >
                                    <ResizablePanel
                                        side="left"
                                        storageKey="prism.compare.queueWidth"
                                        defaultWidth={360}
                                        minWidth={260}
                                        maxWidth={620}
                                        aria-label="Review queue"
                                    >
                                        <DifferencesPane
                                            title={activeTab === "pcb"
                                                ? "PCB compare"
                                                : "Schematic compare"}
                                            groups={groups}
                                            totalGroups={unfilteredGroups.length}
                                            secondaryGroupCount={secondaryGroupCount}
                                            statusCounts={statusCounts}
                                            impactCounts={impactCounts}
                                            impacts={impacts}
                                            onToggleImpact={(impact) => {
                                                setImpacts((current) => {
                                                    const next = new Set(current);
                                                    if (next.has(impact)) next.delete(impact);
                                                    else next.add(impact);
                                                    return next;
                                                });
                                            }}
                                            onExport={exportReviewQueue}
                                            statuses={statuses}
                                            onToggleStatus={(kind) => {
                                                setStatuses((current) => {
                                                    const next = new Set(current);
                                                    if (next.has(kind)) next.delete(kind);
                                                    else next.add(kind);
                                                    return next;
                                                });
                                            }}
                                            search={search}
                                            onSearchChange={setSearch}
                                            showSecondary={showSecondary}
                                            onShowSecondaryChange={setShowSecondary}
                                            selectedChangeId={selectedChangeId}
                                            selectedGroupId={
                                                reviewSelection?.kind === "group"
                                                    ? reviewSelection.id
                                                    : null
                                            }
                                            selectedDocumentPath={
                                                reviewSelection?.documentPath
                                            }
                                            onSelectChange={selectChange}
                                            onSelectGroup={selectGroup}
                                            onPreviewChange={setPreviewSelection}
                                            onPrevious={() => navigate(-1)}
                                            onNext={() => navigate(1)}
                                        />
                                    </ResizablePanel>
                                    {result.document_diff ? (
                                        <>
                                            {visitedDomainsRef.current.has("schematic")
                                                && renderDomainShell(
                                                    "schematic",
                                                    schematicNavigationGroups,
                                                )}
                                            {visitedDomainsRef.current.has("pcb")
                                                && renderDomainShell(
                                                    "pcb",
                                                    pcbNavigationGroups,
                                                )}
                                        </>
                                    ) : (
                                        <div className="flex min-w-0 flex-1 items-center justify-center p-8 text-center">
                                            <div className="max-w-sm text-sm text-muted-foreground">
                                                <AlertCircle className="mx-auto mb-3 h-8 w-8 text-warning" />
                                                This result predates native document comparison.
                                                Reopen the comparison to rebuild it.
                                            </div>
                                        </div>
                                    )}
                                    {/* The third zone. Permanent rather than a
                                        rail tab: what the selected change did
                                        is the reason the reviewer is here, so
                                        it should never need opening. */}
                                    <ResizablePanel
                                        side="right"
                                        storageKey="prism.compare.propertyWidth"
                                        defaultWidth={400}
                                        minWidth={280}
                                        maxWidth={720}
                                        aria-label="Selected change"
                                    >
                                        <ComparisonPropertyPanel
                                            group={selectedReviewGroup ?? null}
                                            bom={result.bom}
                                            routeMetrics={result.pcb.route_metrics}
                                            pcbLayers={pcbLayers}
                                            diagnosticsCount={
                                                result.document_diff?.diagnostics.length ?? 0
                                            }
                                            discussion={(
                                                <ComparisonDiscussionRail
                                                    projectId={projectId}
                                                    base={base}
                                                    compare={head}
                                                    domain={domain === "pcb" ? "PCB" : "SCH"}
                                                    anchor={selectedReviewGroup
                                                        ? {
                                                            id: selectedReviewGroup.id,
                                                            label: selectedReviewGroup.label,
                                                            page: selectedChange?.page,
                                                        }
                                                        : null}
                                                    comments={comments}
                                                    canComment={canComment}
                                                    onCommentsChange={setComments}
                                                    onClose={() => undefined}
                                                    embedded
                                                />
                                            )}
                                        />
                                    </ResizablePanel>
                                </div>
                            )}
                            {activeTabStatus !== "ready" && (
                                <div className="flex min-w-0 flex-1 items-center justify-center p-8 text-center">
                                    <div className="flex max-w-sm flex-col items-center gap-3">
                                        {activeTabStatus === "failed" ? (
                                            <AlertCircle className="h-8 w-8 text-destructive" />
                                        ) : (
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        )}
                                        <div>
                                            <p className="text-sm font-medium">
                                                {/* Named from the tab itself: a
                                                    nested ternary told reviewers
                                                    on Fabrication that Stackup
                                                    had failed. */}
                                                {activeTabStatus === "failed"
                                                    ? `${activeTabLabel} comparison failed`
                                                    : `Building ${activeTabLabel} comparison`}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {activeTabStatus === "failed"
                                                    ? "Schematic and BOM are still available. Retry the comparison to rebuild this domain."
                                                    : "Schematic and BOM are ready while this domain finishes in the background."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === "bom" && activeTabStatus === "ready" && <BomPanel bom={result.bom} />}
                            {activeTab === "stackup" && activeTabStatus === "ready" && <StackupPanel stackup={result.stackup} />}
                            {activeTab === "fabrication" && activeTabStatus === "ready" && (
                                <FabricationPanel
                                    fabrication={result.fabrication}
                                    sidecarUrls={result.sidecarUrls}
                                    presentationMode={presentationMode}
                                    presentationSwitcher={presentationSwitcher}
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                        {error ? (
                            <div className="max-w-md text-center text-destructive">
                                <AlertCircle className="mx-auto mb-4 h-10 w-10" />
                                <h3 className="text-base font-semibold">Semantic comparison failed</h3>
                                <p className="mt-2 text-sm">{error}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-center">
                                <Loader2 className="h-9 w-9 animate-spin text-primary" />
                                <div>
                                    <h3 className="text-sm font-medium">
                                        {jobStatus?.message || "Starting semantic comparison…"}
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Source files are read from immutable Git objects; the checkout is unchanged.
                                    </p>
                                </div>
                                {jobStatus?.percent != null && (
                                    <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full bg-primary transition-all"
                                            style={{ width: `${jobStatus.percent}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
