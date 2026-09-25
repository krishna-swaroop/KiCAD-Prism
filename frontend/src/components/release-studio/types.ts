export type GovernedDomain = "bare_board" | "assembly" | "documentation" | "evidence";

/** Configuration snapshot captured on the build from Source, Identity, and Manufacturing. */
export type ReleaseConfiguration = {
    config_key: string;
    title: string;
    board_rel: string;
    schematic_rel: string;
    default_variant: string;
    typography?: string;
    document_number?: string;
    revision?: string;
    release_date?: string;
    release_notes?: string;
    fields?: Record<string, string>;
    notes?: Record<string, string[]>;
    vendors?: string[];
    variants?: string[];
    template?: string;
    sheets?: string[];
    manufacturing_ipc_class?: string;
    assembly_ipc_class?: string;
    solder_mask_colour?: string;
    silkscreen_colour?: string;
    via_treatment?: string;
};

export type DocumentSheet = {
    key: string;
    svg?: { path: string; released_digest: string; media_type: string };
    pdf?: { path: string; released_digest: string; media_type: string };
};

export type ReleaseCandidate = {
    id: string;
    project_id: string;
    config_key: string;
    commit_sha: string;
    variant: string;
    build_key: string;
    status: "draft" | "building" | "built" | "failed" | "superseded" | "frozen";
    hermetic: boolean;
    non_hermetic_reasons: string[];
    technical_config_digest: string;
    input_closure_digest: string;
    toolchain_digest: string;
    created_by: string;
    created_at: string;
    builds?: ReleaseBuild[];
    latest_build?: ReleaseBuild | null;
};

export type ReleaseBuild = {
    id: string;
    candidate_id: string;
    job_id?: string | null;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    attempt: number;
    manifest_digest: string;
    dossier_digest: string;
    dossier_artifact_id: string | null;
    evidence_artifact_id: string | null;
    error_code: string;
    error_message: string;
    warnings?: string[];
    started_at: string | null;
    completed_at: string | null;
    published?: boolean;
    published_tag?: string;
};

export type ReleaseMember = {
    id: string;
    path: string;
    member_kind: string;
    media_type: string;
    size_bytes: number;
    released_digest: string;
    source_raw_digest: string;
    canonicalizer: string;
    domains: GovernedDomain[];
};

export type ReleaseEvidence = {
    kind: "drc" | "erc";
    report_digest: string;
    counts: Record<string, number>;
};

export type ReviewSlot = "designer" | "qa";

export type ReviewDecision = {
    id: string;
    build_id: string;
    slot: ReviewSlot;
    actor: string;
    decision: "approved" | "withdrawn";
    note: string;
    dossier_digest: string;
    created_at: string;
};

export type PublishRecord = {
    id: string;
    build_id: string;
    tag: string;
    commit_sha: string;
    dossier_digest: string;
    published_by: string;
    forge_url: string;
    asset_names: string[];
    created_at: string;
};

export type ApprovalState = {
    designer: ReviewDecision | null;
    qa: ReviewDecision | null;
    both_approved: boolean;
    published: PublishRecord | null;
    electrical_errors: string[];
    can_approve_designer: boolean;
    can_approve_qa: boolean;
    can_withdraw: boolean;
    can_publish: boolean;
    blocked_reason: string;
};

export type VendorReadiness = {
    vendor_id?: string;
    profile_id?: string;
    ready: boolean;
    missing_requirements?: string[];
};

export type IpcOption = { value: string; label: string };

export type ManufacturingChoices = {
    manufacturing: IpcOption[];
    assembly: IpcOption[];
    solder_mask_colour?: IpcOption[];
    silkscreen_colour?: IpcOption[];
    via_treatment?: IpcOption[];
};

export type ReleaseSource = {
    boards: string[];
    schematics: string[];
    board: string;
    schematic: string;
    project: string;
    variants: string[];
    bom_presets: string[];
    default_bom_preset: string;
    variant?: string;
};

export type ReleaseIdentity = {
    tag: string;
    document_name: string;
    date: string;
    notes: string;
};

export type ReleaseManufacturing = {
    manufacturing_ipc_class: string;
    assembly_ipc_class: string;
    solder_mask_colour: string;
    silkscreen_colour: string;
    via_treatment: string;
    vendors: string[];
};

export type ForgeTarget = {
    kind: "github" | "gitlab" | "unsupported";
    name: string;
    host: string;
    owner_repo: string;
    token_configured: boolean;
    token_hint: string;
};

export type BuildDetail = {
    build: ReleaseBuild;
    candidate?: ReleaseCandidate;
    configuration?: ReleaseConfiguration;
    members: ReleaseMember[];
    evidence: ReleaseEvidence[];
    fingerprints: Record<string, { fingerprint: string; fidelity: string }>;
    vendor_readiness?: VendorReadiness[];
    forge?: ForgeTarget;
    approvals?: ApprovalState;
    forge_release?: { tag: string; url: string } | null;
};

export type ProjectCommit = {
    hash: string;
    full_hash: string;
    author: string;
    email: string;
    date: string;
    message: string;
};

export type VendorProfile = {
    id: string;
    title: string;
    pack_filename: string;
    description: string;
    required_pack_artifacts?: string[];
};

export type PipelineStepStatus = "queued" | "in_progress" | "success" | "failure" | "cancelled" | "skipped";

export type PipelineStep = {
    id: string;
    name: string;
    status: PipelineStepStatus;
    elapsed_ms?: number;
    log?: string;
    message?: string;
};

export type PipelineJob = {
    id: string;
    name: string;
    status: PipelineStepStatus;
    steps: PipelineStep[];
};

export type PipelineState = {
    jobs: PipelineJob[];
};

export type RunStage = "source" | "identity" | "manufacturing" | "build" | "outputs" | "publish";
export type StudioView = "settings" | "current" | "history";

export type StageState = "done" | "active" | "pending" | "failed" | "cancelled" | "locked";

export type BuildLogStep = {
    step_id: string;
    step_type: string;
    status?: string;
    returncode: number | null;
    elapsed_ms: number;
    skipped_reason: string;
    argv: string[];
};

export type BuildLogIndex = {
    timings: { name: string; elapsed_ms: number }[];
    steps: BuildLogStep[];
};
