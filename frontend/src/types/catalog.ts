export type ComponentSource = "manual" | "external";
export type AvailabilityState = "metadata_only" | "files_partial" | "place_ready";
export type WorkflowStage = "open" | "in_progress" | "qa_review" | "done" | "released" | "archived";
export type ReleaseStatus = WorkflowStage;
export type CatalogValidationStatus = "passed" | "warning" | "failed" | "skipped" | "not_run";

export interface CatalogAsset {
  id: string;
  asset_type: "symbol" | "footprint" | "3dmodel" | "spice";
  name: string;
  target_library: string;
  target_name: string;
  content_type: string;
  required: boolean;
  sha256?: string;
  size_bytes?: number;
  source_group?: string;
}

export interface CatalogPreview {
  id: string;
  kind: "symbol" | "footprint";
  preview_key: string;
  unit: number;
  unit_label: string;
  status: "ready" | "failed";
  content_type: string;
  file_path: string;
  generation_error: string;
  updated_at?: string;
}

export interface CatalogValidationRun {
  id: string;
  asset_id: string;
  asset_type: "symbol" | "footprint";
  checker_type: string;
  status: CatalogValidationStatus;
  error_count: number;
  warning_count: number;
  exit_code: number | null;
  tool_version: string;
  created_at: string;
  finished_at: string;
  inherited?: boolean;
  inherited_from_revision_id?: string;
  reports: {
    summary: string;
    json: string;
    junit: string;
    stdout: string;
    stderr: string;
  };
  findings?: CatalogValidationFinding[];
}

export interface CatalogValidationFinding {
  id: string;
  run_id: string;
  severity: "error" | "warning" | "info";
  rule_code: string;
  rule_url: string;
  message: string;
}

export interface CatalogComponentValidationEvidence {
  summary: CatalogValidationSummary;
  runs: CatalogValidationRun[];
}

export interface CatalogAssetValidation {
  asset_id: string;
  asset_type: "symbol" | "footprint";
  asset_name: string;
  target_library: string;
  target_name: string;
  status: CatalogValidationStatus;
  latest_run: CatalogValidationRun | null;
}

export interface CatalogValidationSummary {
  status: CatalogValidationStatus;
  enabled: boolean;
  release_gate: "off" | "warn" | "block";
  revision_id: string;
  error_count: number;
  warning_count: number;
  missing_required_assets: string[];
  assets: CatalogAssetValidation[];
}

export interface CatalogComponent {
  id: string;
  slug: string;
  external_source: string;
  external_id: string;
  external_workflow_source: string;
  external_workflow_id: string;
  external_workflow_url: string;
  external_url?: string;
  external_payload?: Record<string, unknown>;
  external_updated_at?: string;
  sync_status?: string;
  sync_error?: string;
  source: ComponentSource;
  name: string;
  value: string;
  manufacturer: string;
  mpn: string;
  description: string;
  package_name: string;
  category: string;
  datasheet_url: string;
  vendor: string;
  vendor_part_number: string;
  mass_g: string;
  rqjc_c_w: string;
  rqjc_top_c_w: string;
  temp_max_c: string;
  temp_min_c: string;
  power_dissipation_w: string;
  rate: string;
  sap_code: string;
  keywords: string[];
  availability_state: AvailabilityState;
  missing_assets: string[];
  place_enabled: boolean;
  stock_quantity: number;
  stock_uom: string;
  inventory_status: string;
  serial_number: string;
  lot_number: string;
  pedigree: string;
  last_synced_at: string;
  is_active: boolean;
  revision_id: string;
  revision: number;
  version: string;
  parent_revision_id: string;
  change_kind: string;
  change_summary: string;
  created_by: string;
  manifest_hash: string;
  component_created_at?: string;
  component_updated_at?: string;
  revision_created_at?: string;
  revision_updated_at?: string;
  current_revision_id?: string;
  released_revision_id?: string;
  is_historical_revision?: boolean;
  extra_fields: Record<string, string>;
  summary: string;
  library_name: string;
  symbol_name: string;
  release_status: ReleaseStatus;
  workflow_stage: WorkflowStage;
  assets: CatalogAsset[];
  previews: CatalogPreview[];
  validation: CatalogValidationSummary;
  released_view?: boolean;
}

