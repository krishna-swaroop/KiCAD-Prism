import { fetchJson } from "@/lib/api";

import * as api from "./api";
import {
    addElement, autoArrange, connect, mergeInferred, removeElement, setSolved, treeOf, updateElement,
    type ElementKind, type ElementPatch, type InferredTree, type Point, type TreeEdge, type TreeElement, type TreeState,
} from "./dc-drop/power-tree-model";
import { boardIndex, createSetup, loadTree, saveTree, type StudioTab } from "./dc-drop/power-tree-session";
import { withSetting } from "./dc-drop/settings";
import type { BoardIndex } from "./dc-drop/board-index";
import type {
    Converter,
    JsonPatchOperation,
    Load,
    Probe,
    Rail,
    SetupRecord,
    SetupRecordSummary,
    SetupReport,
    SimCatalog,
    SimRun,
    SimSetup,
    Source,
    Terminal,
} from "./types";

/**
 * `window.prismSimStudio`: the Simulation Studio's script API (sim-adr-0017).
 * It drives the same endpoints and the same power-tree functions as the UI
 * with the signed-in session, so anything a click does a script can do:
 *
 *   const s = await prismSimStudio.newSetup("Max load", { seed: "inferred" });
 *   const { elements } = await prismSimStudio.tree(s.setup_id);
 *   await prismSimStudio.updateElement(s.setup_id, "load:u1-0v9", { values: { current_a: 3 } });
 *   await prismSimStudio.updateElement(s.setup_id, "converter:u3-3v3", { values: { efficiency: 0.9 } });
 *   await prismSimStudio.validate(s.setup_id);
 *   await prismSimStudio.preflight(s.setup_id);
 *   await prismSimStudio.submit(s.setup_id);
 *
 * Elements are named `kind:id` (`rail:3v3`, `converter:u3-3v3`, `load:u1-0v9`,
 * `source:j1-20v0`). Writes read the current ETag first, so each call is
 * still guarded. It is installed while the Simulation Studio tab is mounted.
 */
export interface SimStudioScriptApi {
    readonly version: "a1";
    readonly projectId: string;
    catalog(): Promise<SimCatalog>;
    list(): Promise<SetupRecordSummary[]>;
    draft(name: string, options?: { kind?: string; commit?: string }): Promise<SetupRecord>;
    read(setupId: string): Promise<SetupRecord>;
    patch(setupId: string, operations: JsonPatchOperation[]): Promise<SetupRecord>;
    replace(setupId: string, setup: SimSetup): Promise<SetupRecord>;
    remove(setupId: string): Promise<void>;
    validate(setupId: string): Promise<SetupReport>;
    preflight(setupId: string): Promise<SetupReport>;
    addRail(setupId: string, rail: Rail): Promise<SetupRecord>;
    addTerminal(setupId: string, terminal: Terminal): Promise<SetupRecord>;
    addSource(setupId: string, source: Source): Promise<SetupRecord>;
    addLoad(setupId: string, load: Load): Promise<SetupRecord>;
    addConverter(setupId: string, converter: Converter): Promise<SetupRecord>;
    addProbe(setupId: string, probe: Probe): Promise<SetupRecord>;
    setAnalysisRails(setupId: string, rails: string[], analysisId?: string): Promise<SetupRecord>;
    /** Pad references (`main:REF.PAD`) on a net, from the project's semantic index. */
    pads(net: string): Promise<string[]>;
    /** Show a setup in the Studio. */
    open(setupId: string): void;

