"""Generated from openapi.json by tools/generate.py. Do not edit."""

from __future__ import annotations

from typing import Any, TypedDict


class AcceptProjectImportProposalRequest(TypedDict, total=False):
    asset_links: dict[str, str]
    asset_selections: dict[str, list[str]]
    change_summary: str
    metadata_overrides: dict[str, Any]


class AccessUserDeletedResponse(TypedDict, total=True):
    deleted: str
    sessions_revoked: int


class AcknowledgeRequest(TypedDict, total=True):
    visibility: str


class ActiveSession(TypedDict, total=False):
    client_ip: str
    created_at: str
    expires_at: str
    id: str
    last_seen_at: str
    user_agent: str


class AgentTokenView(TypedDict, total=False):
    created_at: str | None
    email: str
    expires_at: int
    jti: str
    label: str
    last_used_at: str | None
    scopes: list[str]


class AlignmentRequest(TypedDict, total=False):
    offsetMm: list[float]
    rotationDeg: list[float]
    scale: float


class AnalyzeRequest(TypedDict, total=False):
    ref: str | None
    url: str


class AnchoredCommentRequest(TypedDict, total=False):
    """A comment for one design element, named instead of clicked.

Exactly one of ``component``, ``net`` or ``sheet`` is required; the route
answers 400 ``invalid-anchor`` otherwise, so the refusal carries the typed
error the MCP tool surfaces rather than a validation array."""
    commentClass: str | None
    commit: str | None
    component: str | None
    content: str
    net: str | None
    severity: str | None
    sheet: str | None
    view: str | None


class ApplyMetadataBatchRequest(TypedDict, total=False):
    item_ids: list[str]


class ApplyTemplateRequest(TypedDict, total=True):
    template_id: str


class ApprovalDecision(TypedDict, total=True):
    approvals: ApprovalState


class ApprovalState(TypedDict, total=True):
    blocked_reason: str
    both_approved: bool
    can_approve_designer: bool
    can_approve_qa: bool
    can_publish: bool
    can_withdraw: bool
    designer: ReviewDecision | None
    electrical_errors: list[str]
    published: PublishRecord | None
    qa: ReviewDecision | None
    unpinned_models: list[UnpinnedModel]


class AssetBrowseResult(TypedDict, total=True):
    files: list[str]
    total: int


class AssetChange(TypedDict, total=True):
    after: ComparedAsset | None
    before: ComparedAsset | None
    key: str
    status: str


class AssetSearchItem(TypedDict, total=True):
    asset_type: str
    id: str
    name: str
    sha256: str
    size_bytes: int
    target_library: str
    target_name: str
    usage_count: int


class AssetSearchPage(TypedDict, total=True):
    items: list[AssetSearchItem]


class AttachManufacturerRequest(TypedDict, total=True):
    manufacturer_id: str


class AuditEvent(TypedDict, total=True):
    actor: str
    component_id: str
    created_at: str
    details: dict[str, Any]
    details_json: str
    event_hash: str
    event_type: str
    id: str
    previous_hash: str
    revision_id: str
    sequence: int


class AuditEventPage(TypedDict, total=True):
    items: list[AuditEvent]


class AuditVerification(TypedDict, total=False):
    anchored_head_hash: str | None
    asset_count: int | None
    coverage: str
    event_count: int
    first_invalid_asset_id: str | None
    first_invalid_event_id: str
    first_invalid_revision_id: str | None
    head_hash: str
    purged_asset_ids: list[str] | None
    reason: str
    revision_count: int | None
    valid: bool
    verified_count: int


class AuthConfig(TypedDict, total=False):
    """Authentication configuration exposed to frontend."""
    auth_enabled: bool
    dev_mode: bool
    oidc_enabled: bool
    oidc_provider_name: str
    password_auth_enabled: bool
    sim_studio_enabled: bool
    workspace_name: str


class AuthSuccessResponse(TypedDict, total=True):
    """The answer to a session mutation that has nothing else to say."""
    success: bool


class BenchmarkMetrics(TypedDict, total=True):
    """Queue latency, job write rate and the API's pool counters."""
    activeJobs: int
    apiCommentLive: CommentLiveMetrics
    apiDatabasePool: DatabasePoolMetrics
    apiThreadPool: ThreadPoolMetrics
    byKindStatus: list[KindStatusCount]
    claimLatencyMs: ClaimLatency
    jobCount: int
    jobUpdateRatePerSecond: JobUpdateRate
    since: str


class BoardSize(TypedDict, total=True):
    height: float
    width: float


class BoardSpecRequest(TypedDict, total=False):
    active_sections: list[str] | None
    source: dict[str, Any]
    specs: dict[str, Any]


class Body_agent_token(TypedDict, total=True):
    code: str
    code_verifier: str
    redirect_uri: str


class Body_import_auxiliary_asset(TypedDict, total=False):
    file: str
    target_library: str


class Body_import_footprint(TypedDict, total=False):
    counterpart_asset_id: str
    file: str
    selected_footprint: str
    target_library: str


class Body_import_inventory_csv(TypedDict, total=True):
    file: str


class Body_import_proposals_csv(TypedDict, total=True):
    file: str


class Body_import_symbol_library(TypedDict, total=False):
    counterpart_asset_id: str
    file: str
    selected_symbol: str
    target_library: str


class Body_preview_metadata_csv(TypedDict, total=False):
    change_summary: str
    file: str


class Body_token(TypedDict, total=False):
    client_id: str
    client_secret: str
    grant_type: str
    scope: str


class Body_upload_comment_attachment(TypedDict, total=True):
    file: str


class Body_upload_evidence(TypedDict, total=True):
    file: str


class Body_upload_folder_snapshot_file(TypedDict, total=True):
    file: str
    relative_path: str


class Body_upload_project_thumbnail(TypedDict, total=True):
    file: str


class BomLineOut(TypedDict, total=True):
    fields: dict[str, str]
    key: str
    quantity: int
    references: list[str]


class BomOut(TypedDict, total=True):
    columns: list[str]
    commit: str | None
    designKey: str
    lines: list[BomLineOut]


class BuildDetail(TypedDict, total=True):
    approvals: ApprovalState
    build: BuildRecord
    candidate: CandidateRecord
    configuration: dict[str, Any]
    evidence: list[EvidenceRecord]
    fingerprints: dict[str, FingerprintRecord]
    forge: ForgeSummary
    forge_release: ForgeRelease | None
    members: list[MemberRecord]
    vendor_readiness: list[VendorReadiness]


class BuildLogStep(TypedDict, total=True):
    argv: list[str]
    elapsed_ms: int | float
    returncode: int | None
    skipped_reason: str
    status: str
    step_id: str
    step_type: str


class BuildLogs(TypedDict, total=True):
    steps: list[BuildLogStep]
    timings: list[Any]


class BuildRecord(TypedDict, total=True):
    """One ``ws_release_builds`` row."""
    attempt: int
    candidate_id: str
    completed_at: str | None
    created_at: str
    dossier_artifact_id: str | None
    dossier_digest: str
    error_code: str
    error_message: str
    evidence_artifact_id: str | None
    fence: int
    id: str
    job_id: str | None
    manifest_digest: str
    started_at: str | None
    status: str
    timings: Any
    toolchain: dict[str, Any]
    warnings: list[Any]


class BulkAcceptItem(TypedDict, total=False):
    asset_links: dict[str, str]
    asset_selections: dict[str, list[str]]
    change_summary: str
    metadata_overrides: dict[str, Any]
    proposal_id: str


class BulkAcceptRequest(TypedDict, total=False):
    items: list[BulkAcceptItem]


class BulkImportAcceptance(TypedDict, total=True):
    accepted: int
    failed: int
    results: list[BulkImportAcceptanceItem]


class BulkImportAcceptanceItem(TypedDict, total=False):
    component_id: str | None
    error: str | None
    proposal_id: str
    status: str


class BundleBuildProfileOut(TypedDict, total=False):
    archive_bytes: int
    bundle_key: str
    cache: BundleCacheOut
    commit: str | None
    completed_at: str | None
    design_key: str | None
    error: str
    failed_stages: list[str]
    invocations: list[BundleInvocationOut]
    job_id: str | None
    job_status: str | None
    kicad_steps: list[BundleKicadStepOut]
    partial_stages: list[str]
    project_id: str
    queue_wait_seconds: float | None
    revision_key: str
    slowest_step: str | None
    stages: dict[str, str]
    started_at: str | None
    state: str
    wall_seconds: float | None


class BundleCacheOut(TypedDict, total=False):
    models_cache_hit: bool | None
    refill_cache_hit: bool | None
    upgrade_cache_hits: int
    upgrade_cache_misses: int


class BundleInvocationOut(TypedDict, total=False):
    elapsed_ms: float | None
    executable: str
    exit: int | None
    peak_rss_bytes: int | None
    stage: str | None
    subcommand: str


class BundleKicadStepOut(TypedDict, total=False):
    elapsed_ms: float | None
    exit: int | None
    peak_rss_bytes: int | None
    runs: int
    step: str


class BundleRebuildOut(TypedDict, total=True):
    """The design-bundle rebuild an ops action queued."""
    commit: str | None
    job_id: str | None
    removed_aliases: int
    removed_bundles: int
    scope: str


class BundleStore(TypedDict, total=True):
    archive_bytes: int
    archives: int


class CacheEntry(TypedDict, total=False):
    disk_bytes: int | None
    disk_files: int | None
    disk_partial: bool
    hit_rate: float | None
    hits: int | None
    misses: int | None
    name: str
    newest_access: str | None
    oldest_access: str | None
    table_bytes: int | None
    table_rows: int | None


class CacheStats(TypedDict, total=True):
    bundle_store: BundleStore
    caches: list[CacheEntry]
    window_minutes: int


class CandidateCreated(TypedDict, total=True):
    job: JobRecord


class CandidateList(TypedDict, total=True):
    candidates: list[CandidateWithBuilds]


class CandidateRecord(TypedDict, total=True):
    """One ``ws_release_candidates`` row."""
    authored_overrides: dict[str, Any]
    build_key: str
    commit_sha: str
    config_key: str
    configuration_document: dict[str, Any] | None
    configuration_snapshot_captured: bool
    created_at: str
    created_by: str
    generator_build: str
    hermetic: bool
    id: str
    input_closure_digest: str
    non_hermetic_reasons: list[Any]
    policy_document: dict[str, Any] | None
    policy_snapshot_captured: bool
    project_id: str
    repository_id: str
    self_contained: bool | None
    status: str
    technical_config_digest: str
    toolchain_digest: str
    updated_at: str
    variant: str


class CandidateRequest(TypedDict, total=False):
    board: str
    bom_preset: str
    commit_sha: str
    config_key: str
    identity: dict[str, Any]
    impedance_csv: str
    manufacturing: dict[str, Any]
    schematic: str
    stackup_pdf_b64: str
    variant: str


class CandidateWithBuilds(TypedDict, total=True):
    authored_overrides: dict[str, Any]
    build_key: str
    builds: list[ListedBuild]
    commit_sha: str
    config_key: str
    configuration_document: dict[str, Any] | None
    configuration_snapshot_captured: bool
    created_at: str
    created_by: str
    generator_build: str
    hermetic: bool
    id: str
    input_closure_digest: str
    latest_build: ListedBuild | None
    non_hermetic_reasons: list[Any]
    policy_document: dict[str, Any] | None
    policy_snapshot_captured: bool
    project_id: str
    repository_id: str
    self_contained: bool | None
    status: str
    technical_config_digest: str
    toolchain_digest: str
    updated_at: str
    variant: str


class CatalogCategories(TypedDict, total=True):
    categories: list[CatalogCategory]


class CatalogCategory(TypedDict, total=True):
    count: int
    name: str


class CatalogComponent(TypedDict, total=False):
    """A full component payload, or the lightweight summary the queue returns.

Fields the summary does not carry are optional; ``response_model_exclude_unset``
keeps an absent field out of the response instead of emitting ``null``."""
    assets: list[ComponentAsset]
    availability_state: str
    category: str
    change_kind: str | None
    change_summary: str | None
    component_created_at: str | None
    component_updated_at: str
    created_by: str
    current_revision_id: str | None
    datasheet_url: str
    default_representation_id: str | None
    description: str
    effective_representation_id: str | None
    external_id: str | None
    external_payload: dict[str, Any] | None
    external_source: str | None
    external_updated_at: str | None
    external_url: str | None
    external_workflow_id: str | None
    external_workflow_source: str | None
    external_workflow_url: str | None
    extra_fields: dict[str, Any]
    id: str
    identity_kind: str
    interface: dict[str, Any]
    inventory_status: str
    is_active: bool | None
    is_historical_revision: bool | None
    kind: str
    last_synced_at: str | None
    library_name: str
    local_inventory: LocalInventory | None
    lot_number: str | None
    manifest_hash: str | None
    manufacturer: str
    mass_g: str
    missing_assets: list[str]
    mpn: str
    name: str
    package_name: str
    parent_revision_id: str | None
    pedigree: str | None
    place_enabled: bool
    power_dissipation_w: str
    previews: list[ComponentPreview]
    rate: str
    release_status: str
    released_revision_id: str | None
    released_view: bool
    representations: list[Representation] | None
    revision: int
    revision_created_at: str | None
    revision_id: str
    revision_updated_at: str
    rqjc_c_w: str
    rqjc_top_c_w: str
    sap_code: str
    serial_number: str | None
    slug: str
    source: str
    source_ref: dict[str, Any]
    stock_known: bool
    stock_quantity: float
    stock_uom: str
    summary: str
    supply: Supply | None
    symbol_name: str
    sync_error: str | None
    sync_status: str | None
    temp_max_c: str
    temp_min_c: str
    validation: ValidationSummary
    value: str
    vendor: str
    vendor_part_number: str
    version: str
    workflow_stage: str


class CatalogComponentPage(TypedDict, total=True):
    items: list[CatalogComponent]
    page: int
    page_size: int
    pages: int
    total: int


class CatalogHealth(TypedDict, total=True):
    checker_available: bool
    checker_path: str
    enabled: bool
    missing_files: int
    place_ready: int
    preview_failed: int
    release_gate: str
    released: int
    released_assets_missing_on_disk: int | None
    total_components: int
    validation: dict[str, int]


class CatalogJob(TypedDict, total=True):
    """A ``ws_jobs`` row after the catalog adapter and result spread.

The adapter spreads a completed job's ``result`` at the top level, so this
model accepts keys it does not name."""
    artifact_key: str | None
    attempt: int
    attempts: int
    available_at: str | None
    cancel_requested_at: str | None
    checkpoint: dict[str, Any]
    completed_at: str | None
    created_at: str | None
    created_by: str
    error_code: str
    error_message: str
    fence: int
    heartbeat_at: str | None
    id: str
    job_id: str
    job_type: str
    kind: str
    lease_expires_at: str | None
    lease_owner: str
    lock_requirements: list[Any]
    log_path: str | None
    max_attempts: int
    message: str
    payload: dict[str, Any]
    percent: float
    priority: int
    progress: float
    project_id: str | None
    repository_id: str | None
    requested_by: str
    resource_requirements: dict[str, Any]
    result: dict[str, Any]
    result_digest: str | None
    result_metadata: dict[str, Any]
    result_path: str | None
    stage: str
    started_at: str | None
    status: str
    updated_at: str | None
    worker_pool: str


class CatalogJobQueued(TypedDict, total=True):
    job_id: str
    status: str


class CatalogJobWithEvents(TypedDict, total=True):
    artifact_key: str | None
    attempt: int
    attempts: int
    available_at: str | None
    cancel_requested_at: str | None
    checkpoint: dict[str, Any]
    completed_at: str | None
    created_at: str | None
    created_by: str
    error_code: str
    error_message: str
    events: list[app__api__catalog_admin_models__JobEvent]
    fence: int
    heartbeat_at: str | None
    id: str
    job_id: str
    job_type: str
    kind: str
    lease_expires_at: str | None
    lease_owner: str
    lock_requirements: list[Any]
    log_path: str | None
    max_attempts: int
    message: str
    payload: dict[str, Any]
    percent: float
    priority: int
    progress: float
    project_id: str | None
    repository_id: str | None
    requested_by: str
    resource_requirements: dict[str, Any]
    result: dict[str, Any]
    result_digest: str | None
    result_metadata: dict[str, Any]
    result_path: str | None
    stage: str
    started_at: str | None
    status: str
    updated_at: str | None
    worker_pool: str


class CategoryCount(TypedDict, total=True):
    count: int
    name: str


class CategoryList(TypedDict, total=True):
    categories: list[CategoryCount]


class ChangePasswordRequest(TypedDict, total=True):
    current_password: str
    new_password: str


class CheckAccessRequest(TypedDict, total=True):
    url: str


class ClaimAttemptOut(TypedDict, total=False):
    ended_at: str | None
    fence: int | None
    outcome: str
    seconds: float | None
    started_at: str | None
    worker_id: str | None


class ClaimLatency(TypedDict, total=True):
    max: float
    p50: float
    p95: float


class CommentAnchorView(TypedDict, total=False):
    baseCommit: str | None
    commit: str | None
    compareCommit: str | None
    designKey: str | None
    projectFile: str | None
    selectedSide: str | None
    source: str | None
    sourceRevisionKey: str | None
    state: str


class CommentAttachmentUploadView(TypedDict, total=False):
    filename: str
    height: int | None
    id: str
    mediaType: str
    size: int
    state: str
    url: str
    width: int | None


class CommentAttachmentView(TypedDict, total=False):
    filename: str
    height: int | None
    id: str
    mediaType: str
    size: int
    state: str
    width: int | None


class CommentChangesPage(TypedDict, total=True):
    changes: list[CommentLiveChange]
    cursor: int
    hasMore: bool


class CommentHistoryEntry(TypedDict, total=True):
    changeKind: str
    commentClass: str | None
    content: str | None
    contentFormat: str | None
    editedAt: str
    editorAuthType: str | None
    editorClientId: str | None
    editorDisplay: str
    editorKind: str
    editorUserId: str | None
    mentions: list[str] | None
    origin: str
    revision: int
    severity: str | None
    status: str | None
    targetId: str
    targetKind: str


class CommentLiveChange(TypedDict, total=True):
    """One replayable change, as ``comment_live_events.changes_after`` projects it."""
    baseCommit: str | None
    changeKind: str
    commentId: str
    compareCommit: str | None
    createdAt: str
    cursor: int
    scope: str


class CommentLiveMetrics(TypedDict, total=True):
    connections: int
    deliveredEvents: int
    eventLagMaxMs: float
    eventLagMeanMs: float
    listenerConnected: bool
    listenerReconnects: int
    replayFailures: int


class CommentLocation(TypedDict, total=False):
    bounds: list[float] | None
    layer: str
    page: str
    x: float
    y: float


class CommentLocationView(TypedDict, total=False):
    bounds: list[float] | None
    layer: str
    page: str
    x: float
    y: float


class CommentPermissionsView(TypedDict, total=False):
    canDelete: bool | None
    canEdit: bool | None
    canPublish: bool | None
    canReply: bool | None
    canResolve: bool | None
    canRetry: bool | None
    canShare: bool | None


class CommentReactionView(TypedDict, total=False):
    count: int
    mine: bool
    reaction: str
    users: list[str]


class CommentReplySyncView(TypedDict, total=False):
    externalCommentId: str | None
    externalUrl: str | None
    reason: str | None
    state: str


class CommentReplyView(TypedDict, total=False):
    attachments: list[CommentAttachmentView] | None
    author: str
    authorClientId: str | None
    authorClientName: str | None
    authorKind: str
    authorUserId: str | None
    content: str
    contentFormat: str
    deletedAt: str | None
    editedAt: str | None
    id: str
    origin: str
    permissions: CommentPermissionsView | None
    reactions: list[CommentReactionView] | None
    revision: int
    sync: CommentReplySyncView | None
    syncState: str | None
    timestamp: str
    updatedAt: str


class CommentThreadView(TypedDict, total=True):
    comment: CommentView | None
    cursor: int


class CommentView(TypedDict, total=False):
    """One root thread, whether read or returned by a write."""
    anchor: CommentAnchorView
    anchorKind: str | None
    attachments: list[CommentAttachmentView] | None
    author: str
    authorClientId: str | None
    authorClientName: str | None
    authorKind: str
    authorUserId: str | None
    baseCommit: str | None
    commentClass: str
    compareCommit: str | None
    comparisonDomain: str | None
    content: str
    contentFormat: str
    context: str
    deletedAt: str | None
    editedAt: str | None
    elementId: str | None
    elementRef: str | None
    elementType: str | None
    filePath: str | None
    forgeIssueId: str | None
    forgeIssueUrl: str | None
    forgeProvider: str | None
    forgeSyncState: str | None
    id: str
    location: CommentLocationView
    mentions: list[str]
    metadata: dict[str, Any] | None
    permissions: CommentPermissionsView | None
    reactions: list[CommentReactionView] | None
    replies: list[CommentReplyView]
    revision: int
    scope: str
    semanticItemId: str | None
    severity: str
    status: str
    timestamp: str
    tracker: TrackerProjectionView | None
    updatedAt: str


class CommentsListing(TypedDict, total=True):
    """A snapshot listing (canvas or one comparison pair)."""
    comments: list[CommentView]
    cursor: int
    meta: CommentsMetaView


class CommentsMetaView(TypedDict, total=True):
    generator: str
    version: str


class CommentsSourceRelativeUrls(TypedDict, total=True):
    delete_url_template: str
    list_url: str
    patch_url_template: str
    reply_url_template: str


class CommitDistance(TypedDict, total=True):
    commits_behind: int


class CommitFileChange(TypedDict, total=True):
    additions: int | None
    deletions: int | None
    filename: str
    path: str
    status: str


class CommitKicadChanges(TypedDict, total=True):
    other: int
    pcb: int
    pro: int
    sch: int


class ComparedAsset(TypedDict, total=True):
    assetId: str
    assetType: str
    previewGeneratorFingerprint: str
    previewId: str
    previewSha256: str
    previewStatus: str
    previews: list[ComparedPreview]
    sha256: str
    sizeBytes: int
    targetLibrary: str
    targetName: str


class ComparedPreview(TypedDict, total=True):
    previewGeneratorFingerprint: str
    previewId: str
    previewSha256: str
    previewStatus: str
    unit: str
    unitLabel: str


