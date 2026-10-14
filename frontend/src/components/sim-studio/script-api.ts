import { fetchJson } from "@/lib/api";

import * as api from "./api";
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
 * `window.prismSimStudio`: the setup UI's script API (sim-adr-0017). It drives
 * the same endpoints as the UI with the signed-in session, so a setup can be
 * built from the browser console or a test harness in a few calls:
 *
 *   const s = await prismSimStudio.draft("3V3 single load");
 *   await prismSimStudio.addTerminal(s.setup_id, { id: "vrm", positive: ["main:U5.2"], reference: ["main:U5.3"] });
 *   await prismSimStudio.preflight(s.setup_id);
 *
 * Writes read the current ETag first, so each call is still guarded. It is
 * installed while the Simulation Studio tab is mounted, for that project.
 */
export interface SimStudioScriptApi {
    readonly version: "a0";
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
    /** Freeze the setup's current revision and queue one analysis (default `dc`). */
    submit(setupId: string, analysisId?: string): Promise<SimRun>;
    runs(): Promise<SimRun[]>;
    /** Open the PCB 3D tab on a finished run's result. */
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

    return {
        version: "a0",
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