export interface CatalogRevisionSummary {
  id: string;
  component_id: string;
  version: number;
  parent_revision_id: string;
  change_kind: string;
  change_summary: string;
  created_by: string;
  manifest_hash: string;
  release_status: ReleaseStatus;
  created_at: string;
  updated_at: string;
}

export interface CatalogRevisionDiffAsset {
  assetId: string;
  assetType: CatalogAsset["asset_type"];
  targetLibrary: string;
  targetName: string;
  sha256: string;
  sizeBytes: number;
  previewId: string;
  previewStatus: string;
  previews: Array<{
    previewId: string;
    previewStatus: string;
    previewSha256: string;
    previewGeneratorFingerprint: string;
    unit: number;
    unitLabel: string;
  }>;
}

export interface CatalogRevisionDiff {
  componentId: string;
  before: {
    revisionId: string;
    version: number;
    manifestHash: string;
  };
  after: {
    revisionId: string;
    version: number;
    manifestHash: string;
  };
  summary: {
    metadataChanges: number;
    assetChanges: number;
  };
  metadataChanges: Array<{
    field: string;
    before: string;
    after: string;
    status: "added" | "removed" | "modified" | "unchanged";
  }>;
  assetChanges: Array<{
    key: string;
    before: CatalogRevisionDiffAsset | null;
    after: CatalogRevisionDiffAsset | null;
    status: "added" | "removed" | "modified" | "unchanged";
  }>;
}

export interface CatalogAuditEvent {
  id: string;
  component_id: string;
  revision_id: string;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  previous_hash: string;
  event_hash: string;
  created_at: string;
  sequence?: number;
}

export interface CatalogAuditVerification {
  valid: boolean;
  event_count: number;
  verified_count: number;
  first_invalid_event_id: string;
  head_hash: string;
}