class ComparedRepresentation(TypedDict, total=True):
    displayOrder: int
    footprintAssetId: str
    isDefault: bool
    label: str
    provenance: dict[str, Any]
    sourceInternalPartNumber: str
    symbolAssetId: str


class ComparedRevision(TypedDict, total=True):
    manifestHash: str
    revisionId: str
    version: int


class ComparisonReviewOut(TypedDict, total=True):
    domain: str
    groups: list[ReviewGroupOut]
    jobId: str


class ComponentAsset(TypedDict, total=True):
    asset_type: str
    content_type: str
    id: str
    name: str
    required: bool
    sha256: str
    size_bytes: int
    source_group: str
    target_library: str
    target_name: str


class ComponentDeleteResult(TypedDict, total=True):
    ok: bool


class ComponentDetail(TypedDict, total=True):
    assets: list[dict[str, Any]]
    availability_state: str
    category: str
    datasheet_url: str
    default_representation_id: str
    description: str
    effective_representation_id: str
    footprint_preview_url: str
    id: str
    identity_kind: str
    inline_url: str
    library_name: str
    manifest_url: str
    manufacturer: str
    missing_assets: list[str]
    mpn: str
    name: str
    package_name: str
    place_enabled: bool
    preview_status: dict[str, Any]
    release_status: str
    released_revisions: list[ReleasedRevision]
    representations: list[dict[str, Any]]
    revision_id: str
    slug: str
    summary: str
    supply: dict[str, Any]
    symbol_name: str
    symbol_preview_url: str
    version: str
    workflow_stage: str


class ComponentMutation(TypedDict, total=True):
    """A write that answers with the component's fresh payload."""
    component: CatalogComponent | None


class ComponentPage(TypedDict, total=True):
    has_more: bool
    items: list[ComponentPayload]
    page: int
    page_size: int
    pages: int | None
    total: int | None


class ComponentPayload(TypedDict, total=True):
    """One released component as ``_component_payload`` shapes it for KiCad."""
    assets: list[dict[str, Any]]
    availability_state: str
    category: str
    datasheet_url: str
    default_representation_id: str
    description: str
    effective_representation_id: str
    footprint_preview_url: str
    id: str
    identity_kind: str
    inline_url: str
    library_name: str
    manifest_url: str
    manufacturer: str
    missing_assets: list[str]
    mpn: str
    name: str
    package_name: str
    place_enabled: bool
    preview_status: dict[str, Any]
    release_status: str
    representations: list[dict[str, Any]]
    revision_id: str
    slug: str
    summary: str
    supply: dict[str, Any]
    symbol_name: str
    symbol_preview_url: str
    version: str
    workflow_stage: str


class ComponentPreview(TypedDict, total=True):
    asset_id: str
    content_type: str
    file_path: str
    generation_error: str
    generator_fingerprint: str
    generator_version: str
    id: str
    kind: str
    preview_key: str
    sha256: str
    status: str
    unit: str
    unit_label: str
    updated_at: str


class ComponentReleaseRecord(TypedDict, total=True):
    approval_decision_id: str
    component_id: str
    created_at: str
    id: str
    manifest_hash: str
    policy: dict[str, Any]
    policy_json: str
    release_label: str
    released_by: str
    revision_id: str
    validation: dict[str, Any]
    validation_json: str


class ComponentReleaseRecordPage(TypedDict, total=True):
    items: list[ComponentReleaseRecord]


class ComponentReviewDecision(TypedDict, total=True):
    component_id: str
    created_at: str
    decision: str
    id: str
    manifest_hash: str
    note: str
    policy: dict[str, Any]
    policy_json: str
    reviewer: str
    reviewer_role: str
    revision_id: str
    validation: dict[str, Any]
    validation_json: str


class ComponentReviewDecisionPage(TypedDict, total=True):
    items: list[ComponentReviewDecision]


class ComponentRevision(TypedDict, total=True):
    change_kind: str
    change_summary: str
    component_id: str
    created_at: str
    created_by: str
    id: str
    manifest_hash: str
    parent_revision_id: str
    release_status: str
    updated_at: str
    version: int
    workflow_stage: str


class ComponentRevisionPage(TypedDict, total=True):
    items: list[ComponentRevision]


class ComponentUsage(TypedDict, total=True):
    component_id: str
    details: list[Any]
    details_json: str
    first_seen_at: str
    id: str
    is_current: bool
    last_seen_at: str
    project_id: str
    references: list[Any]
    references_json: str
    source: str
    source_revision: str


class ComponentUsagePage(TypedDict, total=True):
    items: list[ComponentUsage]


class ComponentValidation(TypedDict, total=True):
    runs: list[ValidationRun]
    summary: ValidationSummary


class ConnectorCredentials(TypedDict, total=False):
    appId: str
    installationId: str
    oauthClientId: str
    oauthClientSecret: str
    privateKey: str
    webhookSecret: str


class CreateCommentRequest(TypedDict, total=False):
    commentClass: str | None
    content: str
    contentFormat: str | None
    context: str
    elementId: str | None
    elementRef: str | None
    elementType: str | None
    location: CommentLocation
    mentions: list[str] | None
    metadata: dict[str, Any] | None
    revision: CreateDisplayedRevision | None
    severity: str | None


class CreateComparisonCommentRequest(TypedDict, total=False):
    anchorKind: str
    baseCommit: str
    commentClass: str | None
    compareCommit: str
    content: str
    contentFormat: str | None
    domain: str
    filePath: str | None
    mentions: list[str] | None
    selectedSide: str | None
    semanticItemId: str | None
    semanticItemRef: str | None
    severity: str | None


class CreateConnectorRequest(TypedDict, total=False):
    baseUrl: str
    credentials: ConnectorCredentials | None
    displayName: str
    id: str | None
    instanceKind: str
    provider: str


class CreateDisplayedRevision(TypedDict, total=False):
    commit: str | None
    sourceRevisionKey: str | None
    worktree: bool


class CreateFolderRequest(TypedDict, total=False):
    name: str
    parent_id: str | None


class CreateManualComponentRequest(TypedDict, total=False):
    category: str
    change_summary: str
    datasheet: str
    description: str
    extra_fields: dict[str, str]
    manufacturer: str
    manufacturer_part_number: str
    mass_g: str
    package_name: str
    power_dissipation_w: str
    rate: str
    rqjc_c_w: str
    rqjc_top_c_w: str
    sap_code: str
    temp_max_c: str
    temp_min_c: str
    value: str
    vendor: str
    vendor_part_number: str


class CreateMetadataBatchRequest(TypedDict, total=False):
    change_summary: str
    items: list[MetadataBatchItemRequest]


class CreatePersonalTokenRequest(TypedDict, total=False):
    expiresInDays: int
    name: str
    scopes: list[str]


class CreateReplyRequest(TypedDict, total=False):
    content: str
    contentFormat: str | None


class CreateRepresentationRequest(TypedDict, total=False):
    change_summary: str
    display_order: int
    footprint_asset_id: str
    is_default: bool
    label: str
    provenance: dict[str, Any]
    source_internal_part_number: str
    symbol_asset_id: str


class CreateServiceClientRequest(TypedDict, total=False):
    name: str
    role: str
    scopes: list[str]


class CreatedPersonalToken(TypedDict, total=False):
    """The one response that carries the secret, shown once."""
    created_at: str
    expires_at: str
    id: str
    last_used_at: str | None
    name: str
    prefix: str
    revoked_at: str | None
    scopes: list[str]
    token: str
    user_email: str


class CreatedWebhook(TypedDict, total=False):
    """The one response that carries the plaintext signing secret."""
    attempts: int
    createdAt: str
    createdBy: str | None
    cursor: int
    eventKinds: list[str]
    failingSince: str | None
    id: str
    lastDeliveryAt: str | None
    lastError: str | None
    lastStatus: int | None
    nextAttemptAt: str | None
    projectIds: list[str] | None
    secret: str
    status: str
    url: str


class DatabasePoolMetrics(TypedDict, total=True):
    connectionWaitCount: int
    connectionWaitMaxMs: float
    connectionWaitMeanMs: float
    pool: dict[str, Any]


class DebugLoggingCleared(TypedDict, total=True):
    """Confirmation that the debug window was removed."""
    cleared: bool


class DebugLoggingRequest(TypedDict, total=False):
    """A debug window of one to thirty minutes for the named loggers."""
    loggers: list[str] | None
    minutes: int


class DebugLoggingWindow(TypedDict, total=True):
    """The DEBUG window currently in force."""
    loggers: list[str]
    until: str


class DefectRequest(TypedDict, total=False):
    category: str
    description: str
    quantity_affected: int
    severity: str


class DefectUpdateRequest(TypedDict, total=False):
    category: str | None
    description: str | None
    quantity_affected: int | None
    resolution_note: str | None
    severity: str | None
    status: str | None


class DeleteDesignCompareResponse(TypedDict, total=True):
    status: str


class DeletedCommentView(TypedDict, total=True):
    deleted: str


class DeliveryHealth(TypedDict, total=True):
    deliveries: int
    error_rate: float
    failed: int
    ok: int


class DesignAssemblyOut(TypedDict, total=False):
    dnp: bool | None
    excludeFromBoard: bool | None
    excludeFromBom: bool | None
    excludeFromPosFiles: bool | None
    excludeFromSim: bool | None


class DesignBundleStatus(TypedDict, total=True):
    """The bundle counts, alias count, stored size and the incomplete list."""
    aliases: int
    bundles: dict[str, int]
    failedBuilds: list[FailedBuild]
    incomplete: IncompleteCounts
    incompleteRevisions: list[IncompleteRevision]
    storedBytes: int


class DesignCompareDebugEvent(TypedDict, total=False):
    event: str
    payload: dict[str, Any]
    reset: bool
    sequence: int
    session_id: str
    timestamp: str


class DesignCompareDebugLogResponse(TypedDict, total=True):
    path: str
    status: str


class DesignCompareRequest(TypedDict, total=False):
    base: str
    head: str
    include_unchanged: bool


class DesignCompareResult(TypedDict, total=False):
    """A comparison result: the finished v2 manifest, or the partial tab document.

The tabs themselves are ``prism-kicad``'s documents and are passed through
untouched, so they stay ``dict`` and every key the models miss is allowed."""
    base: str | dict[str, Any] | None
    bom: dict[str, Any] | None
    counts: dict[str, Any] | None
    fabrication: dict[str, Any] | None
    files: dict[str, Any] | None
    head: str | dict[str, Any] | None
    modes: dict[str, str] | None
    pcb: dict[str, Any] | None
    projectDiff: dict[str, Any] | None
    readiness: dict[str, Any] | None
    resultSchema: str | None
    revisions: dict[str, Any] | None
    routeMetrics: dict[str, Any] | None
    schema: str | None
    schematic: dict[str, Any] | None
    sidecars: dict[str, DesignCompareSidecarRef] | None
    stackup: dict[str, Any] | None


class DesignCompareSidecarRef(TypedDict, total=False):
    """One sidecar's manifest entry; the route adds its ``url``."""
    digest: str | None
    mediaType: str | None
    sizeBytes: int | None
    url: str | None


class DesignComponent(TypedDict, total=False):
    assembly: DesignAssemblyOut
    componentUid: str | None
    dnp: bool
    fields: dict[str, str]
    footprint: str
    inBom: bool | None
    libraryRef: str | None
    page: str | None
    pins: list[DesignPinOut]
    reference: str
    sheet: str | None
    value: str


class DesignComponentOut(TypedDict, total=True):
    component: DesignComponent
    revision: DesignRevisionOut


class DesignNet(TypedDict, total=False):
    aliases: list[str]
    components: list[str]
    name: str
    netClass: str
    netUid: str | None
    pins: list[DesignNetPin]


class DesignNetOut(TypedDict, total=True):
    net: DesignNet
    revision: DesignRevisionOut


class DesignNetPin(TypedDict, total=False):
    pin: str
    pinName: str
    reference: str


class DesignPinOut(TypedDict, total=False):
    net: str | None
    netUid: str | None
    pin: str
    pinName: str


class DesignRevisionOut(TypedDict, total=False):
    commit: str
    designKey: str | None


class DesignSearchHit(TypedDict, total=False):
    field: str | None
    footprint: str | None
    kind: str
    matched: str
    name: str | None
    reference: str | None
    value: str | None


class DesignSearchOut(TypedDict, total=True):
    query: str
    results: list[DesignSearchHit]
    revision: DesignRevisionOut


class DestinationBody(TypedDict, total=False):
    containerKind: str
    containerPath: str
    generation: int | None
    remoteContainerId: str
    visibility: str | None


class DetectedPaths(TypedDict, total=True):
    detected: PathConfig
    validation: PathConfigValidation


class DocFileContent(TypedDict, total=True):
    content: str
    path: str


class DocumentReadiness(TypedDict, total=True):
    progress: int
    stage: str


class DocumentSheet(TypedDict, total=True):
    key: str
    pdf: SheetPdf


class DocumentSheetList(TypedDict, total=True):
    sheets: list[DocumentSheet]


class DraftSetupRequest(TypedDict, total=False):
    commit: str | None
    kind: str
    name: str


class DrillSummary(TypedDict, total=True):
    holes: int
    slots: int
    smallest: float | None
    tools: list[DrillTool]


class DrillTool(TypedDict, total=True):
    diameter: float
    file: str
    function: str
    hits: int
    plated: bool
    slots: int


class EventAndWebhookHealth(TypedDict, total=False):
    events_last_hour: list[EventKindCount]
    head_cursor: int
    oldest_retained_at: str | None
    retention_days: int
    webhooks: list[WebhookHealth]


class EventKindCount(TypedDict, total=True):
    count: int
    kind: str


class EventOut(TypedDict, total=True):
    createdAt: str
    id: int
    kind: str
    payload: dict[str, Any]
    projectId: str | None
    topic: str


class EventPage(TypedDict, total=True):
    events: list[EventOut]
    next: int


class EvidenceRecord(TypedDict, total=True):
    build_id: str
    counts: dict[str, Any]
    created_at: str
    id: str
    kind: str
    report_digest: str


class FabricationLayer(TypedDict, total=True):
    colour: str
    file: str
    function: str
    id: str
    kind: str
    name: str
    role: str
    side: str
    warnings: list[str]


class FabricationView(TypedDict, total=True):
    board: list[float] | None
    bounds: list[float] | None
    copperLayers: int
    drill: DrillSummary
    layers: list[FabricationLayer]
    present: bool
    renderVersion: int
    size: BoardSize | None


class FailedBuild(TypedDict, total=True):
    """A bundle whose build failed outright."""
    commit: str | None
    reason: str
    revisionKey: str | None


class FileItem(TypedDict, total=True):
    is_dir: bool
    modified_date: str
    name: str
    path: str
    size: int
    type: str


class FingerprintRecord(TypedDict, total=True):
    build_id: str
    domain: str
    fidelity: str
    fingerprint: str
    inputs: dict[str, Any]


class FolderApprovalRequest(TypedDict, total=False):
    approved_component_ids: list[str]
    footprint_resolutions: dict[str, str]


class FolderBulkMoveResult(TypedDict, total=True):
    message: str
    moved: int


class FolderContents(TypedDict, total=True):
    folders: list[FolderRecord]
    projects: list[Project]


class FolderDeleted(TypedDict, total=True):
    message: str


class FolderDiscovery(TypedDict, total=True):
    components: list[FolderDiscoveryComponent]
    directory_signature: str
    discovery_file_count: int
    existing_component_count: int
    inventory_file_count: int
    required_paths: list[str]


class FolderDiscoveryComponent(TypedDict, total=True):
    existing_component: FolderDiscoveryMatch | None
    findings: list[FolderDiscoveryFinding]
    footprint: FolderDiscoveryFootprint
    footprint_reference: str
    id: str
    library: str
    metadata: FolderDiscoveryMetadata
    models: list[FolderDiscoveryModel]
    symbol: FolderDiscoverySymbol
    symbol_name: str


class FolderDiscoveryFinding(TypedDict, total=True):
    code: str
    message: str
    severity: str


class FolderDiscoveryFootprint(TypedDict, total=True):
    candidates: list[FolderDiscoveryFootprintFile]
    selected: FolderDiscoveryFootprintFile | None
    status: str


class FolderDiscoveryFootprintFile(TypedDict, total=True):
    filename_name: str
    library: str
    name: str
    relative_path: str


class FolderDiscoveryMatch(TypedDict, total=True):
    """The catalog part an identity already belongs to (``existing_component``)."""
    component_id: str
    is_active: bool
    manufacturer: str
    manufacturer_part_number: str
    name: str
    revision_id: str
    version: int


class FolderDiscoveryMetadata(TypedDict, total=True):
    datasheet: str
    description: str
    fields: dict[str, str]
    manufacturer: str
    manufacturer_part_number: str
    value: str


class FolderDiscoveryModel(TypedDict, total=True):
    candidates: list[dict[str, Any]]
    reference: str
    status: str


class FolderDiscoveryRequest(TypedDict, total=False):
    files: list[FolderInventoryFile]
    footprint_resolutions: dict[str, str]


class FolderDiscoverySymbol(TypedDict, total=True):
    relative_path: str


class FolderImportRoot(TypedDict, total=True):
    name: str
    path_hint: str


class FolderImportRootPage(TypedDict, total=True):
    items: list[FolderImportRoot]


class FolderInventoryFile(TypedDict, total=False):
    relative_path: str
    size_bytes: int


class FolderMoveResult(TypedDict, total=True):
    """One project moved to a folder."""
    message: str


class FolderNode(TypedDict, total=True):
    """One row of the folder tree the workspace renders."""
    allowed_roles: list[str]
    depth: int
    direct_project_count: int
    has_children: bool
    id: str
    name: str
    parent_id: str | None
    total_project_count: int
    visibility_mode: str | None


class FolderRecord(TypedDict, total=True):
    """A ``ws_folders`` row as the folder-content route returns it."""
    allowed_roles: list[str]
    created_at: str
    id: str
    name: str
    parent_id: str | None
    updated_at: str
    visibility_mode: str | None


class FolderSnapshot(TypedDict, total=True):
    """A ``catalog_import_snapshots`` row as ``create_snapshot`` returns it.

``created_at`` and ``completed_at`` arrive as ``datetime`` values from
PostgreSQL. The route's JSON has always carried their ISO spelling
(``+00:00``, not Pydantic's ``Z``), so the model states the wire type and
converts the raw value instead of re-serializing it."""
    completed_at: str | None
    created_at: str
    created_by: str
    display_name: str
    file_count: int
    id: str
    manifest_sha256: str
    size_bytes: int
    source_locator: str
    source_type: str
    status: str


class FolderSnapshotFile(TypedDict, total=True):
    relative_path: str
    sha256: str
    size_bytes: int


class FolderSnapshotRequest(TypedDict, total=False):
    display_name: str


class FootprintImportResult(TypedDict, total=False):
    component: CatalogComponent | None
    discovered_footprints: list[str] | None
    mode: str
    selected_footprint: str | None


class ForgeRelease(TypedDict, total=True):
    tag: str
    url: str


class ForgeSummary(TypedDict, total=True):
    host: str
    kind: str
    name: str
    owner_repo: str
    token_configured: bool
    token_hint: str


class GenerateSSHKeyRequest(TypedDict, total=False):
    email: str


class GenerateSSHKeyResponse(TypedDict, total=False):
    fingerprint: str | None
    public_key: str | None
    success: bool


class GeneratorTag(TypedDict, total=True):
    build: str
    name: str
    version: str


class GitAccessCheckResponse(TypedDict, total=True):
    """A live ``ls-remote`` answer, plus how to grant access if it was refused."""
    authorized: bool
    default_branch: str | None
    deploy_key_url: str | None
    forge: str
    instructions: str
    message: str
    reachable: bool
    reason: str


class GitAccessKeyView(TypedDict, total=True):
    """The workspace key and what an operator can confirm about it."""
    comment: str | None
    created_at: str | None
    exists: bool
    fingerprint: str | None
    key_type: str | None
    public_key: str | None


class GitAccessRepositoryView(TypedDict, total=False):
    """One imported repository's access state, without a network call."""
    deploy_key_url: str | None
    forge: str | None
    guidance: str | None
    host: str | None
    host_trusted: bool | None
    id: str | None
    last_synced_at: str | None
    name: str | None
    url: str


class GitAccessResponse(TypedDict, total=True):
    key: GitAccessKeyView
    repositories: list[GitAccessRepositoryView]
    tools: dict[str, bool]
    trusted_hosts: list[str]


class HTTPValidationError(TypedDict, total=False):
    detail: list[ValidationError]


class HostKeyForgetResponse(TypedDict, total=True):
    host: str
    removed: bool


class HostKeyRequest(TypedDict, total=False):
    host: str
    port: int


class HostKeyScanResponse(TypedDict, total=True):
    already_trusted: bool
    fingerprints: list[str]
    host: str


class HostKeyTrustResponse(TypedDict, total=True):
    fingerprints: list[str]
    host: str
    trusted: bool


class ImportAccessHelp(TypedDict, total=True):
    """What to do about a repository Prism cannot read."""
    account_key_url: str | None
    deploy_key_url: str | None
    fingerprint: str | None
    forge: str
    host: str
    host_trusted: bool
    instructions: str
    key_exists: bool
    public_key: str | None


class ImportFollowUp(TypedDict, total=False):
    """One derived job and whether an import could queue it."""
    error: str | None
    job_id: str | None
    operation: str
    project_id: str
    status: str


class ImportFollowUpsRetried(TypedDict, total=True):
    follow_ups: list[ImportFollowUp]
    job_ids: list[str]
    message: str
    project_id: str
    status: str


class ImportProposal(TypedDict, total=True):
    accepted_component_id: str
    assets: list[dict[str, Any]]
    component_uid: str
    created_at: str
    dedupe_key: str
    draft: dict[str, Any]
    findings: list[dict[str, Any]]
    id: str
    metadata: dict[str, Any]
    provenance: list[dict[str, Any]]
    reference: str
    session_id: str
    status: str
    updated_at: str


class ImportProposalAcceptance(TypedDict, total=True):
    component: CatalogComponent | None
    proposal: ImportProposal | None


class ImportProposalPage(TypedDict, total=True):
    items: list[ImportProposal]


