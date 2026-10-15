// Mirrors prism-sim-studio's a0 contracts (contracts/contracts/setup.tsp and
// studio.tsp). The TypeSpec there is the authority.

export type CatalogStatus = "available" | "planned";

export interface CatalogEntry {
    kind: string;
    display_name: string;
    summary: string;
    status: CatalogStatus;
}

export interface SimCatalog {
    schema: "prism.sim.catalog";
    version: "a0";
    entries: CatalogEntry[];
}

export interface Rail {
    id: string;
    net: string;
    voltage_v: number;
    tolerance_pct?: number;
    inferred?: boolean;
}

export interface Terminal {
    id: string;
    positive: string[];
    reference: string[];
}

export interface Source {
    id: string;
    rail: string;
    terminal: string;
    sense_terminal?: string;
    component?: string;
}

export interface Load {
    id: string;
    rail: string;
    terminal: string;
    current_a: number;
    distribution: "uniform";
    component?: string;
}

export interface Converter {
    id: string;
    component: string;
    input_rail: string;
    input_terminal: string;
    output_source: string;
    /** Absent means switching. */
    kind?: "switching" | "linear";
    /** Switching converters only. */
    efficiency?: number;
    /** Linear converters: the regulator's own input current. */
    quiescent_current_a?: number;
}

export interface Probe {
    id: string;
    terminal: string;
}

export interface DcDropAnalysis {
    id: string;
    kind: "dc-drop";
    rails: string[];
    settings?: Record<string, unknown>;
}

export interface SimSetup {
    schema: "prism.sim.setup";
    version: "a0";
    name: string;
    bundle: { board_id: string; sha256?: string };
    materials: { library?: Record<string, string>; slices: Record<string, unknown> };
    components: Record<string, unknown>;
    rails: Rail[];
    terminals: Terminal[];
    sources: Source[];
    loads: Load[];
    converters: Converter[];
    probes: Probe[];
    analyses: DcDropAnalysis[];
}

export interface SetupSource {
    commit?: string;
    project_path: string;
}

export interface SetupRecord {
    schema: "prism.sim.setup-record";
    version: "a0";
    setup_id: string;
    project_id: string;
    etag: string;
    revision: number;
    kind: string;
    source: SetupSource;
    created_by: string;
    created_at: string;
    updated_at: string;
    setup: SimSetup;
}

export interface SetupRecordSummary {
    setup_id: string;
    etag: string;
    revision: number;
    kind: string;
    name: string;
    source: SetupSource;
    updated_at: string;
}

export interface SetupIssue {
    severity: "error" | "warning";
    code: string;
    path: string;
    message: string;
    refs?: string[];
}

export interface SetupReport {
    schema: "prism.sim.setup-report";
    version: "a0";
    stage: "validate" | "preflight";
    setup_sha256: string;
    ok: boolean;
    issues: SetupIssue[];
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface SimRun {
    schema: "prism.sim.run";
    version: "a0";
    run_id: string;
    job_id: string;
    setup_id: string;
    setup_revision: number;
    setup_sha256: string;
    analysis_id: string;
    commit?: string;
    status: RunStatus;
    /** Why a failed or cancelled run stopped. */
    message?: string;
    created_at: string;
}

export type JsonPatchOperation =
    | { op: "add" | "replace" | "test"; path: string; value: unknown }
    | { op: "remove"; path: string }
    | { op: "move" | "copy"; from: string; path: string };