export interface CatalogComponentUsage {
  id: string;
  component_id: string;
  project_id: string;
  source_revision: string;
  references: string[];
  details?: Array<Record<string, unknown>>;
  is_current?: boolean;
  source: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface CatalogReviewDecision {
  id: string;
  component_id: string;
  revision_id: string;
  reviewer: string;
  reviewer_role?: string;
  decision: "approved" | "changes_requested" | "emergency_override" | "released" | "archived" | string;
  note: string;
  manifest_hash?: string;
  validation?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  created_at: string;
}

export interface CatalogReleaseRecord {
  id: string;
  component_id: string;
  revision_id: string;
  release_label: string;
  manifest_hash: string;
  released_by: string;
  approval_decision_id: string;
  validation: Partial<CatalogValidationSummary> & Record<string, unknown>;
  policy: {
    two_person_approval?: boolean;
    klc_release_gate?: "off" | "warn" | "block" | string;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface ProjectComponentImportProposal {
  id: string;
  session_id: string;
  dedupe_key: string;
  component_uid: string;
  reference: string;
  status: "candidate" | "accepted" | "rejected";
  accepted_component_id: string;
  metadata: Record<string, unknown>;
  assets: Array<{
    asset_type: "symbol" | "footprint" | "3dmodel" | "spice";
    filename: string;
    sha256: string;
    size_bytes: number;
    target_library: string;
    target_name: string;
    source_path: string;
  }>;
  provenance: Array<{
    projectId: string;
    sourceRevision: string;
    reference: string;
    componentUid: string;
  }>;
  findings: Array<{ code: string; severity: "warning" | "error"; message: string }>;
  draft?: ImportProposalDraft;
}

/** Unaccepted remediation edits, persisted server-side so they survive a reload. */
export interface ImportProposalDraft {
  metadata_overrides?: Record<string, string>;
  asset_selections?: Record<string, string[]>;
  /** asset_type -> existing catalog asset id, linked by reference rather than copied. */
  asset_links?: Record<string, string>;
}

export interface CatalogAssetSummary {
  id: string;
  asset_type: "symbol" | "footprint" | "3dmodel" | "spice";
  name: string;
  target_library: string;
  target_name: string;
  sha256: string;
  size_bytes: number;
  usage_count: number;
}

export interface BulkAcceptResult {
  accepted: number;
  failed: number;
  results: Array<{
    proposal_id: string;
    status: "accepted" | "failed";
    component_id?: string;
    error?: string;
  }>;
}

export interface ProjectComponentImportSession {
  id: string;
  scope: "component" | "project" | "all-projects" | "folder";
  project_id: string;
  project_ids: string[];
  project_revisions: Record<string, string>;
  source_revision: string;
  status: "queued" | "uploading" | "scanning" | "staged" | "failed";
  created_by: string;
  created_at: string;
  updated_at: string;
  error_message: string;
  proposal_count: number;
  selection: {
    component_uid?: string;
    reference?: string;
    schematic_uuid?: string;
    pcb_footprint_uuid?: string;
    snapshot_id?: string;
    display_name?: string;
  };
}

export interface LibraryFolderDiscoveryAssetCandidate {
  relative_path: string;
  size_bytes?: number;
  library?: string;
  name?: string;
}

export interface LibraryFolderDiscoveryComponent {
  id: string;
  symbol_name: string;
  library: string;
  metadata: {
    value: string;
    description: string;
    datasheet: string;
    manufacturer: string;
    manufacturer_part_number: string;
    fields: Record<string, string>;
  };
  symbol: { relative_path: string };
  footprint_reference: string;
  footprint: {
    status: "resolved" | "suggested" | "ambiguous" | "missing";
    selected: LibraryFolderDiscoveryAssetCandidate | null;
    candidates: LibraryFolderDiscoveryAssetCandidate[];
  };
  models: Array<{
    reference: string;
    status: "resolved" | "ambiguous" | "missing";
    candidates: LibraryFolderDiscoveryAssetCandidate[];
  }>;
  findings: Array<{ code: string; severity: "warning" | "error"; message: string }>;
  existing_component: {
    component_id: string;
    revision_id: string;
    version: number;
    name: string;
    manufacturer: string;
    manufacturer_part_number: string;
  } | null;
}

export interface LibraryFolderDiscovery {
  components: LibraryFolderDiscoveryComponent[];
  required_paths: string[];
  inventory_file_count: number;
  discovery_file_count: number;
  existing_component_count: number;
}

export type CatalogMetadataFieldType = "text" | "number" | "url" | "boolean" | "enum";

export interface CatalogMetadataField {
  id: string;
  key: string;
  label: string;
  description: string;
  group: "core" | "engineering" | "custom" | string;
  type: CatalogMetadataFieldType;
  unit: string;
  enum_values: string[];
  storage_kind: "column" | "extra";
  storage_key: string;
  built_in: boolean;
  required: boolean;
  display_order: number;
  archived: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogMetadataGridResponse extends PaginatedComponents {
  schema: string;
  fields: CatalogMetadataField[];
}

export interface CatalogMetadataGridPreferences {
  visible: string[];
  order: string[];
  widths: Record<string, number>;
  pinned: string[];
}

export interface CatalogMetadataBatchItem {
  id: string;
  component_id: string;
  expected_revision_id: string;
  name: string;
  mpn: string;
  patch: Record<string, string>;
  diff: Array<{ field: string; label: string; before: string; after: string }>;
  validation_status: "valid" | "invalid" | "noop" | "applied" | "conflict";
  error_message: string;
  applied_revision_id: string;
}

export interface CatalogMetadataBatch {
  id: string;
  source: "grid" | "csv";
  status: "ready" | "needs_fields" | "queued" | "running" | "completed" | "partial";
  schema_version: string;
  change_summary: string;
  unknown_fields: Array<{ key: string; label: string; description: string; type: CatalogMetadataFieldType; enum_values: string[] }>;
  created_by: string;
  total_items: number;
  valid_items: number;
  applied_items: number;
  failed_items: number;
  source_rows?: number;
  skipped_unchanged_rows?: number;
  created_at: string;
  updated_at: string;
  items: CatalogMetadataBatchItem[];
}

export interface PaginatedComponents {
  items: CatalogComponent[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface CatalogReleaseQueueResponse extends PaginatedComponents {
  summary: {
    qa_review: number;
    done: number;
    blocked: number;
  };
}

export interface SelectionRequiredResponse {
  mode: "selection_required";
  discovered_symbols?: string[];
  discovered_footprints?: string[];
}

export interface ImportCompletedResponse {
  mode?: "imported";
  discovered_symbols?: string[];
  selected_symbol?: string;
  discovered_footprints?: string[];
  selected_footprint?: string;
  component: CatalogComponent;
}