class ImportRequest(TypedDict, total=False):
    import_type: str
    ref: str | None
    selected_paths: list[str] | None
    url: str


class ImportSession(TypedDict, total=True):
    candidate_count: int
    created_at: str
    created_by: str
    error_message: str
    id: str
    project_id: str
    project_ids: list[str]
    project_revisions: dict[str, str]
    proposal_count: int
    scope: str
    selection: dict[str, Any]
    source_revision: str
    status: str
    updated_at: str


class ImportSessionCreated(TypedDict, total=True):
    candidate_count: int
    created_at: str
    created_by: str
    error_message: str
    id: str
    job_id: str
    project_id: str
    project_ids: list[str]
    project_revisions: dict[str, str]
    proposal_count: int
    scope: str
    selection: dict[str, Any]
    source_revision: str
    status: str
    updated_at: str


class ImportSessionPage(TypedDict, total=True):
    items: list[ImportSession]


class ImportedProposalCsv(TypedDict, total=True):
    saved: int
    skipped_unknown_rows: int


class IncompleteCounts(TypedDict, total=True):
    failed: int
    partial: int


class IncompleteRevision(TypedDict, total=True):
    """A complete bundle whose stages failed or were only partial."""
    commit: str | None
    failedStages: list[str]
    partialStages: list[str]
    reason: str
    revisionKey: str | None


class InlineBundle(TypedDict, total=True):
    compression: str
    data: str
    display_name: str
    library: str
    part_id: str
    representation_id: str
    symbol_name: str


class InventoryImportResult(TypedDict, total=True):
    errors: list[str]
    not_found: int
    updated: int


class IpcOption(TypedDict, total=True):
    label: str
    value: str


class IpcOptions(TypedDict, total=True):
    assembly: list[IpcOption]
    manufacturing: list[IpcOption]
    silkscreen_colour: list[IpcOption]
    solder_mask_colour: list[IpcOption]
    via_treatment: list[IpcOption]


class JobCancelOut(TypedDict, total=True):
    """The job after a cancel request, and the status that request reached."""
    job_id: str
    status: str


class JobCancelRequested(TypedDict, total=True):
    """A cancel request: the status the service reports may be a terminal one."""
    job_id: str
    status: str | None


class JobEventOut(TypedDict, total=False):
    created_at: str | None
    details: dict[str, Any]
    event_type: str
    id: int
    percent: float | None
    stage: str


class JobEvents(TypedDict, total=True):
    events: list[app__api__jobs__JobEvent]
    job_id: str


class JobLockOut(TypedDict, total=False):
    fence: int | None
    lease_expires_at: str | None
    lease_owner: str
    lock_key: str
    mode: str


class JobLogs(TypedDict, total=True):
    job_id: str
    lines: list[str]


class JobPhasesOut(TypedDict, total=False):
    claims: list[ClaimAttemptOut]
    queue_wait: QueueWaitOut | None
    stages: list[StageRunOut]


class JobRecord(TypedDict, total=True):
    """One ``ws_jobs`` row as ``JobService.enqueue`` answers it."""
    artifact_key: str | None
    attempt: int
    available_at: str | None
    cache_hit: bool
    cancel_requested_at: str | None
    completed_at: str | None
    created_at: str | None
    deduplicated: bool
    error_code: str
    error_message: str
    fence: int
    heartbeat_at: str | None
    job_id: str
    kind: str
    lease_expires_at: str | None
    lease_owner: str
    lock_requirements: list[Any]
    log_path: str | None
    max_attempts: int
    message: str
    payload: dict[str, Any]
    percent: float
    priority: int
    project_id: str | None
    repository_id: str | None
    requested_by: str
    resource_requirements: dict[str, Any]
    result_digest: str | None
    result_metadata: dict[str, Any]
    result_path: str | None
    stage: str
    started_at: str | None
    status: str
    updated_at: str | None
    worker_pool: str


class JobRequeueOut(TypedDict, total=True):
    """The job after a requeue: its new state, fence and attempt budget."""
    attempt: int
    fence: int
    job_id: str
    max_attempts: int
    previous_fence: int
    previous_status: str
    status: str


class JobStarted(TypedDict, total=True):
    """A route that queued a job and reported the status the service chose."""
    job_id: str
    status: str


class JobStatus(TypedDict, total=False):
    """The slim job row the status route returns."""
    attempt: int | None
    available_at: str | None
    cancel_requested_at: str | None
    completed_at: str | None
    created_at: str | None
    error_code: str | None
    error_message: str | None
    job_id: str
    kind: str | None
    max_attempts: int | None
    message: str | None
    percent: float | None
    pipeline: Any
    project_id: str | None
    repository_id: str | None
    result_digest: str | None
    result_metadata: dict[str, Any] | None
    result_url: str | None
    stage: str | None
    started_at: str | None
    status: str | None
    updated_at: str | None


class JobSummaryOut(TypedDict, total=False):
    attempt: int | None
    cancel_requested_at: str | None
    completed_at: str | None
    created_at: str | None
    error_code: str
    error_message: str
    exit_code: int | None
    fence: int | None
    job_id: str
    kind: str
    lease_owner: str
    max_attempts: int | None
    priority: int | None
    project_id: str | None
    repository_id: str | None
    stage: str
    started_at: str | None
    status: str
    updated_at: str | None
    worker_pool: str


class JobTimelineOut(TypedDict, total=True):
    events: list[JobEventOut]
    events_truncated: bool
    job: JobSummaryOut
    locks: list[JobLockOut]
    log_tail: list[str]
    payload_keys: list[str]
    phases: JobPhasesOut
    resource_slots: list[ResourceSlotOut]
    result_metadata_keys: list[str]


class JobUpdateRate(TypedDict, total=True):
    max: float
    p95: float


class KicadDblBundle(TypedDict, total=True):
    category_count: int
    component_count: int
    export_root: str
    fp_lib_table: str
    linux_dbl: str
    missing_models: list[KicadDblMissingModel]
    model_count: int
    sqlite_path: str
    sym_lib_table: str
    windows_dbl: str


class KicadDblMissingModel(TypedDict, total=True):
    asset_id: str
    component_id: str
    reason: str
    revision_id: str


class KindStatusCount(TypedDict, total=True):
    count: int
    kind: str
    status: str


class LabelsBody(TypedDict, total=False):
    base: str
    boardPrefix: str
    classPrefix: str
    severityPrefix: str


class LatencyTotals(TypedDict, total=True):
    count: int
    estimatedTotalMs: float
    overflow: bool
    p50Ms: float | None
    p95Ms: float | None
    p99Ms: float | None
    rate4xx: float
    rate5xx: float
    routeCount: int
    status4xx: int
    status5xx: int


class LinkAssetRequest(TypedDict, total=False):
    counterpart_asset_id: str
    file_path: str
    target_library: str
    target_name: str


class ListedBuild(TypedDict, total=True):
    """A build as ``store.list_builds`` joins it to its publish record."""
    attempt: int
    candidate_id: str
    completed_at: str | None
    created_at: str
    dossier_artifact_id: str | None
    dossier_digest: str
    error_code: str
    error_message: str
    evidence_artifact_id: str | None
    fence: int
    id: str
    job_id: str | None
    manifest_digest: str
    published: bool
    published_tag: str
    started_at: str | None
    status: str
    timings: Any
    toolchain: dict[str, Any]
    warnings: list[Any]


class LocalInventory(TypedDict, total=True):
    fetch_status: str
    fetched_at: str
    inventory_status: str
    mixed_fetch: bool
    mixed_freshness: bool
    mixed_status: bool
    mixed_units: bool
    quantity: float
    source: str
    uom: str


class LoginRequest(TypedDict, total=True):
    """Request body for OIDC auth code exchange."""
    code: str
    redirectUri: str
    state: str


class LoginStartResponse(TypedDict, total=True):
    """Where the browser should send the user to authenticate."""
    authorization_url: str


class ManifestAsset(TypedDict, total=True):
    asset_type: str
    content_type: str
    download_url: str
    name: str
    required: bool
    sha256: str
    size_bytes: int
    target_library: str
    target_name: str


class ManufacturerRequest(TypedDict, total=False):
    contact: str
    name: str
    notes: str
    website: str


class MateOut(TypedDict, total=True):
    componentId: str
    createdAt: str
    createdBy: str
    manufacturer: str
    mpn: str
    name: str


class MatePage(TypedDict, total=True):
    items: list[MateOut]


class MateRequest(TypedDict, total=True):
    componentId: str


class McpAuditPage(TypedDict, total=True):
    next: int | None
    rows: list[McpAuditRow]


class McpAuditRow(TypedDict, total=False):
    at: str
    auth_type: str
    client_id: str
    code: str | None
    duration_ms: int
    id: int
    method: str
    outcome: str
    project_id: str | None
    revision: str | None
    token_id: str
    tool: str
    user_email: str


class McpClientAdminView(TypedDict, total=False):
    client_name: str
    created_at: str
    host: str
    id: str
    last_used_at: str | None
    scopes: list[str]
    user_email: str


class McpClientView(TypedDict, total=False):
    """A connected client as its owner may see it; never a token or a hash."""
    client_name: str
    created_at: str
    host: str
    id: str
    last_used_at: str | None
    scopes: list[str]


class McpGovernance(TypedDict, total=False):
    """The workspace's MCP policy, in the spelling the Settings API uses."""
    disabledTools: list[str]
    projectIds: list[str]
    projectScope: str


class McpGovernanceView(TypedDict, total=False):
    """The saved policy plus every registered tool, disabled or not."""
    disabledTools: list[str]
    projectIds: list[str]
    projectScope: str
    tools: list[McpToolView]


class McpToolView(TypedDict, total=True):
    name: str
    title: str


class MemberRecord(TypedDict, total=True):
    build_id: str
    canonicalizer: str
    created_at: str
    domains: list[str]
    id: str
    media_type: str
    member_kind: str
    path: str
    released_digest: str
    size_bytes: int
    source_raw_digest: str


class MentionCandidate(TypedDict, total=True):
    email: str
    role: str


class MetadataBatch(TypedDict, total=True):
    applied_items: int
    change_summary: str
    created_at: str
    created_by: str
    failed_items: int
    id: str
    items: list[MetadataBatchItem]
    schema_version: str
    source: str
    status: str
    total_items: int
    unknown_fields: list[Any]
    updated_at: str
    valid_items: int


class MetadataBatchItem(TypedDict, total=True):
    applied_revision_id: str
    component_id: str
    diff: list[dict[str, str]]
    error_message: str
    expected_revision_id: str
    id: str
    mpn: str
    name: str
    patch: dict[str, str]
    validation_status: str


class MetadataBatchItemRequest(TypedDict, total=False):
    component_id: str
    expected_revision_id: str
    patch: dict[str, str]


class MetadataBatchStarted(TypedDict, total=True):
    batch_id: str
    job_id: str
    status: str


class MetadataChange(TypedDict, total=True):
    after: str
    before: str
    field: str
    status: str


class MetadataCsvPreview(TypedDict, total=True):
    applied_items: int
    change_summary: str
    created_at: str
    created_by: str
    failed_items: int
    id: str
    items: list[MetadataBatchItem]
    schema_version: str
    skipped_unchanged_rows: int
    source: str
    source_rows: int
    status: str
    total_items: int
    unknown_fields: list[Any]
    updated_at: str
    valid_items: int


class MetadataField(TypedDict, total=True):
    archived: bool
    built_in: bool
    created_at: str
    created_by: str
    description: str
    display_order: int
    enum_values: list[str]
    group: str
    id: str
    key: str
    label: str
    required: bool
    storage_key: str
    storage_kind: str
    type: str
    unit: str
    updated_at: str
    updated_by: str


class MetadataFieldPage(TypedDict, total=True):
    items: list[MetadataField]
    schema: str


class MetadataFieldRequest(TypedDict, total=False):
    description: str
    display_order: int | None
    enum_values: list[str]
    key: str
    label: str
    required: bool
    type: str
    unit: str


class MetadataGridPage(TypedDict, total=True):
    fields: list[MetadataField]
    items: list[CatalogComponent]
    page: int
    page_size: int
    pages: int
    schema: str
    total: int


class MetadataGridPreferences(TypedDict, total=False):
    """The saved layout, or ``{}`` when this user has never saved one."""
    order: list[str] | None
    pinned: list[str] | None
    visible: list[str] | None
    widths: dict[str, int] | None


class MetadataGridPreferencesRequest(TypedDict, total=False):
    order: list[str]
    pinned: list[str]
    visible: list[str]
    widths: dict[str, int]


class MissingPart(TypedDict, total=True):
    package: str
    ref: str
    status: str
    value: str


class ModelAlignment(TypedDict, total=True):
    offsetMm: list[float]
    rotationDeg: list[float]
    scale: float
    updatedAt: str | None
    updatedBy: str | None


class ModelConversionJob(TypedDict, total=True):
    jobId: str | None
    status: str | None


class ModelGlb(TypedDict, total=True):
    bounds: dict[str, Any]
    converter: str
    key: str
    materials: int
    sizeBytes: int


class ModelOut(TypedDict, total=True):
    alignment: ModelAlignment
    assetId: str
    glb: ModelGlb | None
    name: str
    stepSha256: str


class ModelPage(TypedDict, total=True):
    items: list[ModelOut]


class Monorepo(TypedDict, total=False):
    last_synced: str | None
    name: str
    path: str
    project_count: int
    repo_url: str | None


class MonorepoFolder(TypedDict, total=True):
    item_count: int
    name: str
    path: str


class MonorepoProject(TypedDict, total=True):
    display_name: str | None
    has_thumbnail: bool
    id: str
    last_modified: str
    name: str
    relative_path: str


class MonorepoStructure(TypedDict, total=True):
    current_path: str
    folders: list[MonorepoFolder]
    projects: list[MonorepoProject]
    repo_name: str


class MoveProjectRequest(TypedDict, total=False):
    folder_id: str | None


class MoveProjectsRequest(TypedDict, total=False):
    folder_id: str | None
    project_ids: list[str]


class OAuthBeginResponse(TypedDict, total=True):
    authorizeUrl: str


class OldestQueued(TypedDict, total=False):
    age_seconds: float
    oldest_queued_at: str | None
    worker_pool: str


class OpsProfile(TypedDict, total=False):
    createdAt: str
    error: str | None
    finishedAt: str | None
    host: str | None
    hz: int | None
    id: str
    pid: int | None
    requestedBy: str
    samples: int | None
    seconds: float
    stacks: list[ProfileStack]
    startedAt: str | None
    status: str
    target: str
    truncated: bool
    workerId: str | None


class OpsStatus(TypedDict, total=True):
    enabled: bool
    scopes: list[str]
    tools: list[str]


class PartManifest(TypedDict, total=True):
    assets: list[ManifestAsset]
    display_name: str
    library_name: str
    license: str
    part_id: str
    representation_id: str
    summary: str
    symbol_name: str


class PasswordLoginRequest(TypedDict, total=False):
    email: str
    password: str
    remember_me: bool


class PasswordLoginResponse(TypedDict, total=False):
    email: str
    must_change_password: bool
    name: str
    picture: str
    role: str


class PathConfig(TypedDict, total=False):
    """Path configuration model."""
    description: str | None
    designOutputs: str | None
    documentation: str | None
    jobset: str | None
    manufacturingOutputs: str | None
    pcb: str | None
    portfolio: dict[str, Any] | None
    project_name: str | None
    readme: str | None
    schematic: str | None
    subsheets: str | None
    thumbnail: str | None
    workflows: list[Any] | None


class PathConfigValidation(TypedDict, total=True):
    """A path configuration checked against the project on disk."""
    errors: list[str]
    resolved: dict[str, str]
    valid: bool
    warnings: list[str]


class PersonalTokenView(TypedDict, total=False):
    """A token as its owner (or an admin) may see it: no secret, no hash."""
    created_at: str
    expires_at: str
    id: str
    last_used_at: str | None
    name: str
    prefix: str
    revoked_at: str | None
    scopes: list[str]
    user_email: str


class PinCommentRequest(TypedDict, total=True):
    commit: str


class PlacedPart(TypedDict, total=True):
    package: str
    ref: str
    rotation: float
    side: str
    status: str
    value: str
    x: float
    y: float


class PlacementCounts(TypedDict, total=True):
    bottom: int
    dnpPlaced: int
    notInBom: int
    notPlaced: int
    placed: int
    top: int


class PlacementFiles(TypedDict, total=True):
    bom: str
    positions: str


class PlacementMissingPart(TypedDict, total=True):
    """A BOM part the position files never place."""
    package: str
    ref: str
    status: str
    value: str


class PlacementPart(TypedDict, total=True):
    """One placed part in board coordinates."""
    package: str
    ref: str
    rotation: float
    side: str
    status: str
    value: str
    x: float
    y: float


class PoolAndWorkers(TypedDict, total=True):
    memory_budget_mib: int
    oldest_queued: list[OldestQueued]
    pool: dict[str, Any]
    process: ProcessInfo
    queue: list[QueueDepth]
    resources: list[ResourceUsage]
    workers: list[WorkerInfo]


class ProcessInfo(TypedDict, total=True):
    host: str
    kind: str
    pid: int


class ProfileRequest(TypedDict, total=False):
    seconds: float
    target: str
    workerId: str | None


class ProfileStack(TypedDict, total=True):
    count: int
    stack: str


class Project(TypedDict, total=False):
    description: str
    display_name: str | None
    folder_id: str | None
    id: str
    import_type: str | None
    last_modified: str
    last_synced_at: str | None
    name: str
    origin_owner: str | None
    origin_url: str | None
    parent_repo: str | None
    parent_repo_path: str | None
    path: str
    portfolio: dict[str, Any] | None
    project_file: str | None
    registered_at: str | None
    repo_url: str | None
    sub_path: str | None
    thumbnail_source: str | None
    thumbnail_url: str | None


class ProjectBranch(TypedDict, total=True):
    author: str
    commit: str
    date: str
    email: str
    hash: str
    is_current: bool
    message: str
    name: str
    ref: str
    source: str


class ProjectBranches(TypedDict, total=True):
    branches: list[ProjectBranch]
    current_branch: str | None
    default_ref: str | None


class ProjectCommentsSourceUrls(TypedDict, total=True):
    """The helper URLs a KiCad comments source needs for one project."""
    base_url: str | None
    delete_url_template: str
    list_url: str
    patch_url_template: str
    project_id: str
    project_name: str
    relative: CommentsSourceRelativeUrls
    reply_url_template: str


class ProjectCommit(TypedDict, total=True):
    author: str
    date: str
    email: str
    full_hash: str
    hash: str
    kicad_changes: CommitKicadChanges
    message: str


class ProjectCommitSummary(TypedDict, total=True):
    base_commit: str | None
    compare_commit: str
    comparison_basis: str
    files: list[CommitFileChange]
    parent_count: int


class ProjectCommits(TypedDict, total=True):
    commits: list[ProjectCommit]
    has_more: bool
    head: str | None
    limit: int
    offset: int
    resolved_ref_sha: str
    total: int | None


class ProjectComponentSelectionRequest(TypedDict, total=False):
    component_uid: str
    pcb_footprint_uuid: str
    reference: str
    schematic_uuid: str


class ProjectConfigSaved(TypedDict, total=True):
    config: PathConfig
    resolved: ResolvedPaths
    validation: PathConfigValidation


class ProjectDeleted(TypedDict, total=False):
    """A removed project and what happened to its files and repository."""
    message: str
    removed_files: bool
    repository_deleted: bool
    warning: str | None


class ProjectDescription(TypedDict, total=True):
    description: str


class ProjectDescriptionRequest(TypedDict, total=True):
    description: str


class ProjectDescriptionUpdated(TypedDict, total=True):
    description: str
    message: str


class ProjectImportRequest(TypedDict, total=False):
    project_id: str
    scope: str
    selection: ProjectComponentSelectionRequest | None
    source_revision: str


class ProjectName(TypedDict, total=True):
    display_name: str | None
    fallback_name: str


class ProjectNameRequest(TypedDict, total=True):
    display_name: str


class ProjectNameUpdated(TypedDict, total=True):
    display_name: str
    message: str


class ProjectOverview(TypedDict, total=True):
    project: Project
    readme: str | None


class ProjectPathConfig(TypedDict, total=True):
    config: PathConfig
    resolved: ResolvedPaths
    source: str


class ProjectPropertiesFiles(TypedDict, total=False):
    pcb: ProjectPropertiesPcbFile | None
    schematic: ProjectPropertiesSchematicFile | None


class ProjectPropertiesLatestCommit(TypedDict, total=True):
    author: str
    date: str
    email: str
    full_hash: str
    hash: str
    message: str


class ProjectPropertiesPcbFile(TypedDict, total=False):
    dimensions_mm: dict[str, float] | None
    filename: str
    generator: str | None
    generator_version: str | None
    path: str
    thickness_mm: float | None
    title_block: ProjectPropertiesTitleBlock | None
    version: int | None


class ProjectPropertiesRepository(TypedDict, total=False):
    latest_commit: ProjectPropertiesLatestCommit | None
    latest_tag: ProjectPropertiesTag | None


class ProjectPropertiesResponse(TypedDict, total=True):
    files: ProjectPropertiesFiles
    project: Project
    repository: ProjectPropertiesRepository


class ProjectPropertiesSchematicFile(TypedDict, total=False):
    filename: str
    generator: str | None
    generator_version: str | None
    path: str
    title_block: ProjectPropertiesTitleBlock | None
    version: int | None


class ProjectPropertiesTag(TypedDict, total=True):
    commit_hash: str
    date: str
    message: str
    tag: str


class ProjectPropertiesTitleBlock(TypedDict, total=False):
    date: str
    title: str


class ProjectReadme(TypedDict, total=True):
    content: str


class ProjectRelease(TypedDict, total=False):
    commit_hash: str
    date: str
    full_hash: str
    message: str
    subproject_files_changed: int | None
    tag: str


class ProjectReleases(TypedDict, total=False):
    has_more: bool
    limit: int
    offset: int
    releases: list[ProjectRelease]
    resolved_ref_sha: str | None
    total: int | None


class ProjectSearchHit(TypedDict, total=True):
    description: str
    id: str
    last_modified: str
    last_synced_at: str | None
    name: str
    parent_repo: str | None
    sub_path: str | None
    thumbnail_url: str | None


class ProjectSearchResults(TypedDict, total=True):
    results: list[ProjectSearchHit]