    // Power tree (the Setup tab's canvas)
    /** A new DC drop setup, adaptive mesh on, from the inferred tree or blank. */
    newSetup(name: string, options?: { seed?: "inferred" | "blank"; commit?: string }): Promise<SetupRecord>;
    /** The tree Prism infers from the netlist; `notes` say what it could not settle. */
    inferPowerTree(commit?: string): Promise<InferredTree>;
    /** `replace` swaps in the inferred tree; `add` keeps yours and adds what is missing. */
    applyInferred(setupId: string, mode?: "replace" | "add"): Promise<SetupRecord>;
    tree(setupId: string): Promise<{ elements: TreeElement[]; edges: TreeEdge[] }>;
    /** Adds an element; incomplete ones wait on the canvas until assigned and connected. Returns its node id. */
    addElement(setupId: string, kind: ElementKind, fields?: ElementPatch, position?: Point): Promise<string>;
    /** Part, net, rails or values of an element. Returns its (possibly new) node id. */
    updateElement(setupId: string, node: string, patch: ElementPatch): Promise<string>;
    /** source→rail, rail→converter, converter→rail or rail→load. */
    connect(setupId: string, from: string, to: string): Promise<string>;
    removeElement(setupId: string, node: string): Promise<void>;
    setSolved(setupId: string, railId: string, solved: boolean): Promise<SetupRecord>;
    autoArrange(setupId: string): Promise<void>;
    /** One analysis setting, e.g. ("mesh", "max_adaptive_passes", 40); `undefined` restores the default. */
    setSetting(setupId: string, section: string, key: string, value: unknown): Promise<SetupRecord>;
    /** Studio view: open a simulation (`null` for the cards), switch tab, select a canvas element. */
    showSimulation(kind: string | null): void;
    showTab(tab: StudioTab): void;
    select(node: string | null): void;
    /** Freeze the setup's current revision and queue one analysis (default `dc`). */
    submit(setupId: string, analysisId?: string): Promise<SimRun>;
    runs(): Promise<SimRun[]>;
    /** Show a finished run's result in the Studio. */
    view(runId: string): void;
}

declare global {
    interface Window {
        prismSimStudio?: SimStudioScriptApi;
    }
}

interface SemanticTerminal {
    reference?: string;
    pin?: string;
    netName?: string | null;
    pcbPadUuid?: string;
}

type Hooks = {
    /** A setup changed or was created; the UI reloads it. */
    onChange(setupId: string | null): void;
    onOpen(setupId: string): void;
    onView?(runId: string): void;
    onSimulation?(kind: string | null): void;
    onTab?(tab: StudioTab): void;
    onSelect?(node: string | null): void;
    commit?: string;
};

