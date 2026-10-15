import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2, Play, Plus, ShieldAlert, Sparkles, SquareDashed, TriangleAlert, XCircle, Zap,
} from "lucide-react";
import { toast } from "sonner";

import { DesignSearchField } from "@/components/design-search-field";
import { ApiHttpError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { Tabs } from "@/components/ui/tabs";
import type { DesignSearchHit } from "@/lib/design-search";
import { cn } from "@/lib/utils";
import type { PrismSemanticIndex } from "@/types/prism-selection";
import type { PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import * as api from "../api";
import type { SetupIssue, SetupRecordSummary, SetupReport, SimRun, SimSetup } from "../types";

import { BoardIndex } from "./board-index";
import { PowerTreeCanvas, type TreeEdit } from "./PowerTreeCanvas";
import { autoArrange, mergeInferred, nodeId, treeOf, type TreeState } from "./power-tree-model";
import { NO_CANDIDATES, type Candidates } from "./candidates";
import { boardIndex, candidatesFor, semanticIndexFor, createSetup, loadTree, saveTree, type StudioTab, type TreeRecord } from "./power-tree-session";
import { ResultsView } from "./results/ResultsView";
import { SetupSettingsPane } from "./SetupSettingsPane";
import { StudioTabsList, StudioTabsTrigger } from "../studio-tabs";

export type { StudioTab } from "./power-tree-session";

export interface StudioControls {
    setupId: string | null;
    open: (setupId: string) => void;
    reload: () => void;
    select: (node: string | null) => void;
    setTab: (tab: StudioTab) => void;
    view: (runId: string) => void;
}

type Props = {
    projectId: string;
    canMutate: boolean;
    active: boolean;
    setupId: string | null;
    tab: StudioTab;
    onSetupChange: (setupId: string | null) => void;
    onTabChange: (tab: StudioTab) => void;
    onBack: () => void;
    /** Lets the page's script API drive this view. */
    controls?: (controls: StudioControls | null) => void;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const EMPTY_BOARD = new BoardIndex(null);

type Checked = { report: SetupReport; revision: number };

/**
 * The DC IR drop simulation: one setup at a time, with its power tree on the
 * left, the mesher and solver settings on the right (Setup), and its runs
 * (Results). Validate, Pre-flight and Run unlock in that order for the
 * setup's current revision.
 */
export function DcDropStudio({ projectId, canMutate, active, setupId, tab, onSetupChange, onTabChange, onBack, controls }: Props) {
    // Tagged with the project it was listed for, so a list from the project the
    // reviewer just left is never shown or auto-opened here.
    const [listing, setListing] = useState<{ projectId: string; items: SetupRecordSummary[] } | null>(null);
    const setups = listing?.projectId === projectId ? listing.items : null;
    const [tree, setTree] = useState<TreeRecord | null>(null);
    const treeRef = useRef<TreeRecord | null>(null);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const [board, setBoard] = useState<BoardIndex | null>(null);
    const [candidates, setCandidates] = useState<Candidates>(NO_CANDIDATES);
    const [semanticIndex, setSemanticIndex] = useState<PrismSemanticIndex | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [focus, setFocus] = useState<{ nodes: string[]; seq: number } | null>(null);
    const [checks, setChecks] = useState<{ validate?: Checked; preflight?: Checked }>({});
    const [checking, setChecking] = useState<"validate" | "preflight" | "run" | null>(null);
    const [inferring, setInferring] = useState(false);
    const [creating, setCreating] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [runs, setRuns] = useState<SimRun[]>([]);
    const [viewedRun, setViewedRun] = useState<string | null>(null);
    const [resultsViewer, setResultsViewer] = useState<PrismSemanticViewerElement | null>(null);

    const commit = tree?.record.source.commit;
    const setTreeState = (value: TreeRecord | null) => {
        treeRef.current = value;
        setTree(value);
    };

    useEffect(() => {
        let cancelled = false;
        api.listSetups(projectId)
            .then((list) => {
                if (!cancelled) setListing({ projectId, items: list.filter((item) => item.kind === "dc-drop") });
            })
            .catch((error) => toast.error(message(error)));
        return () => { cancelled = true; };
    }, [projectId, reloadKey]);

    // Open the most recent setup when none is chosen.
    useEffect(() => {
        if (!setupId && setups?.length) onSetupChange(setups[0].setup_id);
    }, [setupId, setups, onSetupChange]);

    // Checks are kept per revision, so a reload of the same setup keeps them.
    useEffect(() => {
        setChecks({});
        setSelected(null);
    }, [setupId]);

    // Whether Results has been opened for this setup; once it has, it stays mounted.
    const [resultsSeen, setResultsSeen] = useState(tab === "results");
    useEffect(() => { if (tab === "results") setResultsSeen(true); }, [tab]);
    const seenFor = useRef(setupId);
    useEffect(() => {
        if (seenFor.current === setupId) return;
        seenFor.current = setupId;
        setResultsSeen(tab === "results");
    }, [setupId, tab]);

    useEffect(() => {
        if (!setupId) {
            setTreeState(null);
            return;
        }
        let cancelled = false;
        loadTree(projectId, setupId)
            .then((value) => { if (!cancelled) setTreeState(value); })
            .catch((error) => {
                if (cancelled) return;
                // A link to a setup of another project (or a deleted one): open this project's own instead.
                if (error instanceof ApiHttpError && error.isNotFound) onSetupChange(null);
                else toast.error(message(error));
            });
        return () => { cancelled = true; };
    }, [projectId, setupId, reloadKey, onSetupChange]);

    useEffect(() => {
        if (!tree) return;
        let cancelled = false;
        boardIndex(projectId, commit)
            .then((value) => { if (!cancelled) setBoard(value); })
            .catch((error) => toast.error(message(error)));
        // Suggestions only: the canvas works without them.
        candidatesFor(projectId, commit)
            .then((value) => { if (!cancelled) setCandidates(value); })
            .catch(() => undefined);
        semanticIndexFor(projectId, commit)
            .then((value) => { if (!cancelled) setSemanticIndex(value); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [projectId, commit, tree === null]); // eslint-disable-line react-hooks/exhaustive-deps

    const running = runs.some((run) => run.status === "queued" || run.status === "running");
    useEffect(() => {
        let cancelled = false;
        const load = () => api.listRuns(projectId)
            .then((value) => { if (!cancelled) setRuns(value); })
            .catch(() => undefined);
        void load();
        const timer = running ? window.setInterval(load, 2500) : undefined;
        return () => { cancelled = true; if (timer) window.clearInterval(timer); };
    }, [projectId, reloadKey, running]);

    const setupRuns = useMemo(() => runs.filter((run) => run.setup_id === setupId), [runs, setupId]);
    useEffect(() => {
        if (viewedRun && setupRuns.some((run) => run.run_id === viewedRun)) return;
        setViewedRun(setupRuns.find((run) => run.status === "succeeded" || run.status === "failed")?.run_id ?? null);
    }, [setupRuns, viewedRun]);

    /** Apply an edit to the latest tree and save it; edits run one at a time. */
    const edit = useCallback((change: TreeEdit): Promise<void> => {
        const run = async () => {
            const current = treeRef.current;
            if (!current) throw new Error("No setup is open.");
            let result: ReturnType<TreeEdit>;
            try {
                result = change({ setup: current.record.setup, layout: current.layout }, board ?? EMPTY_BOARD);
            } catch (error) {
                toast.error(message(error));
                throw error;
            }
            const next = "state" in result ? result.state : result;
            setTreeState({ record: { ...current.record, setup: next.setup }, layout: next.layout });
            if ("node" in result) setSelected(result.node);
            try {
                setTreeState(await saveTree(projectId, current, next));
            } catch (error) {
                toast.error(message(error));
                setReloadKey((key) => key + 1);
                throw error;
            }
        };
        const task = queue.current.then(run, run);
        queue.current = task.catch(() => undefined);
        return task;
    }, [board, projectId]);

    const infer = useCallback(async (mode: "replace" | "add") => {
        setInferring(true);
        try {
            const inferred = await api.readPowerTree(projectId, commit);
            await edit((state) => {
                const merged = mergeInferred(state, inferred, mode);
                return mode === "replace" ? autoArrange(merged) : merged;
            });
            toast.success(mode === "replace" ? "Power tree inferred from the netlist." : "Added what the netlist adds.");
        } catch (error) {
            toast.error(message(error));
        } finally {
            setInferring(false);
        }
    }, [commit, edit, projectId]);

    const record = tree?.record;
    const fresh = (checked?: Checked) => (checked && record && checked.revision === record.revision ? checked.report : null);
    const validated = fresh(checks.validate);
    const preflighted = fresh(checks.preflight);
    const latestReport = preflighted ?? validated;

    /** Run one check on the saved revision; `quiet` skips the toasts (the automatic checks). Returns its report. */
    const check = async (stage: "validate" | "preflight", quiet = false): Promise<SetupReport | null> => {
        if (!record) return null;
        setChecking(stage);
        try {
            await queue.current;
            const current = treeRef.current!.record;
            const report = await api.checkSetup(projectId, current.setup_id, stage);
            setChecks((value) => ({ ...value, [stage]: { report, revision: current.revision } }));
            if (!report.ok && !quiet) toast.error(`${stage === "validate" ? "Validation" : "Pre-flight"} found ${report.issues.filter((i) => i.severity === "error").length} problem(s).`);
            return report;
        } catch (error) {
            if (!quiet) toast.error(message(error));
            return null;
        } finally {
            setChecking(null);
        }
    };

    // Checks run by themselves on each saved revision, so the stages always say
    // where the setup stands; the buttons re-run them on demand.
    const checkRef = useRef(check);
    checkRef.current = check;
    const revisionKey = record ? `${record.setup_id}@${record.revision}` : null;
    useEffect(() => {
        if (!revisionKey) return;
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            const validated = await checkRef.current("validate", true);
            if (!cancelled && validated?.ok) await checkRef.current("preflight", true);
        }, 600);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [revisionKey]);

    const submit = async () => {
        if (!record) return;
        setChecking("run");
        try {
            await queue.current;
            const current = treeRef.current!.record;
            const run = await api.submitSetup(projectId, current.setup_id, current.etag, current.setup.analyses[0]?.id ?? "dc");
            setViewedRun(run.run_id);
            setReloadKey((key) => key + 1);
            onTabChange("results");
        } catch (error) {
            toast.error(message(error));
        } finally {
            setChecking(null);
        }
    };

    const selectNodes = useCallback((nodes: string[]) => {
        if (!nodes.length) return;
        setSelected(nodes[0]);
        setFocus((current) => ({ nodes, seq: (current?.seq ?? 0) + 1 }));
    }, []);

    const pickSearch = (hit: DesignSearchHit) => {
        if (tab === "results" && resultsViewer) {
            resultsViewer.setSelection?.(hit.kind === "component"
                ? { reference: hit.component?.reference }
                : { netName: hit.net?.name });
            return;
        }
        if (!tree) return;
        const { elements } = treeOf({ setup: tree.record.setup, layout: tree.layout });
        const matches = hit.kind === "component"
            ? elements.filter((element) => element.component === hit.component?.reference)
            : elements.filter((element) => element.kind === "rail" && element.net === hit.net?.name);
        if (matches.length) {
            onTabChange("setup");
            selectNodes(matches.map((element) => element.node));
        } else {
            toast.info(`${hit.title} is not in the power tree. Add it from the canvas toolbar.`);
        }
    };

    const selectIssue = (issue: SetupIssue) => {
        if (!tree) return;
        const [, collection, index] = issue.path.split("/");
        const setup = tree.record.setup;
        const at = Number(index);
        let node: string | null = null;
        if (collection === "rails" && setup.rails[at]) node = nodeId("rail", setup.rails[at].id);
        if (collection === "loads" && setup.loads[at]) node = nodeId("load", setup.loads[at].id);
        if (collection === "converters" && setup.converters[at]) node = nodeId("converter", setup.converters[at].id);
        if (collection === "sources" && setup.sources[at]) {
            const source = setup.sources[at];
            const converter = setup.converters.find((item) => item.output_source === source.id);
            node = converter ? nodeId("converter", converter.id) : nodeId("source", source.id);
        }
        if (node) {
            onTabChange("setup");
            selectNodes([node]);
        }
    };

    const reload = useCallback(() => setReloadKey((key) => key + 1), []);
    useEffect(() => {
        controls?.({
            setupId,
            open: onSetupChange,
            reload,
            select: (node) => (node ? selectNodes([node]) : setSelected(null)),
            setTab: onTabChange,
            view: (runId) => { setViewedRun(runId); onTabChange("results"); },
        });
    }, [controls, setupId, onSetupChange, reload, selectNodes, onTabChange]);
    useEffect(() => () => controls?.(null), [controls]);

    const state: TreeState | null = tree ? { setup: tree.record.setup, layout: tree.layout } : null;
    const shownRun = setupRuns.find((run) => run.run_id === viewedRun) ?? null;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-11 shrink-0 items-center gap-1.5 overflow-hidden border-b px-2">
                <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onBack} title="All simulations" aria-label="All simulations">
                    <ArrowLeft className="size-4" aria-hidden />
                </Button>
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold"><Zap className="size-4 text-primary" aria-hidden /> DC IR Drop</span>
                <span className="text-muted-foreground">/</span>
                <SetupSwitcher setups={setups} current={record ?? null} canMutate={canMutate}
                    onPick={onSetupChange} onNew={() => setCreating(true)} />
                <Tabs value={tab} onValueChange={(value) => onTabChange(value as StudioTab)} className="shrink-0">
                    <StudioTabsList>
                        <StudioTabsTrigger value="setup">Setup</StudioTabsTrigger>
                        <StudioTabsTrigger value="results">
                            Results
                            {setupRuns.some((run) => run.status === "queued" || run.status === "running") && <Loader2 className="size-3 animate-spin" aria-hidden />}
                        </StudioTabsTrigger>
                    </StudioTabsList>
                </Tabs>
                {tab === "results" && <RunSwitcher runs={setupRuns} current={shownRun} onPick={setViewedRun} />}
                <span className="min-w-0 flex-1" />
                <div className="hidden w-64 min-w-[10rem] shrink xl:block">
                    <DesignSearchField inline semanticIndex={semanticIndex} active={active} onPick={pickSearch} loading={!semanticIndex && !!tree} />
                </div>
                {latestReport && <IssuesButton report={latestReport} onSelect={selectIssue} />}
                <div className="flex shrink-0 items-center" role="group" aria-label="Checks and run">
                    <StageButton label="Validate" report={validated} busy={checking === "validate"} disabled={!record || checking !== null}
                        title="Check the setup against the contract and the board" onClick={() => void check("validate")} />
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <StageButton label="Pre-flight" report={preflighted} busy={checking === "preflight"} disabled={!validated?.ok || checking !== null}
                        title={validated?.ok ? "Check that the engine can run it" : "Validate first"} onClick={() => void check("preflight")} />
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <Button size="sm" className="h-8 shrink-0" disabled={!canMutate || !preflighted?.ok || checking !== null} onClick={() => void submit()}
                        title={preflighted?.ok ? "Freeze this revision and queue the run" : "Pre-flight first"}>
                        {checking === "run" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" aria-hidden />}
                        Run
                    </Button>
                </div>
            </header>

            {setups !== null && setups.length === 0 && !setupId ? (
                <NoSetups canMutate={canMutate} onNew={() => setCreating(true)} />
            ) : !state ? (
                <div className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : (
                <>
                {tab === "setup" && (
                <div className="flex min-h-0 flex-1">
                    <div className="min-w-0 flex-1">
                        <PowerTreeCanvas
                            state={state}
                            board={board}
                            candidates={candidates}
                            canEdit={canMutate}
                            active={active && tab === "setup" && !creating}
                            selected={selected}
                            onSelect={setSelected}
                            onEdit={edit}
                            onInfer={(mode) => void infer(mode)}
                            inferring={inferring}
                            focus={focus}
                        />
                    </div>
                    <ResizablePanel side="right" storageKey="prism.sim.dc.settings-width" defaultWidth={380} minWidth={300} maxWidth={720}
                        aria-label="Simulation settings">
                        <SetupSettingsPane setup={state.setup} canEdit={canMutate}
                            onChange={(setup) => void edit((current) => ({ ...current, setup })).catch(() => undefined)} />
                    </ResizablePanel>
                </div>
                )}
                {/* Results stay mounted once opened (hidden on Setup), so switching tabs keeps the
                    board, the net and field being viewed and the camera instead of reloading them. */}
                {(tab === "results" || resultsSeen) && (
                    <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "results" && "hidden")}>
                        {shownRun?.status === "succeeded"
                            ? <ResultsView key={shownRun.run_id} projectId={projectId} run={shownRun} canMutate={canMutate} onViewer={setResultsViewer}
                                visible={tab === "results"} />
                            : shownRun?.status === "failed" || shownRun?.status === "cancelled"
                                ? <FailedRun run={shownRun} onSetup={() => onTabChange("setup")} />
                                : <NoResult runs={setupRuns} />}
                    </div>
                )}
                </>
            )}

            <NewSetupDialog
                open={creating}
                onOpenChange={setCreating}
                onCreate={async (name, seed) => {
                    const created = await createSetup(projectId, name, seed, commit ?? undefined);
                    setReloadKey((key) => key + 1);
                    onSetupChange(created.record.setup_id);
                    onTabChange("setup");
                }}
            />
        </div>
    );
}

/** A check stage: its name, and whether it has not run, is running, passed (with warnings) or failed. */
function StageButton({ label, report, busy, disabled, title, onClick }: {
    label: string;
    report: SetupReport | null;
    busy: boolean;
    disabled: boolean;
    title: string;
    onClick: () => void;
}) {
    const errors = report?.issues.filter((issue) => issue.severity === "error").length ?? 0;
    const warnings = (report?.issues.length ?? 0) - errors;
    const state = busy ? "busy" : !report ? "idle" : !report.ok ? "failed" : warnings ? "warned" : "passed";
    const look = {
        idle: { icon: <Circle className="size-3.5 text-muted-foreground" aria-hidden />, tone: "", note: null },
        busy: { icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />, tone: "", note: null },
        passed: { icon: <CheckCircle2 className="size-3.5 text-success" aria-hidden />, tone: "border-success/50", note: null },
        warned: { icon: <CheckCircle2 className="size-3.5 text-warning" aria-hidden />, tone: "border-warning/50",
            note: <span className="tabular-nums text-warning">{warnings}</span> },
        failed: { icon: <XCircle className="size-3.5 text-destructive" aria-hidden />, tone: "border-destructive/60",
            note: <span className="tabular-nums text-destructive">{errors}</span> },
    }[state];
    const status = { idle: "not run", busy: "running", passed: "passed", warned: `passed with ${warnings} warning(s)`, failed: `${errors} error(s)` }[state];
    return (
        <Button variant="outline" size="sm" className={cn("h-8 shrink-0", look.tone)} disabled={disabled} onClick={onClick}
            title={`${title} (${status})`} aria-label={`${label}: ${status}`}>
            {look.icon}
            {label}
            {look.note}
        </Button>
    );
}

function IssuesButton({ report, onSelect }: { report: SetupReport; onSelect: (issue: SetupIssue) => void }) {
    const errors = report.issues.filter((issue) => issue.severity === "error").length;
    const warnings = report.issues.length - errors;
    if (!report.issues.length) return null;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2" title="Issues from the last check"
                    aria-label={`Issues: ${errors} error(s), ${warnings} warning(s)`}>
                    {errors > 0
                        ? <ShieldAlert className="size-3.5 text-destructive" aria-hidden />
                        : <TriangleAlert className="size-3.5 text-warning" aria-hidden />}
                    <span className={cn("tabular-nums", errors > 0 ? "text-destructive" : "text-warning")}>{errors || warnings}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-96 w-[28rem] overflow-auto p-2">
                <ul className="space-y-1 text-xs">
                    {report.issues.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                            <button type="button" onClick={() => onSelect(issue)} className="flex w-full gap-2 rounded px-2 py-1.5 text-left hover:bg-muted">
                                {issue.severity === "error"
                                    ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                                    : <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />}
                                <span>{issue.message} <span className="font-mono text-muted-foreground">{issue.path}</span></span>
                            </button>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function SetupSwitcher({ setups, current, canMutate, onPick, onNew }: {
    setups: SetupRecordSummary[] | null;
    current: { setup_id: string; setup: SimSetup; revision: number } | null;
    canMutate: boolean;
    onPick: (setupId: string) => void;
    onNew: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 min-w-0 max-w-[11rem] gap-1 text-xs">
                    <span className="truncate">{current?.setup.name ?? "No setup"}</span>
                    {current && <span className="text-[11px] tabular-nums text-muted-foreground">rev {current.revision}</span>}
                    <ChevronDown className="size-3.5" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="themed-scrollbar max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto">
                {canMutate && (
                    <>
                        <DropdownMenuItem onSelect={onNew} className="gap-2 text-xs font-medium text-primary focus:text-primary">
                            <Plus className="size-3.5" aria-hidden /> New setup
                        </DropdownMenuItem>
                        {(setups ?? []).length > 0 && <DropdownMenuSeparator />}
                    </>
                )}
                {(setups ?? []).map((item) => {
                    const currentItem = item.setup_id === current?.setup_id;
                    return (
                        <DropdownMenuItem key={item.setup_id} onSelect={() => onPick(item.setup_id)} className="gap-2 py-1.5">
                            <Check className={cn("size-3.5 shrink-0 text-primary", !currentItem && "invisible")} aria-hidden />
                            <div className="min-w-0 flex-1">
                                <p className={cn("truncate text-xs", currentItem && "font-medium")}>{item.name}</p>
                                <p className="text-[11px] tabular-nums text-muted-foreground">rev {item.revision} · {shortDate(item.updated_at)}</p>
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function NoSetups({ canMutate, onNew }: { canMutate: boolean; onNew: () => void }) {
    return (
        <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-sm text-center">
                <p className="font-semibold">No DC IR drop setups yet</p>
                {canMutate && <Button className="mt-4" onClick={onNew}><Plus className="mr-1.5 size-4" aria-hidden /> New setup</Button>}
            </div>
        </div>
    );
}

function NewSetupDialog({ open, onOpenChange, onCreate }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (name: string, seed: "inferred" | "blank") => Promise<void>;
}) {
    const [name, setName] = useState("");
    const [seed, setSeed] = useState<"inferred" | "blank">("inferred");
    const [busy, setBusy] = useState(false);
    const options = [
        { value: "inferred" as const, icon: Sparkles, title: "Inferred power tree" },
        { value: "blank" as const, icon: SquareDashed, title: "Blank canvas" },
    ];
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>New DC IR drop setup</DialogTitle>
                    <DialogDescription className="sr-only">Each setup keeps its own power tree, loads and solver settings.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={(event) => {
                    event.preventDefault();
                    if (!name.trim()) return;
                    setBusy(true);
                    onCreate(name.trim(), seed)
                        .then(() => { setName(""); onOpenChange(false); })
                        .catch((error) => toast.error(message(error)))
                        .finally(() => setBusy(false));
                }}>
                    <Input autoFocus aria-label="Setup name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
                    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Start from">
                        {options.map((option) => (
                            <button key={option.value} type="button" role="radio" aria-checked={seed === option.value} onClick={() => setSeed(option.value)}
                                className={cn("flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                                    seed === option.value ? "border-primary bg-primary/5" : "hover:border-primary/50")}>
                                <option.icon className="mb-2 size-5 text-primary" aria-hidden />
                                <span className="text-sm font-medium">{option.title}</span>
                            </button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={!name.trim() || busy}>
                            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />} Create
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RunSwitcher({ runs, current, onPick }: { runs: SimRun[]; current: SimRun | null; onPick: (runId: string) => void }) {
    const when = (run: SimRun) => new Date(run.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    if (!runs.length) return null;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2">
                    {current ? <RunStatus run={current} /> : null}
                    <span className="text-xs">{current ? <>rev {current.setup_revision}<span className="hidden xl:inline"> · {when(current)}</span></> : "Pick a run"}</span>
                    <ChevronDown className="size-3.5" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
                {runs.map((run) => (
                    <DropdownMenuItem key={run.run_id} disabled={run.status === "queued" || run.status === "running"} onSelect={() => onPick(run.run_id)}
                        className={cn("gap-2", run.run_id === current?.run_id && "bg-accent")}>
                        <RunStatus run={run} />
                        <span className="text-xs">rev {run.setup_revision} · {when(run)}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">{run.status}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function RunStatus({ run }: { run: SimRun }) {
    if (run.status === "queued" || run.status === "running") return <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label={run.status} />;
    if (run.status === "succeeded") return <CheckCircle2 className="size-3.5 text-success" aria-label="succeeded" />;
    return <ShieldAlert className="size-3.5 text-destructive" aria-label={run.status} />;
}

function FailedRun({ run, onSetup }: { run: SimRun; onSetup: () => void }) {
    return (
        <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-xl rounded-lg border border-destructive/30 bg-destructive/5 p-5">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-destructive" aria-hidden />
                    <p className="font-semibold">Run {run.status} (rev {run.setup_revision})</p>
                </div>
                <pre className="themed-scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-3 font-mono text-xs text-muted-foreground">
                    {run.message ?? "No reason recorded"}
                </pre>
                <Button variant="outline" size="sm" className="mt-4" onClick={onSetup}>Back to setup</Button>
            </div>
        </div>
    );
}

function NoResult({ runs }: { runs: SimRun[] }) {
    const active = runs.find((run) => run.status === "queued" || run.status === "running");
    return (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
            {active ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                    <span className="capitalize">{active.status}</span>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">No results yet</p>
            )}
        </div>
    );
}