class ProjectSpecCreateRequest(TypedDict, total=False):
    manufacturer_id: str
    name: str
    spec_config: str
    template_id: str | None


class ProjectSpecUpdateRequest(TypedDict, total=False):
    active_sections: list[str] | None
    name: str | None
    source: dict[str, Any] | None
    spec_config: str | None
    specs: dict[str, Any] | None


class ProjectVariantCatalog(TypedDict, total=True):
    """The revision's variant catalog and its diagnostics."""
    commit: str | None
    diagnostics: list[VariantCatalogDiagnostic]
    projectId: str
    schema: str
    sourceRevisionKey: str
    variants: list[VariantCatalogEntry]


class PublishRecord(TypedDict, total=True):
    acknowledged_models: list[str]
    asset_names: list[str]
    build_id: str
    commit_sha: str
    created_at: str
    dossier_digest: str
    forge_url: str
    id: str
    project_id: str
    published_by: str
    tag: str


class PublishRequest(TypedDict, total=False):
    acknowledged_models: list[str]
    notes: str
    tag: str
    title: str


class PublishResult(TypedDict, total=True):
    filename: str
    publish: PublishRecord
    release: ForgeRelease


class PushCommentsView(TypedDict, total=True):
    comments_path: str
    message: str
    success: bool


class QueueDepth(TypedDict, total=True):
    count: int
    kind: str
    status: str
    worker_pool: str


class QueueWaitOut(TypedDict, total=False):
    claimed_at: str | None
    created_at: str | None
    seconds: float | None


class ReattachCommentRequest(TypedDict, total=False):
    commit: str
    elementId: str | None
    location: CommentLocation
    relativePoint: list[float] | None


class RebuildBundleRequest(TypedDict, total=False):
    """Which commit to rebuild; omitted means the project's ``HEAD``."""
    commit: str | None


class RecentRequestOut(TypedDict, total=True):
    at: str | None
    authType: str
    clientId: str
    dbMs: int
    durationMs: int
    method: str
    nested: bool
    requestId: str
    route: str
    status: int


class RegenerateRequest(TypedDict, total=False):
    """What to rebuild: one commit (default ``HEAD``) or the whole project."""
    commit: str | None
    scope: str


class RegenerateThumbnailsRequest(TypedDict, total=True):
    project_ids: list[str]


class RegeneratedBundles(TypedDict, total=True):
    """What a manual regenerate dropped, and the rebuild it queued."""
    commit: str | None
    jobId: str | None
    removedAliases: int
    removedBundles: int
    scope: str


class ReleaseQueuePage(TypedDict, total=True):
    items: list[CatalogComponent]
    page: int
    page_size: int
    pages: int
    summary: ReleaseQueueSummary
    total: int


class ReleaseQueueSummary(TypedDict, total=True):
    blocked: int
    done: int
    qa_review: int


class ReleaseStatusRequest(TypedDict, total=False):
    expected_manifest_hash: str
    release_status: str
    review_note: str
    self_approval_override_reason: str
    workflow_stage: str


class ReleaseTagCheck(TypedDict, total=True):
    exists: bool
    tag: str


class ReleasedRevision(TypedDict, total=True):
    released_at: str
    revision_id: str
    version: int


class RenderHighlight(TypedDict, total=False):
    components: list[str]
    nets: list[str]


class RenderHighlightOut(TypedDict, total=True):
    found: bool
    key: str
    kind: str


class RenderRecordResponse(TypedDict, total=False):
    commit: str
    height: int | None
    highlights: list[RenderHighlightOut]
    pngUrl: str | None
    region: dict[str, float] | None
    renderId: str
    sheet: str | None
    status: str
    view: str
    width: int


class RenderRegion(TypedDict, total=True):
    height: float
    width: float
    x: float
    y: float


class RenderRequest(TypedDict, total=False):
    highlight: RenderHighlight | None
    layers: str
    region: RenderRegion | None
    revision: str | None
    sheet: str | None
    side: str
    view: str
    width: int


class RenderStartResponse(TypedDict, total=False):
    jobId: str | None
    renderId: str
    status: str


class ReplyCreatedView(TypedDict, total=True):
    comment: CommentView
    reply: CommentReplyView


class Representation(TypedDict, total=True):
    display_order: int
    footprint: RepresentationAsset | None
    id: str
    is_default: bool
    label: str
    provenance: dict[str, Any]
    revision_id: str
    source_internal_part_number: str
    symbol: RepresentationAsset | None


class RepresentationAsset(TypedDict, total=True):
    asset_type: str
    id: str
    name: str
    preview_id: str
    sha256: str
    target_library: str
    target_name: str


class RepresentationChange(TypedDict, total=True):
    after: ComparedRepresentation | None
    before: ComparedRepresentation | None
    key: str
    status: str


class RequestTraceOut(TypedDict, total=True):
    audit: list[TracedAuditOut]
    events: list[TracedEventOut]
    jobs: list[TracedJobOut]
    requestId: str
    requests: list[TracedRequestOut]


class ResolvedPaths(TypedDict, total=False):
    """Fully resolved absolute paths."""
    design_outputs_dir: str | None
    documentation_dir: str | None
    jobset_path: str | None
    manufacturing_outputs_dir: str | None
    pcb: str | None
    project_root: str
    readme_path: str | None
    schematic: str | None
    subsheets_dir: str | None
    thumbnail_dir: str | None


class ResourceSlotOut(TypedDict, total=False):
    fence: int | None
    lease_expires_at: str | None
    lease_owner: str
    resource_name: str
    slot_number: int


class ResourceUsage(TypedDict, total=True):
    capacity: int
    free: int
    in_use: int
    resource: str


class ReviewDecision(TypedDict, total=True):
    acknowledged_models: list[str]
    actor: str
    build_id: str
    created_at: str
    decision: str
    dossier_digest: str
    id: str
    note: str
    project_id: str
    slot: str


class ReviewDecisionRequest(TypedDict, total=False):
    acknowledged_models: list[str]
    note: str
    slot: str


class ReviewGroupOut(TypedDict, total=False):
    changeIds: list[str]
    id: str
    impact: str
    kind: str
    references: list[str]
    section: str
    summary: str
    title: str


class RevisionComparison(TypedDict, total=True):
    after: ComparedRevision
    assetChanges: list[AssetChange]
    before: ComparedRevision
    componentId: str
    metadataChanges: list[MetadataChange]
    representationChanges: list[RepresentationChange]
    summary: RevisionComparisonSummary


class RevisionComparisonSummary(TypedDict, total=True):
    assetChanges: int
    metadataChanges: int
    representationChanges: int


class RevokeSessionsResponse(TypedDict, total=False):
    """How many sessions a revoke ended, and the account it targeted."""
    email: str | None
    revoked: int


class RoleAssignmentResponse(TypedDict, total=False):
    email: str
    has_password: bool
    role: str
    source: str


class RouteLatencyOut(TypedDict, total=True):
    routes: list[RouteLatencyRow]
    totals: LatencyTotals
    windowMinutes: int


class RouteLatencyRow(TypedDict, total=True):
    count: int
    estimatedTotalMs: float
    method: str
    overflow: bool
    p50Ms: float | None
    p95Ms: float | None
    p99Ms: float | None
    rate4xx: float
    rate5xx: float
    route: str
    status4xx: int
    status5xx: int


class RunRequest(TypedDict, total=False):
    commit_sha: str
    manufacturer_id: str | None
    notes: str
    project_id: str
    quantity_ordered: int
    release_tag: str
    spec_id: str | None
    spec_snapshot: dict[str, Any]


class RunStatusRequest(TypedDict, total=True):
    status: str


class RunUpdateRequest(TypedDict, total=False):
    commit_sha: str | None
    manufacturer_id: str | None
    notes: str | None
    quantity_good: int | None
    quantity_ordered: int | None


class SSHKeyResponse(TypedDict, total=False):
    comment: str | None
    created_at: str | None
    exists: bool
    fingerprint: str | None
    key_type: str | None
    public_key: str | None


class SaveImportDraftsRequest(TypedDict, total=False):
    drafts: dict[str, dict[str, Any]]


class SavedImportDrafts(TypedDict, total=True):
    saved: int


class ScanRequest(TypedDict, total=False):
    commit: str | None
    force: bool


class SemanticIndexGenerateQueued(TypedDict, total=True):
    """The bundle build that produces the index: queued, or already reusable."""
    job_id: str
    status: str


class SemanticIndexGenerateRequest(TypedDict, total=False):
    commit: str | None
    force: bool


class SemanticIndexGenerator(TypedDict, total=True):
    """The generator envelope the status route reports."""
    build: str
    cacheTag: str
    kicadMonkeyVersion: str
    name: str
    version: str


class SemanticIndexStatus(TypedDict, total=True):
    available: bool
    commit: str | None
    generator: SemanticIndexGenerator
    projectId: str
    schema: str
    sourceRevisionKey: str


class ServerFolderImportRequest(TypedDict, total=False):
    display_name: str
    root_name: str
    subpath: str


class ServiceClientDeleted(TypedDict, total=True):
    ok: bool


class ServiceClientList(TypedDict, total=True):
    items: list[ServiceClientOut]


class ServiceClientOut(TypedDict, total=True):
    client_id: str
    created_at: str
    enabled: bool
    last_used_at: str | None
    name: str
    role: str
    scopes: list[str]
    updated_at: str


class ServiceClientWithSecret(TypedDict, total=True):
    """A created or rotated client, whose secret is shown once."""
    client_id: str
    client_secret: str
    created_at: str
    enabled: bool
    last_used_at: str | None
    name: str
    role: str
    scopes: list[str]
    updated_at: str


class ServiceToken(TypedDict, total=True):
    """A client-credentials access token as the OAuth route returns it."""
    access_token: str
    expires_in: int
    scope: str
    token_type: str


class SetPasswordRequest(TypedDict, total=False):
    must_change: bool
    password: str


class SetServiceClientEnabledRequest(TypedDict, total=True):
    enabled: bool


class SetUserPasswordResponse(TypedDict, total=True):
    email: str
    must_change: bool
    sessions_revoked: int


class SheetPdf(TypedDict, total=True):
    media_type: str
    path: str
    released_digest: str


class SlowQueriesOut(TypedDict, total=False):
    available: bool
    order: str
    queries: list[SlowQueryOut]
    reason: str | None


class SlowQueryOut(TypedDict, total=True):
    calls: int
    maxMs: float
    meanMs: float
    query: str
    rows: int
    sharedBlksHit: int
    sharedBlksRead: int
    totalMs: float


class SourceDefaults(TypedDict, total=True):
    board: str
    bom_preset: str
    schematic: str
    variant: str


class SourceDefaultsRequest(TypedDict, total=False):
    board: str
    bom_preset: str
    schematic: str
    variant: str


class SourceDefaultsResponse(TypedDict, total=True):
    defaults: SourceDefaults


class SourceDiscovery(TypedDict, total=True):
    board: str
    boards: list[str]
    bom_presets: list[str]
    default_bom_preset: str
    project: str
    schematic: str
    schematics: list[str]
    variant: str
    variants: list[str]


class SourceResponse(TypedDict, total=True):
    forge: ForgeSummary
    ipc: IpcOptions
    source: SourceDiscovery


class SpecConfigRequest(TypedDict, total=False):
    spec_config: str


class StageRunOut(TypedDict, total=False):
    ended_at: str | None
    seconds: float | None
    stage: str
    started_at: str | None


class StartDesignCompareResponse(TypedDict, total=True):
    job_id: str


class StatusReadiness(TypedDict, total=True):
    available_assets: list[str]
    progress: int
    revision: str
    schema: str
    stage: str


class SubmitSetupRequest(TypedDict, total=True):
    analysis_id: str


class SubsheetFile(TypedDict, total=False):
    """One schematic below the root, with its text when the client asked for it."""
    content: str | None
    name: str
    url: str


class Subsheets(TypedDict, total=True):
    files: list[SubsheetFile]


class Supply(TypedDict, total=True):
    sources: list[SupplySource]


class SupplySource(TypedDict, total=True):
    display_name: str
    fetch_status: str
    fetched_at: str
    id: str
    kind: str
    mixed_fetch: bool
    mixed_freshness: bool
    mixed_status: bool
    mixed_units: bool
    stock: float
    stock_status: str
    uom: str


class SymbolImportResult(TypedDict, total=False):
    """``selection_required`` stops before writing; ``imported`` carries the component."""
    component: CatalogComponent | None
    discovered_symbols: list[str] | None
    mode: str
    selected_symbol: str | None


class SyncQueued(TypedDict, total=True):
    """The sync route adds how the queueing went, not just the id."""
    job_id: str
    message: str
    status: str


class TemplateRequest(TypedDict, total=False):
    capabilities: dict[str, Any]
    capability_config: str
    capability_meta: dict[str, Any]
    name: str
    spec_config: str


class TemplateUpdateRequest(TypedDict, total=False):
    capabilities: dict[str, Any] | None
    capability_config: str | None
    capability_meta: dict[str, Any] | None
    name: str | None
    spec_config: str | None


class ThreadPoolMetrics(TypedDict, total=True):
    borrowedTokens: int
    queueDepth: int
    totalTokens: int


class ThumbnailCleared(TypedDict, total=True):
    job_id: str | None
    message: str
    status: str
    thumbnail_source: str


class ThumbnailQueued(TypedDict, total=True):
    job_id: str
    message: str
    status: str


class ThumbnailUploaded(TypedDict, total=True):
    message: str
    status: str
    thumbnail_source: str


class ThumbnailsQueued(TypedDict, total=True):
    count: int
    job_ids: list[str]
    message: str
    status: str


class TokenExchangeResponse(TypedDict, total=True):
    access_token: str
    expires_in: int
    scope: str
    token_type: str


class TracedAuditOut(TypedDict, total=True):
    code: str | None
    durationMs: int
    outcome: str
    tool: str


class TracedEventOut(TypedDict, total=True):
    createdAt: str | None
    id: int
    kind: str
    projectId: str | None
    topic: str


class TracedJobOut(TypedDict, total=True):
    completedAt: str | None
    createdAt: str | None
    id: str
    kind: str
    startedAt: str | None
    status: str
    updatedAt: str | None


class TracedRequestOut(TypedDict, total=True):
    at: str | None
    authType: str
    clientId: str
    dbMs: int
    durationMs: int
    method: str
    nested: bool
    route: str
    status: int


class TrackerDestinationView(TypedDict, total=True):
    connectorId: str
    containerKind: str
    containerPath: str
    generation: int


class TrackerProjectionView(TypedDict, total=False):
    bodyAuthority: str | None
    destination: TrackerDestinationView | None
    externalId: str | None
    externalNumber: str | None
    externalUrl: str | None
    lastError: dict[str, Any] | None
    linkState: str | None
    notPromotableReason: str | None
    pausedReason: str | None
    pendingIntent: str | None
    promoteMinRole: str | None
    provider: str | None
    remoteState: Any
    remoteUpdatedAt: str | None
    syncState: str | None


class UnpinnedModel(TypedDict, total=True):
    key: str
    location: str
    reference: str
    source_path: str


class UpdateCommentRequest(TypedDict, total=False):
    commentClass: str | None
    content: str | None
    contentFormat: str | None
    mentions: list[str] | None
    severity: str | None
    status: str | None


class UpdateComponentMetadataRequest(TypedDict, total=False):
    category: str | None
    change_summary: str
    datasheet_url: str | None
    description: str | None
    extra_fields: dict[str, str] | None
    manufacturer: str | None
    mass_g: str | None
    mpn: str | None
    package_name: str | None
    power_dissipation_w: str | None
    rate: str | None
    rqjc_c_w: str | None
    rqjc_top_c_w: str | None
    sap_code: str | None
    temp_max_c: str | None
    temp_min_c: str | None
    value: str | None
    vendor: str | None
    vendor_part_number: str | None


class UpdateConnectorRequest(TypedDict, total=False):
    baseUrl: str | None
    credentials: ConnectorCredentials | None
    displayName: str | None
    instanceKind: str | None


class UpdateFolderRequest(TypedDict, total=False):
    name: str | None
    parent_id: str | None


class UpdateProjectTrackerRequest(TypedDict, total=False):
    autoMinSeverity: str | None
    autoTaskClass: bool | None
    connectorId: str
    destination: DestinationBody
    labels: LabelsBody | None
    promoteMinRole: str | None


class UpdateReplyRequest(TypedDict, total=False):
    content: str
    contentFormat: str | None


class UpdateRepresentationRequest(TypedDict, total=False):
    change_summary: str
    display_order: int | None
    footprint_asset_id: str | None
    is_default: bool | None
    label: str | None
    symbol_asset_id: str | None


class UpsertRoleRequest(TypedDict, total=True):
    role: str


class UserPasswordDeletedResponse(TypedDict, total=True):
    deleted: bool
    email: str


class UserSession(TypedDict, total=False):
    """User session data returned after successful login."""
    email: str
    must_change_password: bool
    name: str
    picture: str
    role: str


class ValidationAsset(TypedDict, total=True):
    asset_id: str
    asset_name: str
    asset_type: str
    latest_run: ValidationRun | None
    status: str
    target_library: str
    target_name: str


class ValidationError(TypedDict, total=False):
    ctx: dict[str, Any]
    input: Any
    loc: list[str | int]
    msg: str
    type: str


class ValidationFinding(TypedDict, total=True):
    created_at: str
    details: list[Any]
    id: str
    message: str
    object_name: str
    rule_code: str
    rule_url: str
    run_id: str
    severity: str


class ValidationRun(TypedDict, total=False):
    asset_id: str
    asset_type: str
    checker_type: str
    component_id: str
    created_at: str
    error_count: int
    exit_code: int | None
    findings: list[ValidationFinding] | None
    finished_at: str
    id: str
    inherited: bool
    inherited_from_revision_id: str
    reports: dict[str, str]
    revision_id: str
    status: str
    tool_version: str
    warning_count: int


class ValidationSummary(TypedDict, total=True):
    assets: list[ValidationAsset]
    enabled: bool
    error_count: int
    missing_required_assets: list[str]
    release_gate: str
    revision_id: str
    status: str
    warning_count: int


class VariantCatalogDiagnostic(TypedDict, total=False):
    """A catalog-builder diagnostic, in today's key order."""
    code: str | None
    detail: Any
    message: str | None
    path: str | None
    severity: str | None
    source: str | None


class VariantCatalogEntry(TypedDict, total=True):
    """One named design variant in the catalog order."""
    description: str | None
    name: str
    sources: list[str]


class VendorProfileList(TypedDict, total=True):
    profiles: list[VendorProfileOut]


class VendorProfileOut(TypedDict, total=True):
    description: str
    id: str
    pack_filename: str
    required_pack_artifacts: list[str]
    title: str


class VendorReadiness(TypedDict, total=True):
    missing_requirements: list[str]
    ready: bool
    required_artifacts: list[str]
    title: str
    vendor_id: str


class ViewerSupportFile(TypedDict, total=True):
    content: str
    filename: str


class ViewerSupportFiles(TypedDict, total=True):
    files: list[ViewerSupportFile]


class WebGpu3dAnalytic(TypedDict, total=False):
    asset_base: str
    assets: dict[str, str]
    cache_key: str | None
    readiness: DocumentReadiness
    schema: str


class WebGpu3dGenerateRequest(TypedDict, total=False):
    commit: str | None
    force: bool


class WebGpu3dGenerated(TypedDict, total=False):
    job_id: str | None


class WebGpu3dStatus(TypedDict, total=False):
    available: bool
    build_fingerprint: str
    bundle_url: str | None
    commit: str | None
    error: str | None
    generator: GeneratorTag
    job_id: str | None
    message: str | None
    readiness: StatusReadiness
    schema: str
    sourceRevisionKey: str
    source_fingerprint: str
    status: str


class WebhookAccepted(TypedDict, total=True):
    """What a stored delivery answers: the inbox row that now waits for the worker."""
    created: bool
    deliveryId: str
    event: str
    hintCount: int
    ok: bool


class WebhookCreate(TypedDict, total=False):
    eventKinds: list[str]
    projectIds: list[str] | None
    url: str


class WebhookDeliveryView(TypedDict, total=False):
    at: str
    durationMs: int | None
    error: str | None
    eventId: int | None
    id: int
    ok: bool
    statusCode: int | None


class WebhookHealth(TypedDict, total=False):
    attempts: int
    cursor: int
    deliveries_24h: DeliveryHealth
    event_kinds: list[str]
    failing_since: str | None
    host: str
    id: str
    lag: int
    last_error: str | None
    last_status: int | None
    next_attempt_at: str | None
    status: str


class WebhookSecret(TypedDict, total=True):
    """A rotated secret, shown once."""
    secret: str


class WebhookTestResult(TypedDict, total=False):
    durationMs: int
    error: str | None
    ok: bool
    statusCode: int | None


class WebhookUpdate(TypedDict, total=False):
    eventKinds: list[str] | None
    projectIds: list[str] | None
    status: str | None
    url: str | None


class WebhookView(TypedDict, total=False):
    """A registration as Settings shows it: no secret, no envelope."""
    attempts: int
    createdAt: str
    createdBy: str | None
    cursor: int
    eventKinds: list[str]
    failingSince: str | None
    id: str
    lastDeliveryAt: str | None
    lastError: str | None
    lastStatus: int | None
    nextAttemptAt: str | None
    projectIds: list[str] | None
    status: str
    url: str


class WorkerInfo(TypedDict, total=False):
    concurrency: int | None
    host: str | None
    last_seen_at: str | None
    memory_budget_mib: int | None
    pid: int | None
    pool: str
    running_jobs: list[dict[str, Any]]
    stale: bool
    started_at: str | None
    worker_id: str


class WorkflowQueued(TypedDict, total=True):
    job_id: str


class WorkflowRequest(TypedDict, total=False):
    author: str | None
    force: bool
    type: str


class WorkflowStageCount(TypedDict, total=True):
    count: int
    workflow_stage: str


class WorkflowSummary(TypedDict, total=True):
    stages: list[WorkflowStageCount]


class WorkspaceBootstrap(TypedDict, total=True):
    """Everything the workspace needs to paint before its first refresh."""
    folders: list[FolderNode]
    projects: list[Project]
    systems: list[dict[str, Any]]
    version: int