export function createSimStudioScriptApi(projectId: string, hooks: Hooks): SimStudioScriptApi {
    const changed = <T extends SetupRecord>(record: T): T => {
        hooks.onChange(record.setup_id);
        return record;
    };
    const patch = async (setupId: string, operations: JsonPatchOperation[]) => {
        const current = await api.readSetup(projectId, setupId);
        return changed(await api.patchSetup(projectId, setupId, current.etag, operations));
    };
    const append = (collection: string) => (setupId: string, item: unknown) =>
        patch(setupId, [{ op: "add", path: `/${collection}/-`, value: item }]);

    const commitOf = (record: SetupRecord) => record.source.commit ?? hooks.commit;
    /** Load the tree and board, apply one model edit, save what changed. */
    const editTree = async (
        setupId: string, change: (state: TreeState, board: BoardIndex) => TreeState | { state: TreeState; node: string },
    ) => {
        const current = await loadTree(projectId, setupId);
        const board = await boardIndex(projectId, commitOf(current.record));
        const result = change({ setup: current.record.setup, layout: current.layout }, board);
        const next = "state" in result ? result.state : result;
        const saved = await saveTree(projectId, current, next);
        hooks.onChange(setupId);
        return { record: saved.record, node: "node" in result ? result.node : undefined };
    };

    return {
        version: "a1",
        projectId,
        catalog: api.readCatalog,
        list: () => api.listSetups(projectId),
        draft: async (name, options = {}) =>
            changed(await api.draftSetup(projectId, options.kind ?? "dc-drop", name, options.commit ?? hooks.commit)),
        read: (setupId) => api.readSetup(projectId, setupId),
        patch,
        replace: async (setupId, setup) => {
            const current = await api.readSetup(projectId, setupId);
            return changed(await api.replaceSetup(projectId, setupId, current.etag, setup));
        },
        remove: async (setupId) => {
            const current = await api.readSetup(projectId, setupId);
            await api.deleteSetup(projectId, setupId, current.etag);
            hooks.onChange(null);
        },
        validate: (setupId) => api.checkSetup(projectId, setupId, "validate"),
        preflight: (setupId) => api.checkSetup(projectId, setupId, "preflight"),
        addRail: append("rails"),
        addTerminal: append("terminals"),
        addSource: append("sources"),
        addLoad: append("loads"),
        addConverter: append("converters"),
        addProbe: append("probes"),
        setAnalysisRails: async (setupId, rails, analysisId = "dc") => {
            const current = await api.readSetup(projectId, setupId);
            const index = current.setup.analyses.findIndex((analysis) => analysis.id === analysisId);
            if (index < 0) throw new Error(`No analysis ${analysisId} in ${setupId}`);
            return changed(await api.patchSetup(projectId, setupId, current.etag, [
                { op: "replace", path: `/analyses/${index}/rails`, value: rails },
            ]));
        },
        pads: async (net) => {
            const query = hooks.commit ? `?commit=${encodeURIComponent(hooks.commit)}` : "";
            const index = await fetchJson<{ terminals?: SemanticTerminal[] }>(
                `/api/projects/${encodeURIComponent(projectId)}/semantic-index/identity${query}`,
                undefined,
                "Could not load the board's pads",
            );
            return (index.terminals ?? [])
                .filter((terminal) => terminal.netName === net && terminal.pcbPadUuid && terminal.reference && terminal.pin)
                .map((terminal) => `main:${terminal.reference}.${terminal.pin}`)
                .sort();
        },
        open: (setupId) => hooks.onOpen(setupId),
        newSetup: async (name, options = {}) => {
            const created = await createSetup(projectId, name, options.seed ?? "inferred", options.commit ?? hooks.commit);
            hooks.onChange(created.record.setup_id);
            return created.record;
        },
        inferPowerTree: (commit) => api.readPowerTree(projectId, commit ?? hooks.commit),
        applyInferred: async (setupId, mode = "add") => {
            const record = await api.readSetup(projectId, setupId);
            const inferred = await api.readPowerTree(projectId, commitOf(record));
            return (await editTree(setupId, (state) => {
                const merged = mergeInferred(state, inferred, mode);
                return mode === "replace" ? autoArrange(merged) : merged;
            })).record;
        },
        tree: async (setupId) => {
            const current = await loadTree(projectId, setupId);
            return treeOf({ setup: current.record.setup, layout: current.layout });
        },
        addElement: async (setupId, kind, fields = {}, position) =>
            (await editTree(setupId, (state, board) => addElement(state, board, kind, fields, position))).node!,
        updateElement: async (setupId, node, patch) =>
            (await editTree(setupId, (state, board) => updateElement(state, board, node, patch))).node!,
        connect: async (setupId, from, to) =>
            (await editTree(setupId, (state, board) => connect(state, board, from, to))).node!,
        removeElement: async (setupId, node) => {
            await editTree(setupId, (state) => removeElement(state, node));
        },
        setSolved: async (setupId, railId, solved) => (await editTree(setupId, (state) => setSolved(state, railId, solved))).record,
        autoArrange: async (setupId) => {
            await editTree(setupId, (state) => autoArrange(state));
        },
        setSetting: async (setupId, section, key, value) =>
            (await editTree(setupId, (state) => ({ ...state, setup: withSetting(state.setup, section, key, value) }))).record,
        showSimulation: (kind) => hooks.onSimulation?.(kind),
        showTab: (tab) => hooks.onTab?.(tab),
        select: (node) => hooks.onSelect?.(node),
        submit: async (setupId, analysisId = "dc") => {
            const current = await api.readSetup(projectId, setupId);
            const run = await api.submitSetup(projectId, setupId, current.etag, analysisId);
            hooks.onChange(setupId);
            return run;
        },
        runs: () => api.listRuns(projectId),
        view: (runId) => hooks.onView?.(runId),
    };
}

/** Installs the API on `window` and returns the function that removes it again. */
export function installSimStudioScriptApi(projectId: string, hooks: Hooks): () => void {
    const scriptApi = createSimStudioScriptApi(projectId, hooks);
    window.prismSimStudio = scriptApi;
    return () => {
        if (window.prismSimStudio === scriptApi) delete window.prismSimStudio;
    };
}