class app__api__catalog_admin_models__JobEvent(TypedDict, total=True):
    created_at: str
    details: dict[str, Any]
    event_type: str
    id: int
    percent: float | None
    stage: str


class app__api__fabrication_view__PlacementView(TypedDict, total=True):
    """The parts of a folder's position files, checked against its BOM."""
    counts: PlacementCounts
    files: PlacementFiles
    hasBom: bool
    missing: list[PlacementMissingPart]
    parts: list[PlacementPart]
    present: bool
    warnings: list[str]


class app__api__fabrication_view_models__PlacementView(TypedDict, total=True):
    counts: PlacementCounts
    files: PlacementFiles
    hasBom: bool
    missing: list[MissingPart]
    parts: list[PlacedPart]
    present: bool
    warnings: list[str]


class app__api__jobs__JobEvent(TypedDict, total=True):
    created_at: str
    details: dict[str, Any]
    event_type: str
    id: int
    percent: float | None
    stage: str | None


class GeneratedClient:
    """One method per operation in the /api/v1 OpenAPI document."""

    def about(self) -> dict[str, str]:
        """About"""
        return self._request(
            "GET",
            "/api/v1/health/about",
        )

    def accept_project_import_proposal(self, proposal_id: str, *, body: dict[str, Any] | None = None) -> ImportProposalAcceptance:
        """Accept an import proposal"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-proposals/{proposal_id}/accept",
            path_params={"proposal_id": proposal_id},
            body=body,
        )

    def acknowledge_project_tracker(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Acknowledge Project Tracker"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/tracker/acknowledge",
            path_params={"project_id": project_id},
            body=body,
        )

    def add_comment_reaction(self, project_id: str, comment_id: str, reaction: str, *, replyId: str | None = None) -> CommentView:
        """Add a reaction to a comment or reply"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/comments/{comment_id}/reactions/{reaction}",
            path_params={"project_id": project_id, "comment_id": comment_id, "reaction": reaction},
            query={"replyId": replyId},
        )

    def add_mate(self, component_id: str, *, body: dict[str, Any] | None = None) -> MatePage:
        """Mark two parts as mating"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/mates-with",
            path_params={"component_id": component_id},
            body=body,
        )

    def add_reply(self, project_id: str, comment_id: str, *, body: dict[str, Any] | None = None) -> ReplyCreatedView:
        """Reply to an existing comment"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/replies",
            path_params={"project_id": project_id, "comment_id": comment_id},
            body=body,
        )

    def admin_revoke_identity(self, connector_id: str, user_id: str) -> dict[str, Any]:
        """Admin Revoke Identity"""
        return self._request(
            "POST",
            "/api/v1/admin/trackers/connectors/{connector_id}/identities/{user_id}/revoke",
            path_params={"connector_id": connector_id, "user_id": user_id},
        )

    def agent_token(self) -> TokenExchangeResponse:
        """Token"""
        return self._request(
            "POST",
            "/api/v1/agent/token",
        )

    def analyze_repository(self, *, body: dict[str, Any] | None = None) -> JobStarted:
        """Start analyzing a repository for import"""
        return self._request(
            "POST",
            "/api/v1/projects/analyze",
            body=body,
        )

    def append_design_compare_debug_log(self, project_id: str, *, body: dict[str, Any] | None = None) -> DesignCompareDebugLogResponse:
        """Append one comparison-view transition event to the debug log"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/design-compare/debug-log",
            path_params={"project_id": project_id},
            body=body,
        )

    def apply_metadata_batch(self, batch_id: str, *, body: dict[str, Any] | None = None) -> MetadataBatchStarted:
        """Apply a metadata batch"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/batches/{batch_id}/apply",
            path_params={"batch_id": batch_id},
            body=body,
        )

    def apply_template(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Apply Template"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/projects/{project_id}/spec-config/apply-template",
            path_params={"project_id": project_id},
            body=body,
        )

    def apply_template_to_spec(self, spec_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Apply Template To Spec"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/specs/{spec_id}/apply-template",
            path_params={"spec_id": spec_id},
            body=body,
        )

    def approve_build(self, project_id: str, build_id: str, *, body: dict[str, Any] | None = None) -> ApprovalDecision:
        """Record a designer or QA approval on a build"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/approvals",
            path_params={"project_id": project_id, "build_id": build_id},
            body=body,
        )

    def approve_metadata_batch_fields(self, batch_id: str) -> MetadataBatch:
        """Approve a batch's proposed fields"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/batches/{batch_id}/approve-fields",
            path_params={"batch_id": batch_id},
        )

    def archive_metadata_field(self, field_id: str) -> MetadataField:
        """Archive a metadata field"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/fields/{field_id}/archive",
            path_params={"field_id": field_id},
        )

    def attach_manufacturer(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Attach Manufacturer"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/projects/{project_id}/manufacturers",
            path_params={"project_id": project_id},
            body=body,
        )

    def begin_oauth(self, connector_id: str, *, returnTo: str = '/') -> OAuthBeginResponse:
        """Begin Oauth"""
        return self._request(
            "POST",
            "/api/v1/trackers/connectors/{connector_id}/oauth/begin",
            path_params={"connector_id": connector_id},
            query={"returnTo": returnTo},
        )

    def benchmark_metrics(self, *, since: str = '') -> BenchmarkMetrics:
        """Queue latency and job write-rate metrics"""
        return self._request(
            "GET",
            "/api/v1/jobs/benchmark-metrics",
            query={"since": since},
        )

    def browse_library_assets(self, *, asset_type: str, q: str = '', limit: int = 50) -> AssetBrowseResult:
        """Browse stored library assets"""
        return self._request(
            "GET",
            "/api/v1/catalog/assets/browse",
            query={"asset_type": asset_type, "q": q, "limit": limit},
        )

    def bulk_accept_project_import_proposals(self, session_id: str, *, body: dict[str, Any] | None = None) -> BulkImportAcceptance:
        """Accept several import proposals"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-sessions/{session_id}/proposals/bulk-accept",
            path_params={"session_id": session_id},
            body=body,
        )

    def cache_stats(self, *, window_minutes: int = 60) -> CacheStats:
        """Cache hit rates, table sizes and bounded on-disk sizes"""
        return self._request(
            "GET",
            "/api/v1/ops/caches",
            query={"window_minutes": window_minutes},
        )

    def cancel_job(self, job_id: str) -> JobCancelRequested:
        """Ask a job to cancel"""
        return self._request(
            "POST",
            "/api/v1/jobs/{job_id}/cancel",
            path_params={"job_id": job_id},
        )

    def capture_profile(self, *, body: dict[str, Any] | None = None) -> OpsProfile:
        """Take a bounded sampling profile"""
        return self._request(
            "POST",
            "/api/v1/ops/profiles",
            body=body,
        )

    def catalog_health(self, *, check_files: bool = False) -> CatalogHealth:
        """Report catalog health"""
        return self._request(
            "GET",
            "/api/v1/catalog/health",
            query={"check_files": check_files},
        )

    def change_own_password(self, *, body: dict[str, Any] | None = None) -> AuthSuccessResponse:
        """Change the signed-in user's local password"""
        return self._request(
            "POST",
            "/api/v1/auth/password/change",
            body=body,
        )

    def check_git_access(self, *, body: dict[str, Any] | None = None) -> GitAccessCheckResponse:
        """Check whether Prism may read one repository right now"""
        return self._request(
            "POST",
            "/api/v1/settings/git-access/check",
            body=body,
        )

    def check_release_tag(self, project_id: str, tag: str) -> ReleaseTagCheck:
        """Whether the forge already has a release tag"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/tags/{tag}",
            path_params={"project_id": project_id, "tag": tag},
        )

    def clear_project_thumbnail(self, project_id: str) -> ThumbnailCleared:
        """Drop an uploaded thumbnail and fall back to the rendered board"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}/thumbnail",
            path_params={"project_id": project_id},
        )

    def compare_component_revisions(self, component_id: str, *, before: str, after: str) -> RevisionComparison:
        """Compare component revisions"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/revisions/compare",
            path_params={"component_id": component_id},
            query={"before": before, "after": after},
        )

    def complete_folder_snapshot(self, snapshot_id: str, *, body: dict[str, Any] | None = None) -> ImportSessionCreated:
        """Complete a folder snapshot and start its import"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-snapshots/folders/{snapshot_id}/complete",
            path_params={"snapshot_id": snapshot_id},
            body=body,
        )

    def components_by_category(self, *, category: str, page: int = 1, page_size: int = 50, include_total: bool = False) -> ComponentPage:
        """List the released components in one category"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/components-by-category",
            query={"category": category, "page": page, "page_size": page_size, "include_total": include_total},
        )

    def config(self) -> dict[str, bool]:
        """Config"""
        return self._request(
            "GET",
            "/api/v1/agent/config",
        )

    def connector_health(self, connector_id: str) -> dict[str, Any]:
        """Connector Health"""
        return self._request(
            "GET",
            "/api/v1/admin/trackers/connectors/{connector_id}/health",
            path_params={"connector_id": connector_id},
        )

    def convert_models(self, component_id: str, *, revisionId: str | None = None) -> ModelConversionJob:
        """Queue STEP to GLB conversion"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/models/convert",
            path_params={"component_id": component_id},
            query={"revisionId": revisionId},
        )

    def create_anchored_comment(self, project_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Create a comment anchored by design identity"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/anchored",
            path_params={"project_id": project_id},
            body=body,
        )

    def create_candidate(self, project_id: str, *, body: dict[str, Any] | None = None) -> CandidateCreated:
        """Queue a release build (idempotent on the candidate's build key)"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/release-studio/candidates",
            path_params={"project_id": project_id},
            body=body,
        )

    def create_catalog_component(self, *, body: dict[str, Any] | None = None) -> CatalogComponent:
        """Create a catalog component"""
        return self._request(
            "POST",
            "/api/v1/catalog/components",
            body=body,
        )

    def create_comment(self, project_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Create a comment on the design"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments",
            path_params={"project_id": project_id},
            body=body,
        )

    def create_comparison_comment(self, project_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Create a comparison, file, group or item discussion"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comparison-comments",
            path_params={"project_id": project_id},
            body=body,
        )

    def create_component_representation(self, component_id: str, *, body: dict[str, Any] | None = None) -> CatalogComponent:
        """Add a component representation"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/representations",
            path_params={"component_id": component_id},
            body=body,
        )

    def create_connector(self, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create Connector"""
        return self._request(
            "POST",
            "/api/v1/admin/trackers/connectors",
            body=body,
        )

    def create_folder(self, *, body: dict[str, Any] | None = None) -> FolderRecord:
        """Create a folder"""
        return self._request(
            "POST",
            "/api/v1/folders/",
            body=body,
        )

    def create_folder_snapshot(self, *, body: dict[str, Any] | None = None) -> FolderSnapshot:
        """Create a folder import snapshot"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-snapshots/folders",
            body=body,
        )

    def create_manufacturer(self, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create Manufacturer"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/manufacturers",
            body=body,
        )

    def create_metadata_batch(self, *, body: dict[str, Any] | None = None) -> MetadataBatch:
        """Stage a metadata batch"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/batches",
            body=body,
        )

    def create_metadata_field(self, *, body: dict[str, Any] | None = None) -> MetadataField:
        """Create a metadata field"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/fields",
            body=body,
        )

    def create_personal_token(self, *, body: dict[str, Any] | None = None) -> CreatedPersonalToken:
        """Create Personal Token"""
        return self._request(
            "POST",
            "/api/v1/auth/tokens",
            body=body,
        )

    def create_project_import_session(self, *, body: dict[str, Any] | None = None) -> ImportSessionCreated:
        """Start a project component import"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-sessions/projects",
            body=body,
        )

    def create_project_spec(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create Project Spec"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/projects/{project_id}/specs",
            path_params={"project_id": project_id},
            body=body,
        )

    def create_run(self, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create Run"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/runs",
            body=body,
        )

    def create_server_folder_snapshot(self, *, body: dict[str, Any] | None = None) -> ImportSessionCreated:
        """Import a server folder"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-snapshots/folders/server",
            body=body,
        )

    def create_service_client(self, *, body: dict[str, Any] | None = None) -> ServiceClientWithSecret:
        """Create a machine client and show its secret once"""
        return self._request(
            "POST",
            "/api/v1/admin/service-clients",
            body=body,
        )

    def create_template(self, mfr_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create Template"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/manufacturers/{mfr_id}/templates",
            path_params={"mfr_id": mfr_id},
            body=body,
        )

    def create_webhook(self, *, body: dict[str, Any] | None = None) -> CreatedWebhook:
        """Create an outbound webhook"""
        return self._request(
            "POST",
            "/api/v1/settings/webhooks",
            body=body,
        )

    def delete_access_user(self, email: str) -> AccessUserDeletedResponse:
        """Withdraw an account's role and end its sessions"""
        return self._request(
            "DELETE",
            "/api/v1/settings/access/users/{email}",
            path_params={"email": email},
        )

    def delete_catalog_component(self, component_id: str) -> ComponentDeleteResult:
        """Delete a catalog component"""
        return self._request(
            "DELETE",
            "/api/v1/catalog/components/{component_id}",
            path_params={"component_id": component_id},
        )

    def delete_comment(self, project_id: str, comment_id: str) -> DeletedCommentView:
        """Delete a comment"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}/comments/{comment_id}",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def delete_component_representation(self, component_id: str, representation_id: str) -> CatalogComponent:
        """Delete a component representation"""
        return self._request(
            "DELETE",
            "/api/v1/catalog/components/{component_id}/representations/{representation_id}",
            path_params={"component_id": component_id, "representation_id": representation_id},
        )

    def delete_connector(self, connector_id: str) -> dict[str, Any]:
        """Delete Connector"""
        return self._request(
            "DELETE",
            "/api/v1/admin/trackers/connectors/{connector_id}",
            path_params={"connector_id": connector_id},
        )

    def delete_defect(self, defect_id: str) -> dict[str, Any]:
        """Delete Defect"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/defects/{defect_id}",
            path_params={"defect_id": defect_id},
        )

    def delete_design_compare(self, project_id: str, job_id: str) -> DeleteDesignCompareResponse:
        """Cancel a comparison or forget its finished result"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}/design-compare/{job_id}",
            path_params={"project_id": project_id, "job_id": job_id},
        )

    def delete_evidence(self, defect_id: str, digest: str) -> dict[str, Any]:
        """Delete Evidence"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/defects/{defect_id}/evidence/{digest}",
            path_params={"defect_id": defect_id, "digest": digest},
        )

    def delete_folder(self, folder_id: str, *, cascade: bool = True) -> FolderDeleted:
        """Delete a folder"""
        return self._request(
            "DELETE",
            "/api/v1/folders/{folder_id}",
            path_params={"folder_id": folder_id},
            query={"cascade": cascade},
        )

    def delete_manufacturer(self, mfr_id: str) -> dict[str, Any]:
        """Delete Manufacturer"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/manufacturers/{mfr_id}",
            path_params={"mfr_id": mfr_id},
        )

    def delete_project_endpoint(self, project_id: str) -> ProjectDeleted:
        """Delete a project and, where Prism owns them, its files"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}",
            path_params={"project_id": project_id},
        )

    def delete_project_import_session(self, session_id: str) -> None:
        """Delete Project Import Session"""
        return self._request(
            "DELETE",
            "/api/v1/catalog/import-sessions/{session_id}",
            path_params={"session_id": session_id},
        )

    def delete_project_spec(self, spec_id: str) -> dict[str, Any]:
        """Delete Project Spec"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/specs/{spec_id}",
            path_params={"spec_id": spec_id},
        )

    def delete_reply(self, project_id: str, comment_id: str, reply_id: str) -> CommentView:
        """Delete a reply"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}/comments/{comment_id}/replies/{reply_id}",
            path_params={"project_id": project_id, "comment_id": comment_id, "reply_id": reply_id},
        )

    def delete_run(self, run_id: str) -> dict[str, Any]:
        """Delete Run"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/runs/{run_id}",
            path_params={"run_id": run_id},
        )

    def delete_service_client(self, client_id: str) -> ServiceClientDeleted:
        """Delete a machine client"""
        return self._request(
            "DELETE",
            "/api/v1/admin/service-clients/{client_id}",
            path_params={"client_id": client_id},
        )

    def delete_setup(self, project_id: str, setup_id: str) -> None:
        """Delete Setup"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}",
            path_params={"project_id": project_id, "setup_id": setup_id},
        )

    def delete_template(self, template_id: str) -> dict[str, Any]:
        """Delete Template"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/templates/{template_id}",
            path_params={"template_id": template_id},
        )

    def delete_user_password(self, email: str) -> UserPasswordDeletedResponse:
        """Remove a user's local password"""
        return self._request(
            "DELETE",
            "/api/v1/settings/access/users/{email}/password",
            path_params={"email": email},
        )

    def delete_webhook(self, webhook_id: str) -> None:
        """Delete Webhook"""
        return self._request(
            "DELETE",
            "/api/v1/settings/webhooks/{webhook_id}",
            path_params={"webhook_id": webhook_id},
        )

    def design_compare_result(self, project_id: str, job_id: str) -> DesignCompareResult:
        """Read a comparison's result"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design-compare/{job_id}",
            path_params={"project_id": project_id, "job_id": job_id},
        )

    def design_compare_sidecar(self, project_id: str, job_id: str, digest: str) -> Any:
        """Download one comparison sidecar"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design-compare/{job_id}/sidecars/{digest}",
            path_params={"project_id": project_id, "job_id": job_id, "digest": digest},
        )

    def detach_component_asset(self, component_id: str, asset_type: str) -> ComponentMutation:
        """Detach an auxiliary asset from a component"""
        return self._request(
            "DELETE",
            "/api/v1/catalog/components/{component_id}/assets/{asset_type}",
            path_params={"component_id": component_id, "asset_type": asset_type},
        )

    def detach_component_asset_by_id(self, component_id: str, asset_id: str) -> ComponentMutation:
        """Detach an asset from a component by id"""
        return self._request(
            "DELETE",
            "/api/v1/catalog/components/{component_id}/assets/id/{asset_id}",
            path_params={"component_id": component_id, "asset_id": asset_id},
        )

    def detach_manufacturer(self, project_id: str, mfr_id: str) -> dict[str, Any]:
        """Detach Manufacturer"""
        return self._request(
            "DELETE",
            "/api/v1/manufacturing/projects/{project_id}/manufacturers/{mfr_id}",
            path_params={"project_id": project_id, "mfr_id": mfr_id},
        )

    def detect_project_paths(self, project_id: str) -> DetectedPaths:
        """Auto-detect a project's paths without saving them"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/detect-paths",
            path_params={"project_id": project_id},
        )

    def discover_folder_snapshot(self, snapshot_id: str, *, body: dict[str, Any] | None = None) -> FolderDiscovery:
        """Discover components in a folder snapshot"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-snapshots/folders/{snapshot_id}/discover",
            path_params={"snapshot_id": snapshot_id},
            body=body,
        )

    def download_asset(self, asset_id: str, *, rev: str, representation: str = '', exp: int, sig: str) -> Any:
        """Download one signed asset for placement"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/assets/{asset_id}",
            path_params={"asset_id": asset_id},
            query={"rev": rev, "representation": representation, "exp": exp, "sig": sig},
        )

    def download_build_evidence(self, project_id: str, build_id: str) -> Any:
        """Download a build's captured evidence archive"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/build-evidence",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def download_build_log(self, project_id: str, build_id: str, step_id: str) -> Any:
        """Serve one build step's full log"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/logs/{step_id}",
            path_params={"project_id": project_id, "build_id": build_id, "step_id": step_id},
        )

    def download_build_vendor_pack(self, project_id: str, build_id: str, vendor_id: str) -> Any:
        """Download one vendor pack for a build"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/vendor-packs/{vendor_id}",
            path_params={"project_id": project_id, "build_id": build_id, "vendor_id": vendor_id},
        )

    def download_dossier(self, project_id: str, build_id: str) -> Any:
        """Download a build's dossier archive"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/dossier",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def download_file(self, project_id: str, *, path: str, type: str = 'design', inline: bool = False, commit: str | None = None) -> Any:
        """Download one file from the project's output folders"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/download",
            path_params={"project_id": project_id},
            query={"path": path, "type": type, "inline": inline, "commit": commit},
        )

    def download_member(self, project_id: str, build_id: str, member_path: str, *, disposition: str = 'inline') -> Any:
        """Serve one released member out of the dossier, digest-checked"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/members/{member_path}",
            path_params={"project_id": project_id, "build_id": build_id, "member_path": member_path},
            query={"disposition": disposition},
        )

    def download_preview(self, preview_id: str) -> Any:
        """Download a rendered symbol or footprint preview"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/previews/{preview_id}",
            path_params={"preview_id": preview_id},
        )

    def download_run_report(self, run_id: str) -> Any:
        """Download Run Report"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/runs/{run_id}/report.pdf",
            path_params={"run_id": run_id},
        )

    def download_spec_sheet(self, project_id: str, *, spec_id: str | None = None) -> Any:
        """Download Spec Sheet"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/projects/{project_id}/spec-sheet.pdf",
            path_params={"project_id": project_id},
            query={"spec_id": spec_id},
        )

    def draft_setup(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Draft Setup"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/sim/a0/setups",
            path_params={"project_id": project_id},
            body=body,
        )

    def event_and_webhook_health(self) -> EventAndWebhookHealth:
        """Event-log head, retention and webhook lag and delivery health"""
        return self._request(
            "GET",
            "/api/v1/ops/event-health",
        )

    def export_import_proposals_csv(self, session_id: str) -> Any:
        """Export import proposals as CSV"""
        return self._request(
            "GET",
            "/api/v1/catalog/import-sessions/{session_id}/proposals.csv",
            path_params={"session_id": session_id},
        )

    def export_inventory_csv(self) -> Any:
        """Export the component inventory as CSV"""
        return self._request(
            "GET",
            "/api/v1/catalog/inventory/export.csv",
        )

    def export_kicad_dbl_bundle(self) -> KicadDblBundle:
        """Export a KiCad database library bundle"""
        return self._request(
            "POST",
            "/api/v1/catalog/exports/kicad-dbl",
        )

    def export_metadata_csv(self, *, field: list[str] | None = None) -> Any:
        """Export component metadata as CSV"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/export.csv",
            query={"field": field},
        )

    def extract_board_spec(self, project_id: str) -> dict[str, Any]:
        """Extract Board Spec"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/projects/{project_id}/board-spec/extract",
            path_params={"project_id": project_id},
        )

    def extract_pcb_rules(self, project_id: str) -> dict[str, Any]:
        """Extract Pcb Rules"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/projects/{project_id}/pcb-rules/extract",
            path_params={"project_id": project_id},
        )

    def forget_git_host_key(self, host: str) -> HostKeyForgetResponse:
        """Forget a pinned Git host key"""
        return self._request(
            "DELETE",
            "/api/v1/settings/git-access/host-keys/{host}",
            path_params={"host": host},
        )

    def generate_missing_previews(self) -> CatalogJobQueued:
        """Generate missing component previews"""
        return self._request(
            "POST",
            "/api/v1/catalog/previews/generate-missing",
        )

    def generate_semantic_index(self, project_id: str, *, body: dict[str, Any] | None = None) -> SemanticIndexGenerateQueued:
        """Queue the bundle build that generates the revision's semantic index"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/semantic-index/generate",
            path_params={"project_id": project_id},
            body=body,
        )

    def generate_ssh_key(self, *, body: dict[str, Any] | None = None) -> GenerateSSHKeyResponse:
        """Generate a new workspace SSH key"""
        return self._request(
            "POST",
            "/api/v1/settings/ssh-key/generate",
            body=body,
        )

    def generate_webgpu_3d(self, project_id: str, *, body: dict[str, Any] | None = None) -> WebGpu3dGenerated:
        """Queue the revision's design bundle, optionally rebuilding it"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/webgpu-3d/generate",
            path_params={"project_id": project_id},
            body=body,
        )

    def get_asset_content(self, asset_id: str) -> Any:
        """Serve an asset's stored library file to the panel"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/assets/{asset_id}/content",
            path_params={"asset_id": asset_id},
        )

    def get_auth_config(self) -> AuthConfig:
        """Get Auth Config"""
        return self._request(
            "GET",
            "/api/v1/auth/config",
        )

    def get_board_spec(self, project_id: str) -> dict[str, Any] | None:
        """Get Board Spec"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/projects/{project_id}/board-spec",
            path_params={"project_id": project_id},
        )

    def get_build(self, project_id: str, build_id: str) -> BuildDetail:
        """A build with its configuration, readiness and sign-offs"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def get_build_placement(self, project_id: str, build_id: str) -> app__api__fabrication_view_models__PlacementView:
        """Pick-and-place parts of a build, checked against its BOM"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/placement",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def get_bundle_build_profile(self, project_id: str, *, commit: str | None = None, job_id: str | None = None) -> BundleBuildProfileOut:
        """A design bundle build's per-invocation and per-KiCad-step profile"""
        return self._request(
            "GET",
            "/api/v1/ops/projects/{project_id}/bundle-profile",
            path_params={"project_id": project_id},
            query={"commit": commit, "job_id": job_id},
        )

    def get_candidate(self, project_id: str, candidate_id: str) -> CandidateWithBuilds:
        """Read one release candidate with its build attempts"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/candidates/{candidate_id}",
            path_params={"project_id": project_id, "candidate_id": candidate_id},
        )

    def get_catalog_asset_content(self, asset_id: str) -> Any:
        """Read a catalog asset file"""
        return self._request(
            "GET",
            "/api/v1/catalog/assets/{asset_id}/content",
            path_params={"asset_id": asset_id},
        )

    def get_catalog_component(self, component_id: str, *, representation: str = '') -> CatalogComponent:
        """Read a catalog component"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}",
            path_params={"component_id": component_id},
            query={"representation": representation},
        )

    def get_catalog_job(self, job_id: str) -> CatalogJobWithEvents:
        """Read a catalog job"""
        return self._request(
            "GET",
            "/api/v1/catalog/jobs/{job_id}",
            path_params={"job_id": job_id},
        )

    def get_catalog_preview(self, preview_id: str) -> Any:
        """Read a catalog preview"""
        return self._request(
            "GET",
            "/api/v1/catalog/previews/{preview_id}",
            path_params={"preview_id": preview_id},
        )

    def get_catalog_usage(self, project_id: str, *, commit: str | None = None) -> dict[str, Any]:
        """Get Catalog Usage"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/catalog-usage",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_comment_attachment(self, project_id: str, attachment_id: str) -> Any:
        """Download a comment attachment"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comment-attachments/{attachment_id}",
            path_params={"project_id": project_id, "attachment_id": attachment_id},
        )

    def get_comment_changes(self, project_id: str, *, after: int = 0) -> CommentChangesPage:
        """Replay a project's comment changes after a cursor"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/changes",
            path_params={"project_id": project_id},
            query={"after": after},
        )

    def get_comment_history(self, project_id: str, comment_id: str) -> list[CommentHistoryEntry]:
        """List a comment's revisions"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/{comment_id}/history",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def get_comment_thread(self, project_id: str, comment_id: str, *, revision: str | None = None) -> CommentThreadView:
        """Get one comment thread for a live refresh"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/{comment_id}/thread",
            path_params={"project_id": project_id, "comment_id": comment_id},
            query={"revision": revision},
        )

    def get_comments(self, project_id: str, *, revision: str | None = None) -> CommentsListing:
        """List a project's comment threads"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments",
            path_params={"project_id": project_id},
            query={"revision": revision},
        )

    def get_comparison_comments(self, project_id: str, *, base: str, compare: str, domain: str | None = None) -> CommentsListing:
        """List a comparison's discussion threads"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comparison-comments",
            path_params={"project_id": project_id},
            query={"base": base, "compare": compare, "domain": domain},
        )

    def get_comparison_discussion_report(self, project_id: str, *, base: str, compare: str, domain: str | None = None) -> Any:
        """Download a comparison's discussion report"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comparison-comments/report",
            path_params={"project_id": project_id},
            query={"base": base, "compare": compare, "domain": domain},
        )

    def get_comparison_review(self, project_id: str, job_id: str, *, domain: str) -> ComparisonReviewOut:
        """Get Comparison Review"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design-compare/{job_id}/review",
            path_params={"project_id": project_id, "job_id": job_id},
            query={"domain": domain},
        )

    def get_component(self, component_id: str, *, representation: str = '', revision: str = '') -> ComponentDetail:
        """The released component, with the revisions placement may serve"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/components/{component_id}",
            path_params={"component_id": component_id},
            query={"representation": representation, "revision": revision},
        )

    def get_component_revision(self, component_id: str, revision_id: str) -> CatalogComponent:
        """Read a component revision"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/revisions/{revision_id}",
            path_params={"component_id": component_id, "revision_id": revision_id},
        )

    def get_component_validation(self, component_id: str) -> ComponentValidation:
        """Read a component's validation"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/validation",
            path_params={"component_id": component_id},
        )

    def get_connector(self, connector_id: str) -> dict[str, Any]:
        """Get Connector"""
        return self._request(
            "GET",
            "/api/v1/admin/trackers/connectors/{connector_id}",
            path_params={"connector_id": connector_id},
        )

    def get_current_session_user(self) -> UserSession:
        """Get Current Session User"""
        return self._request(
            "GET",
            "/api/v1/auth/me",
        )

    def get_design_bundles(self, project_id: str) -> DesignBundleStatus:
        """The project's design-bundle counts, aliases and stored size"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design-bundles",
            path_params={"project_id": project_id},
        )

    def get_design_component(self, project_id: str, ref: str, *, revision: str | None = None) -> DesignComponentOut:
        """Get Design Component"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design/components/{ref}",
            path_params={"project_id": project_id, "ref": ref},
            query={"revision": revision},
        )

    def get_design_net(self, project_id: str, name: str, *, revision: str | None = None) -> DesignNetOut:
        """Get Design Net"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design/nets/{name}",
            path_params={"project_id": project_id, "name": name},
            query={"revision": revision},
        )

    def get_doc_file_content(self, project_id: str, *, path: str, commit: str | None = None) -> DocFileContent:
        """Read one documentation file"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/docs/content",
            path_params={"project_id": project_id},
            query={"path": path, "commit": commit},
        )

    def get_docs_files(self, project_id: str, *, commit: str | None = None) -> list[FileItem]:
        """List the documentation folder"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/docs",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_evidence(self, run_id: str, digest: str) -> Any:
        """Get Evidence"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/runs/{run_id}/evidence/{digest}",
            path_params={"run_id": run_id, "digest": digest},
        )

    def get_fabrication_layer(self, project_id: str, build_id: str, layer_id: str) -> Any:
        """One layer of a build's fabrication package as SVG"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/fabrication-view/layers/{layer_id}.svg",
            path_params={"project_id": project_id, "build_id": build_id, "layer_id": layer_id},
        )

    def get_fabrication_view(self, project_id: str, build_id: str) -> FabricationView:
        """Layers, board size and drill tools of a build's fabrication package"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/fabrication-view",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def get_folder_contents(self, *, folder_id: str | None = None) -> FolderContents:
        """Folders and projects directly inside one folder"""
        return self._request(
            "GET",
            "/api/v1/folders/contents",
            query={"folder_id": folder_id},
        )

    def get_folder_tree(self) -> list[FolderNode]:
        """The folder tree the workspace renders"""
        return self._request(
            "GET",
            "/api/v1/folders/tree",
        )

    def get_git_access(self) -> GitAccessResponse:
        """Read the workspace key, pinned hosts and repository access state"""
        return self._request(
            "GET",
            "/api/v1/settings/git-access",
        )

    def get_inline_component(self, component_id: str, *, representation: str = '', revision: str = '') -> InlineBundle:
        """The component's library files in KiCad's inline bundle"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/components/{component_id}/inline",
            path_params={"component_id": component_id},
            query={"representation": representation, "revision": revision},
        )

    def get_job(self, job_id: str) -> JobStatus:
        """One job's status"""
        return self._request(
            "GET",
            "/api/v1/jobs/{job_id}",
            path_params={"job_id": job_id},
        )

    def get_job_artifact(self, job_id: str) -> Any:
        """Download a completed job's artifact"""
        return self._request(
            "GET",
            "/api/v1/jobs/{job_id}/artifact",
            path_params={"job_id": job_id},
        )

    def get_job_events(self, job_id: str, *, after: int = 0, limit: int = 200) -> JobEvents:
        """A job's progress events after a given id"""
        return self._request(
            "GET",
            "/api/v1/jobs/{job_id}/events",
            path_params={"job_id": job_id},
            query={"after": after, "limit": limit},
        )

    def get_job_logs(self, job_id: str, *, tail: int = 200) -> JobLogs:
        """The tail of a job's log"""
        return self._request(
            "GET",
            "/api/v1/jobs/{job_id}/logs",
            path_params={"job_id": job_id},
            query={"tail": tail},
        )

    def get_job_timeline(self, job_id: str, *, log_lines: int = 50) -> JobTimelineOut:
        """A job's queue wait, claim attempts, stage durations and redacted log tail"""
        return self._request(
            "GET",
            "/api/v1/ops/jobs/{job_id}/timeline",
            path_params={"job_id": job_id},
            query={"log_lines": log_lines},
        )

    def get_mcp_governance(self) -> McpGovernanceView:
        """Get Mcp Governance"""
        return self._request(
            "GET",
            "/api/v1/settings/mcp",
        )

    def get_metadata_batch(self, batch_id: str) -> MetadataBatch:
        """Read a metadata batch"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/batches/{batch_id}",
            path_params={"batch_id": batch_id},
        )

    def get_metadata_grid_preferences(self) -> MetadataGridPreferences:
        """Read metadata grid preferences"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/grid-preferences",
        )

    def get_metadata_job(self, job_id: str) -> CatalogJob:
        """Read a metadata job"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/jobs/{job_id}",
            path_params={"job_id": job_id},
        )

    def get_monorepo_structure(self, repo_name: str, *, subpath: str = '') -> MonorepoStructure:
        """Folders and projects under one monorepo path"""
        return self._request(
            "GET",
            "/api/v1/projects/monorepos/{repo_name}/structure",
            path_params={"repo_name": repo_name},
            query={"subpath": subpath},
        )

    def get_oauth_callback_url(self) -> dict[str, str]:
        """Get Oauth Callback Url"""
        return self._request(
            "GET",
            "/api/v1/admin/trackers/oauth-callback-url",
        )

    def get_output_fabrication_layer(self, project_id: str, layer_id: str, *, type: str = 'manufacturing', folder: str = '', commit: str | None = None) -> Any:
        """One layer of an output folder's package as SVG"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/fabrication-view/layers/{layer_id}.svg",
            path_params={"project_id": project_id, "layer_id": layer_id},
            query={"type": type, "folder": folder, "commit": commit},
        )

    def get_output_fabrication_view(self, project_id: str, *, type: str = 'manufacturing', folder: str = '', commit: str | None = None) -> FabricationView:
        """Layers, board size and drill tools of the Gerbers in one output folder"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/fabrication-view",
            path_params={"project_id": project_id},
            query={"type": type, "folder": folder, "commit": commit},
        )

    def get_output_placement(self, project_id: str, *, type: str = 'manufacturing', folder: str = '', commit: str | None = None) -> app__api__fabrication_view__PlacementView:
        """Placed parts of a folder's position files, checked against its BOM"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/placement",
            path_params={"project_id": project_id},
            query={"type": type, "folder": folder, "commit": commit},
        )

    def get_part_manifest(self, part_id: str, *, representation: str = '', revision: str = '') -> PartManifest:
        """The signed asset manifest KiCad uses to place a part"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/parts/{part_id}",
            path_params={"part_id": part_id},
            query={"representation": representation, "revision": revision},
        )

    def get_pcb_rule_fields(self) -> dict[str, Any]:
        """Get Pcb Rule Fields"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/pcb-rule-fields",
        )

    def get_preview_job(self, job_id: str) -> CatalogJob:
        """Read a preview generation job"""
        return self._request(
            "GET",
            "/api/v1/catalog/previews/jobs/{job_id}",
            path_params={"job_id": job_id},
        )

    def get_profile(self, profile_id: str) -> OpsProfile:
        """One sampling profile"""
        return self._request(
            "GET",
            "/api/v1/ops/profiles/{profile_id}",
            path_params={"profile_id": profile_id},
        )

    def get_project_3d_model(self, project_id: str, *, commit: str | None = None) -> Any:
        """The project's committed 3D model"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/3d-model",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_asset(self, project_id: str, asset_path: str, *, commit: str | None = None) -> Any:
        """Serve an asset from the project checkout"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/asset/{asset_path}",
            path_params={"project_id": project_id, "asset_path": asset_path},
            query={"commit": commit},
        )

    def get_project_bom(self, project_id: str, *, commit: str | None = None, assembly: str = 'all') -> BomOut:
        """Get Project Bom"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/bom",
            path_params={"project_id": project_id},
            query={"commit": commit, "assembly": assembly},
        )

    def get_project_branches(self, project_id: str) -> ProjectBranches:
        """Branches that can be viewed for the project"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/branches",
            path_params={"project_id": project_id},
        )

    def get_project_comments_source_urls(self, project_id: str, *, base_url: str | None = None) -> ProjectCommentsSourceUrls:
        """List comment source URLs for a KiCad comments source"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/source-urls",
            path_params={"project_id": project_id},
            query={"base_url": base_url},
        )

    def get_project_commit_distance(self, project_id: str, *, commit: str, ref: str | None = None) -> CommitDistance:
        """How many commits behind a revision is"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/commits/distance",
            path_params={"project_id": project_id},
            query={"commit": commit, "ref": ref},
        )

    def get_project_commit_file(self, project_id: str, commit_hash: str, *, path: str) -> Any:
        """Serve one file from a commit"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/commits/{commit_hash}/file",
            path_params={"project_id": project_id, "commit_hash": commit_hash},
            query={"path": path},
        )

    def get_project_commit_summary(self, project_id: str, commit_hash: str) -> ProjectCommitSummary:
        """Files changed in one commit"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/commits/{commit_hash}/summary",
            path_params={"project_id": project_id, "commit_hash": commit_hash},
        )

    def get_project_commits(self, project_id: str, *, limit: int = 50, offset: int = 0, ref: str | None = None, include_total: bool = True) -> ProjectCommits:
        """Paginated commit history of the project"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/commits",
            path_params={"project_id": project_id},
            query={"limit": limit, "offset": offset, "ref": ref, "include_total": include_total},
        )

    def get_project_config(self, project_id: str) -> ProjectPathConfig:
        """The project's path configuration and resolved paths"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/config",
            path_params={"project_id": project_id},
        )

    def get_project_description(self, project_id: str) -> ProjectDescription:
        """The project description"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/description",
            path_params={"project_id": project_id},
        )

    def get_project_detail(self, project_id: str) -> Project:
        """Get Project Detail"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}",
            path_params={"project_id": project_id},
        )

    def get_project_files(self, project_id: str, *, type: str = 'design', commit: str | None = None) -> list[FileItem]:
        """Get Project Files"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/files",
            path_params={"project_id": project_id},
            query={"type": type, "commit": commit},
        )

    def get_project_ibom(self, project_id: str, *, commit: str | None = None) -> Any:
        """The project's interactive BOM"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/ibom",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_import_session(self, session_id: str) -> ImportSession:
        """Read an import session"""
        return self._request(
            "GET",
            "/api/v1/catalog/import-sessions/{session_id}",
            path_params={"session_id": session_id},
        )

    def get_project_name(self, project_id: str) -> ProjectName:
        """The project's display name and fallback name"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/name",
            path_params={"project_id": project_id},
        )

    def get_project_overview(self, project_id: str, *, commit: str | None = None) -> ProjectOverview:
        """Project details and README in one payload"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/overview",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_pcb(self, project_id: str, *, commit: str | None = None) -> Any:
        """The revision's board file"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/pcb",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_properties(self, project_id: str) -> ProjectPropertiesResponse:
        """Get Project Properties"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/properties",
            path_params={"project_id": project_id},
        )

    def get_project_readme(self, project_id: str, *, commit: str | None = None) -> ProjectReadme:
        """The project README text"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/readme",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_releases(self, project_id: str, *, ref: str | None = None, limit: int = 9, offset: int = 0, include_total: bool = True) -> ProjectReleases:
        """Paginated Git tags of the project's repository"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/releases",
            path_params={"project_id": project_id},
            query={"ref": ref, "limit": limit, "offset": offset, "include_total": include_total},
        )

    def get_project_schematic(self, project_id: str, *, commit: str | None = None) -> Any:
        """The revision's root schematic"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/schematic",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_spec(self, spec_id: str) -> dict[str, Any]:
        """Get Project Spec"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/specs/{spec_id}",
            path_params={"spec_id": spec_id},
        )

    def get_project_spec_for_manufacturer(self, project_id: str, mfr_id: str) -> dict[str, Any]:
        """Get Project Spec For Manufacturer"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/projects/{project_id}/manufacturers/{mfr_id}/spec",
            path_params={"project_id": project_id, "mfr_id": mfr_id},
        )

    def get_project_subsheets(self, project_id: str, *, commit: str | None = None, include: str | None = None) -> Subsheets:
        """The schematics below the root, optionally with their text"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/schematic/subsheets",
            path_params={"project_id": project_id},
            query={"commit": commit, "include": include},
        )

    def get_project_thumbnail(self, project_id: str) -> Any:
        """The project's thumbnail image"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/thumbnail",
            path_params={"project_id": project_id},
        )

    def get_project_thumbnail_version(self, project_id: str, thumbnail_digest: str) -> Any:
        """One immutable version of the project's thumbnail"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/thumbnail/{thumbnail_digest}",
            path_params={"project_id": project_id, "thumbnail_digest": thumbnail_digest},
        )

    def get_project_tracker(self, project_id: str) -> dict[str, Any]:
        """Get Project Tracker"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/tracker",
            path_params={"project_id": project_id},
        )

    def get_project_variants(self, project_id: str, *, commit: str | None = None) -> ProjectVariantCatalog:
        """The revision's ordered design-variant catalog"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/variants",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_project_viewer_support_files(self, project_id: str, *, commit: str | None = None) -> ViewerSupportFiles:
        """The project file and drawing sheet the viewer needs"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/viewer/support-files",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_reply_history(self, project_id: str, comment_id: str, reply_id: str) -> list[CommentHistoryEntry]:
        """List a reply's revisions"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/{comment_id}/replies/{reply_id}/history",
            path_params={"project_id": project_id, "comment_id": comment_id, "reply_id": reply_id},
        )

    def get_route_latency(self, *, window_minutes: int = 60, route_prefix: str | None = None, limit: int = 50) -> RouteLatencyOut:
        """Route latency over a window"""
        return self._request(
            "GET",
            "/api/v1/ops/route-latency",
            query={"window_minutes": window_minutes, "route_prefix": route_prefix, "limit": limit},
        )

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Get Run"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/runs/{run_id}",
            path_params={"run_id": run_id},
        )

    def get_semantic_index_identity(self, project_id: str, *, commit: str | None = None) -> dict[str, Any]:
        """The revision's semantic-index document"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/semantic-index/identity",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_semantic_index_status(self, project_id: str, *, commit: str | None = None) -> SemanticIndexStatus:
        """Whether the revision's semantic index is ready"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/semantic-index/status",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_signed_comment_attachment(self, project_id: str, attachment_id: str, *, exp: int = 0, sig: str = '') -> Any:
        """Open one comment attachment through its signed link"""
        return self._request(
            "GET",
            "/api/v1/public/comment-attachments/{project_id}/{attachment_id}",
            path_params={"project_id": project_id, "attachment_id": attachment_id},
            query={"exp": exp, "sig": sig},
        )

    def get_slow_queries(self, *, order: str = 'total', limit: int = 20) -> SlowQueriesOut:
        """Slow statements from pg_stat_statements"""
        return self._request(
            "GET",
            "/api/v1/ops/slow-queries",
            query={"order": order, "limit": limit},
        )

    def get_source(self, project_id: str, *, commit_sha: str) -> SourceResponse:
        """Discover KiCad sources, variants and BOM presets at a commit"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/source",
            path_params={"project_id": project_id},
            query={"commit_sha": commit_sha},
        )

    def get_spec_config(self, project_id: str) -> dict[str, Any]:
        """Get Spec Config"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/projects/{project_id}/spec-config",
            path_params={"project_id": project_id},
        )

    def get_ssh_key(self) -> SSHKeyResponse:
        """Get Ssh Key"""
        return self._request(
            "GET",
            "/api/v1/settings/ssh-key",
        )

    def get_template(self, template_id: str) -> dict[str, Any] | None:
        """Get Template"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/templates/{template_id}",
            path_params={"template_id": template_id},
        )

    def get_validation_job(self, job_id: str) -> CatalogJob:
        """Read a validation job"""
        return self._request(
            "GET",
            "/api/v1/catalog/validation/jobs/{job_id}",
            path_params={"job_id": job_id},
        )

    def get_validation_report(self, run_id: str, report_name: str) -> Any:
        """Read a validation report"""
        return self._request(
            "GET",
            "/api/v1/catalog/validation/runs/{run_id}/{report_name}",
            path_params={"run_id": run_id, "report_name": report_name},
        )

    def get_validation_run(self, run_id: str) -> ValidationRun:
        """Read a validation run"""
        return self._request(
            "GET",
            "/api/v1/catalog/validation/runs/{run_id}",
            path_params={"run_id": run_id},
        )

    def get_webgpu_3d_analytic(self, project_id: str, *, commit: str | None = None) -> WebGpu3dAnalytic:
        """The viewer's analytic bundle document for a revision"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/webgpu-3d/analytic",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_webgpu_3d_asset(self, project_id: str, source_revision_key: str, generator_build: str, asset_path: str) -> Any:
        """Serve one design-bundle member by revision key and generator"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/webgpu-3d/assets/{source_revision_key}/{generator_build}/{asset_path}",
            path_params={"project_id": project_id, "source_revision_key": source_revision_key, "generator_build": generator_build, "asset_path": asset_path},
        )

    def get_webgpu_3d_status(self, project_id: str, *, commit: str | None = None) -> WebGpu3dStatus:
        """The 3D tab's status for a revision, queueing its design bundle"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/webgpu-3d/status",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def get_workspace_bootstrap(self) -> WorkspaceBootstrap:
        """Projects, folders and version for the workspace"""
        return self._request(
            "GET",
            "/api/v1/workspace/bootstrap",
        )

    def impedance_template(self, project_id: str) -> Any:
        """Download the controlled-impedance template"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/impedance-template.csv",
            path_params={"project_id": project_id},
        )

    def import_access_help(self, *, body: dict[str, Any] | None = None) -> ImportAccessHelp:
        """Where to register the key for a repository Prism cannot read"""
        return self._request(
            "POST",
            "/api/v1/projects/access-help",
            body=body,
        )

    def import_auxiliary_asset(self, component_id: str, asset_type: str) -> ComponentMutation:
        """Attach an auxiliary asset to a component"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/assets/{asset_type}",
            path_params={"component_id": component_id, "asset_type": asset_type},
        )

    def import_footprint(self, component_id: str) -> FootprintImportResult:
        """Import a footprint for a component"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/footprint-import",
            path_params={"component_id": component_id},
        )

    def import_inventory_csv(self) -> InventoryImportResult:
        """Import inventory from CSV"""
        return self._request(
            "POST",
            "/api/v1/catalog/inventory/sync-csv",
        )

    def import_project(self, *, body: dict[str, Any] | None = None) -> JobStarted:
        """Start importing a repository"""
        return self._request(
            "POST",
            "/api/v1/projects/import",
            body=body,
        )

    def import_proposals_csv(self, session_id: str) -> ImportedProposalCsv:
        """Apply an edited import CSV"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-sessions/{session_id}/proposals.csv",
            path_params={"session_id": session_id},
        )

    def import_symbol_library(self, component_id: str) -> SymbolImportResult:
        """Import a symbol for a component"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/symbol-import",
            path_params={"component_id": component_id},
        )

    def infer_power_tree(self, project_id: str, *, commit: str | None = None) -> dict[str, Any]:
        """Infer Power Tree"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/power-tree",
            path_params={"project_id": project_id},
            query={"commit": commit},
        )

    def link_library_asset(self, component_id: str, asset_type: str, *, body: dict[str, Any] | None = None) -> ComponentMutation:
        """Link a stored library asset to a component"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/assets/{asset_type}/link",
            path_params={"component_id": component_id, "asset_type": asset_type},
            body=body,
        )

    def list_access_users(self) -> list[RoleAssignmentResponse]:
        """List Access Users"""
        return self._request(
            "GET",
            "/api/v1/settings/access/users",
        )

    def list_all_mcp_clients(self) -> list[McpClientAdminView]:
        """List All Mcp Clients"""
        return self._request(
            "GET",
            "/api/v1/auth/mcp-clients/all",
        )

    def list_all_personal_tokens(self) -> list[PersonalTokenView]:
        """List All Personal Tokens"""
        return self._request(
            "GET",
            "/api/v1/auth/tokens/all",
        )

    def list_build_logs(self, project_id: str, build_id: str) -> BuildLogs:
        """Which steps have a log, how long each took, and how it ended"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/logs",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def list_candidates(self, project_id: str, *, config_key: str | None = None) -> CandidateList:
        """List release candidates with their build attempts"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/candidates",
            path_params={"project_id": project_id},
            query={"config_key": config_key},
        )

    def list_catalog_categories(self) -> CatalogCategories:
        """List released catalog categories"""
        return self._request(
            "GET",
            "/api/v1/catalog/categories",
        )

    def list_catalog_components(self, *, q: str = '', source: str | None = None, availability_state: str | None = None, workflow_stage: str | None = None, validation_status: str | None = None, category: str | None = None, include_inactive: bool = False, page: int = 1, page_size: int = 50, sort_by: str = '', sort_dir: str = 'asc', lightweight: bool = False) -> CatalogComponentPage:
        """List catalog components"""
        return self._request(
            "GET",
            "/api/v1/catalog/components",
            query={"q": q, "source": source, "availability_state": availability_state, "workflow_stage": workflow_stage, "validation_status": validation_status, "category": category, "include_inactive": include_inactive, "page": page, "page_size": page_size, "sort_by": sort_by, "sort_dir": sort_dir, "lightweight": lightweight},
        )

    def list_categories(self) -> CategoryList:
        """List the released components' categories"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/categories",
        )

    def list_component_audit(self, component_id: str) -> AuditEventPage:
        """List component audit events"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/audit",
            path_params={"component_id": component_id},
        )

    def list_component_releases(self, component_id: str) -> ComponentReleaseRecordPage:
        """List component release records"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/releases",
            path_params={"component_id": component_id},
        )

    def list_component_reviews(self, component_id: str) -> ComponentReviewDecisionPage:
        """List component review decisions"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/reviews",
            path_params={"component_id": component_id},
        )

    def list_component_revisions(self, component_id: str) -> ComponentRevisionPage:
        """List component revisions"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/revisions",
            path_params={"component_id": component_id},
        )

    def list_component_usage(self, component_id: str, *, mode: str = 'current') -> ComponentUsagePage:
        """List where a component is used"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/usage",
            path_params={"component_id": component_id},
            query={"mode": mode},
        )

    def list_connector_repositories(self, connector_id: str) -> list[dict[str, Any]]:
        """List Connector Repositories"""
        return self._request(
            "GET",
            "/api/v1/admin/trackers/connectors/{connector_id}/repositories",
            path_params={"connector_id": connector_id},
        )

    def list_connectors(self) -> list[dict[str, Any]]:
        """List Connectors"""
        return self._request(
            "GET",
            "/api/v1/admin/trackers/connectors",
        )

    def list_document_sheets(self, project_id: str, build_id: str) -> DocumentSheetList:
        """List the composed documentation sheets of a build"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/sheets",
            path_params={"project_id": project_id, "build_id": build_id},
        )

    def list_engines(self) -> list[dict[str, Any]]:
        """List Engines"""
        return self._request(
            "GET",
            "/api/v1/sim/a0/engines",
        )

    def list_events(self, *, after: int = 0, topic: list[str] | None = None, limit: int = 200) -> EventPage:
        """List events after a cursor"""
        return self._request(
            "GET",
            "/api/v1/events",
            query={"after": after, "topic": topic, "limit": limit},
        )

    def list_folder_import_roots(self) -> FolderImportRootPage:
        """List server import roots"""
        return self._request(
            "GET",
            "/api/v1/catalog/import-sources/folder-roots",
        )

    def list_identities(self) -> list[dict[str, Any]]:
        """List Identities"""
        return self._request(
            "GET",
            "/api/v1/trackers/identities",
        )

    def list_linkable_connectors(self) -> list[dict[str, Any]]:
        """List Linkable Connectors"""
        return self._request(
            "GET",
            "/api/v1/trackers/linkable-connectors",
        )

    def list_manufacturers(self) -> list[dict[str, Any]]:
        """List Manufacturers"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/manufacturers",
        )

    def list_manufacturing_runs(self, *, project_id: str | None = None) -> list[dict[str, Any]]:
        """List Manufacturing Runs"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/runs",
            query={"project_id": project_id},
        )

    def list_mates_with(self, component_id: str) -> MatePage:
        """List the parts this part mates with"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/mates-with",
            path_params={"component_id": component_id},
        )

    def list_mcp_audit(self, *, client_id: str | None = None, user: str | None = None, project_id: str | None = None, tool: str | None = None, token_id: str | None = None, kind: str | None = None, before: int | None = None, limit: int = 100) -> McpAuditPage:
        """List Mcp Audit"""
        return self._request(
            "GET",
            "/api/v1/admin/mcp-audit",
            query={"client_id": client_id, "user": user, "project_id": project_id, "tool": tool, "token_id": token_id, "kind": kind, "before": before, "limit": limit},
        )

    def list_mcp_clients(self) -> list[McpClientView]:
        """List Mcp Clients"""
        return self._request(
            "GET",
            "/api/v1/auth/mcp-clients",
        )

    def list_mention_candidates(self, project_id: str) -> list[MentionCandidate]:
        """List Mention Candidates"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/mention-candidates",
            path_params={"project_id": project_id},
        )

    def list_metadata_fields(self, *, include_archived: bool = False) -> MetadataFieldPage:
        """List metadata fields"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/fields",
            query={"include_archived": include_archived},
        )

    def list_models(self, component_id: str, *, revisionId: str | None = None) -> ModelPage:
        """List a part's STEP models"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/models",
            path_params={"component_id": component_id},
            query={"revisionId": revisionId},
        )

    def list_monorepos(self) -> list[Monorepo]:
        """List Monorepos"""
        return self._request(
            "GET",
            "/api/v1/projects/monorepos",
        )

    def list_my_sessions(self) -> list[ActiveSession]:
        """List My Sessions"""
        return self._request(
            "GET",
            "/api/v1/auth/sessions",
        )

    def list_personal_tokens(self) -> list[PersonalTokenView]:
        """List Personal Tokens"""
        return self._request(
            "GET",
            "/api/v1/auth/tokens",
        )

    def list_project_import_proposals(self, session_id: str) -> ImportProposalPage:
        """List import proposals"""
        return self._request(
            "GET",
            "/api/v1/catalog/import-sessions/{session_id}/proposals",
            path_params={"session_id": session_id},
        )

    def list_project_import_sessions(self) -> ImportSessionPage:
        """List import sessions"""
        return self._request(
            "GET",
            "/api/v1/catalog/import-sessions",
        )

    def list_project_manufacturers(self, project_id: str) -> list[dict[str, Any]]:
        """List Project Manufacturers"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/projects/{project_id}/manufacturers",
            path_params={"project_id": project_id},
        )

    def list_project_specs(self, project_id: str, *, manufacturer_id: str | None = None) -> list[dict[str, Any]]:
        """List Project Specs"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/projects/{project_id}/specs",
            path_params={"project_id": project_id},
            query={"manufacturer_id": manufacturer_id},
        )

    def list_projects(self) -> list[Project]:
        """List Projects"""
        return self._request(
            "GET",
            "/api/v1/projects/",
        )

    def list_recent_requests(self, *, limit: int = 50, min_duration_ms: int | None = None, status_min: int | None = None, route_prefix: str | None = None) -> list[RecentRequestOut]:
        """Recent slow, write and failed requests"""
        return self._request(
            "GET",
            "/api/v1/ops/requests",
            query={"limit": limit, "min_duration_ms": min_duration_ms, "status_min": status_min, "route_prefix": route_prefix},
        )

    def list_runs(self, project_id: str) -> list[dict[str, Any]]:
        """List Runs"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/runs",
            path_params={"project_id": project_id},
        )

    def list_service_clients(self) -> ServiceClientList:
        """List the machine clients that may call the API"""
        return self._request(
            "GET",
            "/api/v1/admin/service-clients",
        )

    def list_setups(self, project_id: str) -> list[dict[str, Any]]:
        """List Setups"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/setups",
            path_params={"project_id": project_id},
        )

    def list_templates(self, *, manufacturer_id: str | None = None) -> list[dict[str, Any]]:
        """List Templates"""
        return self._request(
            "GET",
            "/api/v1/manufacturing/templates",
            query={"manufacturer_id": manufacturer_id},
        )

    def list_tokens(self, *, all_users: bool = False) -> list[AgentTokenView]:
        """List Tokens"""
        return self._request(
            "GET",
            "/api/v1/agent/tokens",
            query={"all_users": all_users},
        )

    def list_vendor_profiles(self, project_id: str) -> VendorProfileList:
        """List the vendor pack profiles Release Studio offers"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/vendor-profiles",
            path_params={"project_id": project_id},
        )

    def list_webhook_deliveries(self, webhook_id: str) -> list[WebhookDeliveryView]:
        """List an outbound webhook's latest deliveries"""
        return self._request(
            "GET",
            "/api/v1/settings/webhooks/{webhook_id}/deliveries",
            path_params={"webhook_id": webhook_id},
        )

    def list_webhooks(self) -> list[WebhookView]:
        """List outbound webhooks"""
        return self._request(
            "GET",
            "/api/v1/settings/webhooks",
        )

    def live(self) -> dict[str, Any]:
        """Live"""
        return self._request(
            "GET",
            "/api/v1/health/live",
        )

    def log_defect(self, run_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Log Defect"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/runs/{run_id}/defects",
            path_params={"run_id": run_id},
            body=body,
        )

    def login(self, *, body: dict[str, Any] | None = None) -> UserSession:
        """Login"""
        return self._request(
            "POST",
            "/api/v1/auth/login",
            body=body,
        )

    def login_with_password(self, *, body: dict[str, Any] | None = None) -> PasswordLoginResponse:
        """Login With Password"""
        return self._request(
            "POST",
            "/api/v1/auth/login/password",
            body=body,
        )

    def logout(self) -> AuthSuccessResponse:
        """Revoke this browser's session"""
        return self._request(
            "POST",
            "/api/v1/auth/logout",
        )

    def metadata_batch_report(self, batch_id: str) -> Any:
        """Export a metadata batch report"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/batches/{batch_id}/report.csv",
            path_params={"batch_id": batch_id},
        )

    def metadata_grid(self, *, q: str = '', availability_state: str | None = None, workflow_stage: str | None = None, validation_status: str | None = None, category: str | None = None, page: int = 1, page_size: int = 100, sort_by: str = 'updated_at', sort_dir: str = 'desc', field: list[str] | None = None) -> MetadataGridPage:
        """Read the metadata grid"""
        return self._request(
            "GET",
            "/api/v1/catalog/metadata/grid",
            query={"q": q, "availability_state": availability_state, "workflow_stage": workflow_stage, "validation_status": validation_status, "category": category, "page": page, "page_size": page_size, "sort_by": sort_by, "sort_dir": sort_dir, "field": field},
        )

    def model_glb(self, key: str) -> Any:
        """Read a converted model GLB"""
        return self._request(
            "GET",
            "/api/v1/catalog/models/{key}.glb",
            path_params={"key": key},
        )

    def model_preview(self, component_id: str, asset_id: str, *, view: str = 'front', offset: str | None = None, rotation: str | None = None, scale: float | None = None, partner: str | None = None) -> Any:
        """Render a model preview"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/models/{asset_id}/preview.svg",
            path_params={"component_id": component_id, "asset_id": asset_id},
            query={"view": view, "offset": offset, "rotation": rotation, "scale": scale, "partner": partner},
        )

    def move_project_to_folder(self, project_id: str, *, body: dict[str, Any] | None = None) -> FolderMoveResult:
        """Move one project to a folder"""
        return self._request(
            "POST",
            "/api/v1/folders/projects/{project_id}/move",
            path_params={"project_id": project_id},
            body=body,
        )

    def move_projects_to_folder(self, *, body: dict[str, Any] | None = None) -> FolderBulkMoveResult:
        """Move several projects to a folder in one transaction"""
        return self._request(
            "POST",
            "/api/v1/folders/projects/move",
            body=body,
        )

    def oauth_callback(self, *, code: str = '', state: str = '') -> None:
        """Complete account linking and return the browser to the app"""
        return self._request(
            "GET",
            "/api/v1/trackers/oauth/callback",
            query={"code": code, "state": state},
        )

    def ops_cancel_job(self, job_id: str) -> JobCancelOut:
        """Ask an ops-selected job to cancel"""
        return self._request(
            "POST",
            "/api/v1/ops/jobs/{job_id}/cancel",
            path_params={"job_id": job_id},
        )

    def ops_clear_debug_logging(self) -> DebugLoggingCleared:
        """Clear the debug-logging window"""
        return self._request(
            "DELETE",
            "/api/v1/ops/debug-logging",
        )

    def ops_get_debug_logging(self) -> DebugLoggingWindow | None:
        """The debug-logging window in force, or null"""
        return self._request(
            "GET",
            "/api/v1/ops/debug-logging",
        )

    def ops_rebuild_bundle(self, project_id: str, *, body: dict[str, Any] | None = None) -> BundleRebuildOut:
        """Drop one commit's design bundle and queue a rebuild"""
        return self._request(
            "POST",
            "/api/v1/ops/projects/{project_id}/rebuild-bundle",
            path_params={"project_id": project_id},
            body=body,
        )

    def ops_requeue_job(self, job_id: str) -> JobRequeueOut:
        """Requeue a failed or lease-expired job"""
        return self._request(
            "POST",
            "/api/v1/ops/jobs/{job_id}/requeue",
            path_params={"job_id": job_id},
        )

    def ops_set_debug_logging(self, *, body: dict[str, Any] | None = None) -> DebugLoggingWindow:
        """Raise Prism's loggers to DEBUG for at most thirty minutes"""
        return self._request(
            "POST",
            "/api/v1/ops/debug-logging",
            body=body,
        )

    def ops_status(self) -> OpsStatus:
        """Whether ops diagnostics are on, and for whom"""
        return self._request(
            "GET",
            "/api/v1/ops/status",
        )

    def patch_setup(self, project_id: str, setup_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Patch Setup"""
        return self._request(
            "PATCH",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}",
            path_params={"project_id": project_id, "setup_id": setup_id},
            body=body,
        )

    def pause_connector(self, connector_id: str) -> dict[str, Any]:
        """Pause Connector"""
        return self._request(
            "POST",
            "/api/v1/admin/trackers/connectors/{connector_id}/pause",
            path_params={"connector_id": connector_id},
        )

    def pin_comment(self, project_id: str, comment_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Pin an unpinned comment to an exact commit"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/pin",
            path_params={"project_id": project_id, "comment_id": comment_id},
            body=body,
        )

    def plugin_version(self) -> dict[str, Any]:
        """Plugin Version"""
        return self._request(
            "GET",
            "/api/v1/plugin/version",
        )

    def pool_and_workers(self) -> PoolAndWorkers:
        """This process's pool, live workers, resource slots and queue depth"""
        return self._request(
            "GET",
            "/api/v1/ops/pool-and-workers",
        )

    def preflight_setup(self, project_id: str, setup_id: str) -> dict[str, Any]:
        """Preflight Setup"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}/preflight",
            path_params={"project_id": project_id, "setup_id": setup_id},
        )

    def preview_document_sheet(self, project_id: str, build_id: str, sheet_key: str) -> Any:
        """Preview one composed documentation sheet"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/sheets/{sheet_key}.pdf",
            path_params={"project_id": project_id, "build_id": build_id, "sheet_key": sheet_key},
        )

    def preview_metadata_csv(self) -> MetadataCsvPreview:
        """Preview a metadata CSV import"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/import-csv/preview",
        )

    def preview_spec_config(self, *, body: dict[str, Any] | None = None) -> dict[str, Any] | None:
        """Preview Spec Config"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/spec-config/preview",
            body=body,
        )

    def project_tracker_health(self, project_id: str) -> dict[str, Any]:
        """Project Tracker Health"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/tracker/health",
            path_params={"project_id": project_id},
        )

    def promote_comment_to_tracker(self, project_id: str, comment_id: str) -> dict[str, Any]:
        """Promote Comment To Tracker"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/promote",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def publish_build(self, project_id: str, build_id: str, *, body: dict[str, Any] | None = None) -> PublishResult:
        """Zip the dossier, attach selected vendor packs, and publish the forge release"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/publish",
            path_params={"project_id": project_id, "build_id": build_id},
            body=body,
        )

    def push_comments(self, project_id: str) -> PushCommentsView:
        """Export the comment snapshot to the project's comments.json"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/push",
            path_params={"project_id": project_id},
        )

    def put_mcp_governance(self, *, body: dict[str, Any] | None = None) -> McpGovernance:
        """Put Mcp Governance"""
        return self._request(
            "PUT",
            "/api/v1/settings/mcp",
            body=body,
        )

    def read_catalog(self) -> dict[str, Any]:
        """Read Catalog"""
        return self._request(
            "GET",
            "/api/v1/sim/a0/catalog",
        )

    def read_layout(self, project_id: str, setup_id: str) -> dict[str, Any]:
        """Read Layout"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}/layout",
            path_params={"project_id": project_id, "setup_id": setup_id},
        )

    def read_result(self, project_id: str, run_id: str) -> dict[str, Any]:
        """Read Result"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/runs/{run_id}/result",
            path_params={"project_id": project_id, "run_id": run_id},
        )

    def read_result_file(self, project_id: str, run_id: str, path: str) -> Any:
        """Download one file a run produced"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/runs/{run_id}/files/{path}",
            path_params={"project_id": project_id, "run_id": run_id, "path": path},
        )

    def read_run(self, project_id: str, run_id: str) -> dict[str, Any]:
        """Read Run"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/runs/{run_id}",
            path_params={"project_id": project_id, "run_id": run_id},
        )

    def read_run_materialization(self, project_id: str, run_id: str) -> Any:
        """The bundle's analytic pack the engine solved against"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/runs/{run_id}/materialization",
            path_params={"project_id": project_id, "run_id": run_id},
        )

    def read_run_setup(self, project_id: str, run_id: str) -> dict[str, Any]:
        """Read Run Setup"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/runs/{run_id}/setup",
            path_params={"project_id": project_id, "run_id": run_id},
        )

    def read_setup(self, project_id: str, setup_id: str) -> dict[str, Any]:
        """Read Setup"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}",
            path_params={"project_id": project_id, "setup_id": setup_id},
        )

    def ready(self) -> dict[str, Any]:
        """Ready"""
        return self._request(
            "GET",
            "/api/v1/health/ready",
        )

    def reattach_comment(self, project_id: str, comment_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Reattach a comment for a commit's descendants"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/reattach",
            path_params={"project_id": project_id, "comment_id": comment_id},
            body=body,
        )

    def regenerate_component_previews(self, component_id: str) -> CatalogComponent:
        """Regenerate a component's previews"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/previews/regenerate",
            path_params={"component_id": component_id},
        )

    def regenerate_design_bundles(self, project_id: str, *, body: dict[str, Any] | None = None) -> RegeneratedBundles:
        """Drop the bundles in scope and queue a rebuild that skips reuse"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/design-bundles/regenerate",
            path_params={"project_id": project_id},
            body=body,
        )

    def regenerate_project_thumbnail(self, project_id: str) -> ThumbnailQueued:
        """Queue a fresh board thumbnail render"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/thumbnail/regenerate",
            path_params={"project_id": project_id},
        )

    def regenerate_project_thumbnails(self, *, body: dict[str, Any] | None = None) -> ThumbnailsQueued:
        """Queue board thumbnail renders for several projects"""
        return self._request(
            "POST",
            "/api/v1/projects/thumbnails/regenerate",
            body=body,
        )

    def reject_project_import_proposal(self, proposal_id: str) -> ImportProposal:
        """Reject an import proposal"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-proposals/{proposal_id}/reject",
            path_params={"proposal_id": proposal_id},
        )

    def release_queue(self, *, q: str = '', workflow_stage: str = 'all', page: int = 1, page_size: int = 50) -> ReleaseQueuePage:
        """List the release queue"""
        return self._request(
            "GET",
            "/api/v1/catalog/release-queue",
            query={"q": q, "workflow_stage": workflow_stage, "page": page, "page_size": page_size},
        )

    def remove_comment_reaction(self, project_id: str, comment_id: str, reaction: str, *, replyId: str | None = None) -> CommentView:
        """Remove a reaction from a comment or reply"""
        return self._request(
            "DELETE",
            "/api/v1/projects/{project_id}/comments/{comment_id}/reactions/{reaction}",
            path_params={"project_id": project_id, "comment_id": comment_id, "reaction": reaction},
            query={"replyId": replyId},
        )

    def remove_mate(self, component_id: str, other_id: str) -> MatePage:
        """Remove a mating between two parts"""
        return self._request(
            "DELETE",
            "/api/v1/catalog/components/{component_id}/mates-with/{other_id}",
            path_params={"component_id": component_id, "other_id": other_id},
        )

    def render_png(self, project_id: str, render_id: str) -> Any:
        """Download a rendered PNG"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/renders/{render_id}.png",
            path_params={"project_id": project_id, "render_id": render_id},
        )

    def render_record(self, project_id: str, render_id: str) -> RenderRecordResponse:
        """Read a render's record"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/renders/{render_id}",
            path_params={"project_id": project_id, "render_id": render_id},
        )

    def replace_setup(self, project_id: str, setup_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Replace Setup"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}",
            path_params={"project_id": project_id, "setup_id": setup_id},
            body=body,
        )

    def repromote_comment_tracker(self, project_id: str, comment_id: str) -> dict[str, Any]:
        """Repromote Comment Tracker"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/tracker/repromote",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def restore_metadata_field(self, field_id: str) -> MetadataField:
        """Restore a metadata field"""
        return self._request(
            "POST",
            "/api/v1/catalog/metadata/fields/{field_id}/restore",
            path_params={"field_id": field_id},
        )

    def resume_connector(self, connector_id: str) -> dict[str, Any]:
        """Resume Connector"""
        return self._request(
            "POST",
            "/api/v1/admin/trackers/connectors/{connector_id}/resume",
            path_params={"connector_id": connector_id},
        )

    def retry_comment_sync(self, project_id: str, comment_id: str) -> dict[str, Any]:
        """Retry Comment Sync"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/tracker/retry",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def retry_project_import_follow_ups(self, project_id: str) -> ImportFollowUpsRetried:
        """Retry the metadata and thumbnail jobs an import could not queue"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/import-follow-ups/retry",
            path_params={"project_id": project_id},
        )

    def revoke_connector(self, connector_id: str) -> dict[str, Any]:
        """Revoke Connector"""
        return self._request(
            "POST",
            "/api/v1/admin/trackers/connectors/{connector_id}/revoke",
            path_params={"connector_id": connector_id},
        )

    def revoke_mcp_client(self, grant_id: str) -> None:
        """Revoke Mcp Client"""
        return self._request(
            "DELETE",
            "/api/v1/auth/mcp-clients/{grant_id}",
            path_params={"grant_id": grant_id},
        )

    def revoke_other_sessions(self) -> RevokeSessionsResponse:
        """Sign out everywhere except this browser"""
        return self._request(
            "POST",
            "/api/v1/auth/sessions/revoke-others",
        )

    def revoke_personal_token(self, token_id: str) -> None:
        """Revoke Personal Token"""
        return self._request(
            "DELETE",
            "/api/v1/auth/tokens/{token_id}",
            path_params={"token_id": token_id},
        )

    def revoke_token(self, jti: str) -> dict[str, str]:
        """Revoke Token"""
        return self._request(
            "DELETE",
            "/api/v1/agent/tokens/{jti}",
            path_params={"jti": jti},
        )

    def revoke_user_sessions(self, email: str) -> RevokeSessionsResponse:
        """Terminate every session belonging to an account"""
        return self._request(
            "POST",
            "/api/v1/auth/sessions/revoke-user/{email}",
            path_params={"email": email},
        )

    def rotate_service_client_secret(self, client_id: str) -> ServiceClientWithSecret:
        """Replace a machine client's secret and show the new one once"""
        return self._request(
            "POST",
            "/api/v1/admin/service-clients/{client_id}/rotate-secret",
            path_params={"client_id": client_id},
        )

    def rotate_webhook_secret(self, webhook_id: str) -> WebhookSecret:
        """Rotate an outbound webhook's signing secret"""
        return self._request(
            "POST",
            "/api/v1/settings/webhooks/{webhook_id}/rotate-secret",
            path_params={"webhook_id": webhook_id},
        )

    def run_artifact_maintenance(self) -> CatalogJobQueued:
        """Run artifact maintenance"""
        return self._request(
            "POST",
            "/api/v1/catalog/artifacts/maintenance",
        )

    def save_board_spec(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any] | None:
        """Save Board Spec"""
        return self._request(
            "PUT",
            "/api/v1/manufacturing/projects/{project_id}/board-spec",
            path_params={"project_id": project_id},
            body=body,
        )

    def save_import_proposal_drafts(self, session_id: str, *, body: dict[str, Any] | None = None) -> SavedImportDrafts:
        """Save import proposal drafts"""
        return self._request(
            "PUT",
            "/api/v1/catalog/import-sessions/{session_id}/proposals/drafts",
            path_params={"session_id": session_id},
            body=body,
        )

    def save_metadata_grid_preferences(self, *, body: dict[str, Any] | None = None) -> MetadataGridPreferences:
        """Save metadata grid preferences"""
        return self._request(
            "PUT",
            "/api/v1/catalog/metadata/grid-preferences",
            body=body,
        )

    def save_source_defaults(self, project_id: str, *, body: dict[str, Any] | None = None) -> SourceDefaultsResponse:
        """Remember the Source picks for the next release"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/release-studio/source/defaults",
            path_params={"project_id": project_id},
            body=body,
        )

    def save_spec_config(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Save Spec Config"""
        return self._request(
            "PUT",
            "/api/v1/manufacturing/projects/{project_id}/spec-config",
            path_params={"project_id": project_id},
            body=body,
        )

    def scan_catalog_usage(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Scan Catalog Usage"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/catalog-usage/scan",
            path_params={"project_id": project_id},
            body=body,
        )

    def scan_git_host_key(self, *, body: dict[str, Any] | None = None) -> HostKeyScanResponse:
        """Scan a Git host's SSH key fingerprint"""
        return self._request(
            "POST",
            "/api/v1/settings/git-access/host-keys/scan",
            body=body,
        )

    def search_catalog_assets(self, *, asset_type: str = 'footprint', q: str = '', limit: int = 25) -> AssetSearchPage:
        """Search catalog assets"""
        return self._request(
            "GET",
            "/api/v1/catalog/assets/search",
            query={"asset_type": asset_type, "q": q, "limit": limit},
        )

    def search_components(self, *, q: str = '', page: int = 1, page_size: int = 50, include_total: bool = False) -> ComponentPage:
        """Search the released components KiCad may place"""
        return self._request(
            "GET",
            "/api/v1/remote-provider/search",
            query={"q": q, "page": page, "page_size": page_size, "include_total": include_total},
        )

    def search_design(self, project_id: str, *, q: str, kind: list[str] | None = None, revision: str | None = None, limit: int = 50) -> DesignSearchOut:
        """Search Design"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/design/search",
            path_params={"project_id": project_id},
            query={"q": q, "kind": kind, "revision": revision, "limit": limit},
        )

    def search_projects(self, *, q: str = '', limit: int = 100) -> ProjectSearchResults:
        """Search projects by name, description or repository"""
        return self._request(
            "GET",
            "/api/v1/projects/search",
            query={"q": q, "limit": limit},
        )

    def set_model_alignment(self, component_id: str, asset_id: str, *, body: dict[str, Any] | None = None) -> ModelPage:
        """Save a model's alignment"""
        return self._request(
            "PUT",
            "/api/v1/catalog/components/{component_id}/models/{asset_id}/alignment",
            path_params={"component_id": component_id, "asset_id": asset_id},
            body=body,
        )

    def set_service_client_enabled(self, client_id: str, *, body: dict[str, Any] | None = None) -> ServiceClientOut:
        """Enable or disable a machine client"""
        return self._request(
            "PATCH",
            "/api/v1/admin/service-clients/{client_id}",
            path_params={"client_id": client_id},
            body=body,
        )

    def set_user_password(self, email: str, *, body: dict[str, Any] | None = None) -> SetUserPasswordResponse:
        """Set or reset a user's local password"""
        return self._request(
            "PUT",
            "/api/v1/settings/access/users/{email}/password",
            path_params={"email": email},
            body=body,
        )

    def share_reply_to_tracker(self, project_id: str, comment_id: str, reply_id: str) -> dict[str, Any]:
        """Share Reply To Tracker"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/replies/{reply_id}/share",
            path_params={"project_id": project_id, "comment_id": comment_id, "reply_id": reply_id},
        )

    def start_design_compare(self, project_id: str, *, body: dict[str, Any] | None = None) -> StartDesignCompareResponse:
        """Queue a design comparison between two commits"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/design-compare",
            path_params={"project_id": project_id},
            body=body,
        )

    def start_login(self) -> LoginStartResponse:
        """Start Login"""
        return self._request(
            "POST",
            "/api/v1/auth/login/start",
        )

    def start_render(self, project_id: str, *, body: dict[str, Any] | None = None) -> RenderStartResponse:
        """Queue a PNG render of a revision, or reuse a stored one"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/renders",
            path_params={"project_id": project_id},
            body=body,
        )

    def submit_setup(self, project_id: str, setup_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Submit Setup"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}/submit",
            path_params={"project_id": project_id, "setup_id": setup_id},
            body=body,
        )

    def sync_project_endpoint(self, project_id: str) -> SyncQueued:
        """Queue a sync with the project's remote"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/sync",
            path_params={"project_id": project_id},
        )

    def test_connector(self, connector_id: str) -> dict[str, Any]:
        """Test Connector"""
        return self._request(
            "POST",
            "/api/v1/admin/trackers/connectors/{connector_id}/test",
            path_params={"connector_id": connector_id},
        )

    def test_webhook(self, webhook_id: str) -> WebhookTestResult:
        """Send a test ping to an outbound webhook"""
        return self._request(
            "POST",
            "/api/v1/settings/webhooks/{webhook_id}/test",
            path_params={"webhook_id": webhook_id},
        )

    def thread_sync_history(self, project_id: str, comment_id: str) -> dict[str, Any]:
        """Thread Sync History"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/{comment_id}/tracker/history",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def thread_sync_status(self, project_id: str, comment_id: str) -> dict[str, Any]:
        """Thread Sync Status"""
        return self._request(
            "GET",
            "/api/v1/projects/{project_id}/comments/{comment_id}/tracker",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def token(self) -> ServiceToken:
        """Exchange client credentials for a service token"""
        return self._request(
            "POST",
            "/api/v1/oauth/token",
        )

    def trace_request(self, request_id: str) -> RequestTraceOut:
        """One request id across jobs, events and audit"""
        return self._request(
            "GET",
            "/api/v1/ops/requests/{request_id}",
            path_params={"request_id": request_id},
        )

    def tracker_webhook(self, provider: str, connector_id: str) -> WebhookAccepted:
        """Accept a signed tracker webhook delivery into the inbox"""
        return self._request(
            "POST",
            "/api/v1/trackers/webhooks/{provider}/{connector_id}",
            path_params={"provider": provider, "connector_id": connector_id},
        )

    def transition_release_status(self, component_id: str, *, body: dict[str, Any] | None = None) -> CatalogComponent:
        """Transition a component's release status"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/release",
            path_params={"component_id": component_id},
            body=body,
        )

    def trigger_workflow(self, project_id: str, *, body: dict[str, Any] | None = None) -> WorkflowQueued:
        """Queue a KiCad workflow output job"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/workflows",
            path_params={"project_id": project_id},
            body=body,
        )

    def trust_git_host_key(self, *, body: dict[str, Any] | None = None) -> HostKeyTrustResponse:
        """Pin a verified Git host key"""
        return self._request(
            "POST",
            "/api/v1/settings/git-access/host-keys/trust",
            body=body,
        )

    def unlink_comment_tracker(self, project_id: str, comment_id: str) -> dict[str, Any]:
        """Unlink Comment Tracker"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comments/{comment_id}/tracker/unlink",
            path_params={"project_id": project_id, "comment_id": comment_id},
        )

    def unlink_identity(self, connector_id: str) -> None:
        """Unlink Identity"""
        return self._request(
            "DELETE",
            "/api/v1/trackers/identities/{connector_id}",
            path_params={"connector_id": connector_id},
        )

    def update_catalog_component(self, component_id: str, *, body: dict[str, Any] | None = None) -> CatalogComponent:
        """Update a catalog component"""
        return self._request(
            "PATCH",
            "/api/v1/catalog/components/{component_id}",
            path_params={"component_id": component_id},
            body=body,
        )

    def update_comment(self, project_id: str, comment_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Edit a comment's content or status"""
        return self._request(
            "PATCH",
            "/api/v1/projects/{project_id}/comments/{comment_id}",
            path_params={"project_id": project_id, "comment_id": comment_id},
            body=body,
        )

    def update_component_representation(self, component_id: str, representation_id: str, *, body: dict[str, Any] | None = None) -> CatalogComponent:
        """Update a component representation"""
        return self._request(
            "PATCH",
            "/api/v1/catalog/components/{component_id}/representations/{representation_id}",
            path_params={"component_id": component_id, "representation_id": representation_id},
            body=body,
        )

    def update_connector(self, connector_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Connector"""
        return self._request(
            "PATCH",
            "/api/v1/admin/trackers/connectors/{connector_id}",
            path_params={"connector_id": connector_id},
            body=body,
        )

    def update_defect(self, defect_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Defect"""
        return self._request(
            "PATCH",
            "/api/v1/manufacturing/defects/{defect_id}",
            path_params={"defect_id": defect_id},
            body=body,
        )

    def update_folder(self, folder_id: str, *, body: dict[str, Any] | None = None) -> FolderRecord:
        """Rename or reparent a folder"""
        return self._request(
            "PATCH",
            "/api/v1/folders/{folder_id}",
            path_params={"folder_id": folder_id},
            body=body,
        )

    def update_manufacturer(self, mfr_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Manufacturer"""
        return self._request(
            "PATCH",
            "/api/v1/manufacturing/manufacturers/{mfr_id}",
            path_params={"mfr_id": mfr_id},
            body=body,
        )

    def update_metadata_field(self, field_id: str, *, body: dict[str, Any] | None = None) -> MetadataField:
        """Update a metadata field"""
        return self._request(
            "PATCH",
            "/api/v1/catalog/metadata/fields/{field_id}",
            path_params={"field_id": field_id},
            body=body,
        )

    def update_project_config(self, project_id: str, *, body: dict[str, Any] | None = None) -> ProjectConfigSaved:
        """Save a project's path configuration"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/config",
            path_params={"project_id": project_id},
            body=body,
        )

    def update_project_description(self, project_id: str, *, body: dict[str, Any] | None = None) -> ProjectDescriptionUpdated:
        """Update the project's description"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/description",
            path_params={"project_id": project_id},
            body=body,
        )

    def update_project_name(self, project_id: str, *, body: dict[str, Any] | None = None) -> ProjectNameUpdated:
        """Rename the project's display name"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/name",
            path_params={"project_id": project_id},
            body=body,
        )

    def update_project_spec(self, spec_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Project Spec"""
        return self._request(
            "PATCH",
            "/api/v1/manufacturing/specs/{spec_id}",
            path_params={"spec_id": spec_id},
            body=body,
        )

    def update_project_tracker(self, project_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Project Tracker"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/tracker",
            path_params={"project_id": project_id},
            body=body,
        )

    def update_reply(self, project_id: str, comment_id: str, reply_id: str, *, body: dict[str, Any] | None = None) -> CommentView:
        """Edit a reply"""
        return self._request(
            "PATCH",
            "/api/v1/projects/{project_id}/comments/{comment_id}/replies/{reply_id}",
            path_params={"project_id": project_id, "comment_id": comment_id, "reply_id": reply_id},
            body=body,
        )

    def update_run(self, run_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Run"""
        return self._request(
            "PATCH",
            "/api/v1/manufacturing/runs/{run_id}",
            path_params={"run_id": run_id},
            body=body,
        )

    def update_run_status(self, run_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Run Status"""
        return self._request(
            "PATCH",
            "/api/v1/manufacturing/runs/{run_id}/status",
            path_params={"run_id": run_id},
            body=body,
        )

    def update_template(self, template_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Update Template"""
        return self._request(
            "PATCH",
            "/api/v1/manufacturing/templates/{template_id}",
            path_params={"template_id": template_id},
            body=body,
        )

    def update_webhook(self, webhook_id: str, *, body: dict[str, Any] | None = None) -> WebhookView:
        """Edit an outbound webhook"""
        return self._request(
            "PATCH",
            "/api/v1/settings/webhooks/{webhook_id}",
            path_params={"webhook_id": webhook_id},
            body=body,
        )

    def upload_comment_attachment(self, project_id: str) -> CommentAttachmentUploadView:
        """Upload a file for a comment that will reference it"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/comment-attachments",
            path_params={"project_id": project_id},
        )

    def upload_evidence(self, defect_id: str) -> dict[str, Any] | None:
        """Upload Evidence"""
        return self._request(
            "POST",
            "/api/v1/manufacturing/defects/{defect_id}/evidence",
            path_params={"defect_id": defect_id},
        )

    def upload_folder_snapshot_file(self, snapshot_id: str) -> FolderSnapshotFile:
        """Upload a file into a folder snapshot"""
        return self._request(
            "POST",
            "/api/v1/catalog/import-snapshots/folders/{snapshot_id}/files",
            path_params={"snapshot_id": snapshot_id},
        )

    def upload_project_thumbnail(self, project_id: str) -> ThumbnailUploaded:
        """Replace the project's thumbnail with an uploaded image"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/thumbnail",
            path_params={"project_id": project_id},
        )

    def upsert_access_user(self, email: str, *, body: dict[str, Any] | None = None) -> RoleAssignmentResponse:
        """Upsert Access User"""
        return self._request(
            "PUT",
            "/api/v1/settings/access/users/{email}",
            path_params={"email": email},
            body=body,
        )

    def validate_catalog(self) -> CatalogJobQueued:
        """Validate the catalog"""
        return self._request(
            "POST",
            "/api/v1/catalog/validation/run",
        )

    def validate_component_klc(self, component_id: str) -> CatalogJobQueued:
        """Validate a component with KLC"""
        return self._request(
            "POST",
            "/api/v1/catalog/components/{component_id}/validate",
            path_params={"component_id": component_id},
        )

    def validate_setup(self, project_id: str, setup_id: str) -> dict[str, Any]:
        """Validate Setup"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}/validate",
            path_params={"project_id": project_id, "setup_id": setup_id},
        )

    def verify_component_audit(self, component_id: str) -> AuditVerification:
        """Verify the component audit chain"""
        return self._request(
            "GET",
            "/api/v1/catalog/components/{component_id}/audit/verify",
            path_params={"component_id": component_id},
        )

    def withdraw_build_approval(self, project_id: str, build_id: str, *, body: dict[str, Any] | None = None) -> ApprovalDecision:
        """Withdraw a previously recorded approval"""
        return self._request(
            "POST",
            "/api/v1/projects/{project_id}/release-studio/builds/{build_id}/approvals/withdraw",
            path_params={"project_id": project_id, "build_id": build_id},
            body=body,
        )

    def workflow_summary(self) -> WorkflowSummary:
        """Count components by workflow stage"""
        return self._request(
            "GET",
            "/api/v1/catalog/workflow/summary",
        )

    def write_layout(self, project_id: str, setup_id: str, *, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Write Layout"""
        return self._request(
            "PUT",
            "/api/v1/projects/{project_id}/sim/a0/setups/{setup_id}/layout",
            path_params={"project_id": project_id, "setup_id": setup_id},
            body=body,
        )
