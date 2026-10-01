/**
 * System Builder response shapes (docs/system-builder/CONTRACTS.md §7–§9).
 * Fields mirror the API exactly; restricted boards arrive with nulls and
 * `redacted: true` (§8.2), so every field a restricted board can hide is
 * nullable here.
 */

/** Rules that run only when a system opts in (CONTRACTS_P2 §8.4). */
export type OptionalRule = "SYS-V09";

export interface SystemSummary {
  id: string;
  kind: "system";
  name: string;
  description: string;
  folderId: string | null;
  version: number;
  etag: string;
  /** Board instances only (P2): subsystems are counted in `subsystemCount`. */
  instanceCount: number;
  subsystemCount?: number;
  openReviewCount: number;
  /** The catalog `assembly` this system publishes to, bound on first publish (CONTRACTS_P2 §3.3). */
  catalogComponentId?: string | null;
  /** Opt-in validation rules this system runs (CONTRACTS_P2 §8.4); absent before P2-1.10. */
  optionalRules?: OptionalRule[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type InterfaceStatus = "ready" | "pending" | "failed";

export interface InstanceInterfaceState {
  status: InterfaceStatus;
  digest: string | null;
  hasPcb: boolean | null;
  jobId: string | null;
  errorCode: string | null;
}

export interface SystemPort {
  portKey: string;
  memberKeys: string[];
  reference: string;
  libId: string | null;
  footprint: string | null;
  value: string | null;
  dnp: boolean;
  candidate: boolean;
  candidateReason: string | null;
  override: "hidden" | "promoted" | null;
  exposed: boolean;
  pinCount: number;
}

export interface SystemInstance {
  id: string;
  label: string;
  restricted: boolean;
  redacted?: boolean;
  projectId: string | null;
  projectName: string | null;
  /** The board's project was deleted; a designer can still remove it from the system. */
  projectDeleted?: boolean;
  baselineCommit: string | null;
  trackedRef: string | null;
  pinned: boolean;
  resolution: "resolved" | "unresolved";
  tipCommit: string | null;
  tipCheckedAt: string | null;
  updateAvailable: boolean | null;
  interface: InstanceInterfaceState | null;
  /** For an assembly, its exports: `portKey` is the export ID (CONTRACTS_P2 §5.1). */
  ports: SystemPort[] | null;
  /** `board` when absent (documents from before P2). */
  kind?: "board" | "assembly" | "module";
  /** Set for assembly and module instances. */
  catalog?: InstanceCatalogRef;
}

export interface InstanceCatalogRef {
  componentId: string;
  revisionId: string;
  follow: "pinned" | "latest_released";
  version: number | null;
  releaseStatus: string | null;
  identity: string | null;
  latestReleasedRevisionId: string | null;
  /** The child system the revision was published from, and its snapshot. */
  systemId: string | null;
  snapshotName: string | null;
}

export interface PortBaseline {
  portKey: string;
  memberKeys: string[];
  reference: string;
  libId: string | null;
  footprint: string | null;
  pinCount: number;
}

export interface LinkEnd {
  instanceId: string;
  redacted: boolean;
  port: PortBaseline | null;
  resolved: boolean | null;
  exposed: boolean | null;
  /** An end on a subsystem export: where it lands inside the child (CONTRACTS_P2 §6.1). */
  export?: { name: string; reference: string | null; occurrence: string | null; description: string } | null;
  /** The port's stored mating frame (CONTRACTS_P2 §15.2); absent in documents from before SB2-19. */
  mating?: { mode: "confirmed" | "override"; axis: MatingAxis; quarterTurns: number } | null;
}

export interface PinObservation {
  present: boolean;
  nets: string[] | null;
  pcbNets: string[] | null;
  pinNames: string[] | null;
  pinTypes: string[] | null;
}

export type RowSource = "manual" | "generator" | "import";

export interface LinkRow {
  id: string;
  pinA: string | null;
  pinB: string | null;
  signal: string;
  source: RowSource;
  netA: string[] | null;
  netB: string[] | null;
  observedA: PinObservation | null;
  observedB: PinObservation | null;
  redacted: boolean;
  redactedEnds: ("a" | "b")[];
}

/** CONTRACTS_P2 §16: P1 links are `unspecified`. */
export type LinkType = "unspecified" | "b2b";

export interface SystemLink {
  id: string;
  name: string;
  harness: string | null;
  /** Absent in documents frozen before link types existed. */
  type?: LinkType;
  /** `b2b` only: the mated pair's stack height from the datasheet (§16.2). */
  stackHeightMm?: number | null;
  updatedAt: string;
  a: LinkEnd;
  b: LinkEnd;
  rows: LinkRow[];
}

export interface FindingCounts {
  error: number;
  warning: number;
  info: number;
  notEvaluated: number;
}

/** A connector this system publishes to parent systems (CONTRACTS_P2 §4). */
export interface SystemExport {
  id: string;
  name: string;
  description: string;
  instanceId: string;
  /** Null for a re-export or when the board is restricted. */
  portKey: string | null;
  port: PortBaseline | null;
  childExportId: string | null;
  /** False: the connector is gone or no longer exposed (SYS-V16). Null: not evaluated or restricted. */
  resolved: boolean | null;
  redacted: boolean;
  updatedAt: string;
}

/** A harness end's mating block and what it mates (CONTRACTS_P2 §17.2). */
export interface HarnessEnd {
  id: string;
  ordinal: number;
  mates: {
    instanceId: string;
    portKey: string | null;
    port: { portKey: string; reference: string; libId: string | null; footprint: string | null; pinCount: number } | null;
    resolved: boolean | null;
    redacted: boolean;
  } | null;
  /** The block's catalog part, with its name and MPN as they were at assignment; null = Generic. */
  part: { componentId: string; revisionId: string; name?: string | null; mpn?: string | null; manufacturer?: string | null } | null;
  pinCount: number;
  pinMap: Record<string, string> | null;
  bootMm: number | null;
  /** End pin names: the part's pins when a part is assigned, else the mated connector's pads, else `1…pinCount`. */
  pins: string[];
  /** The mated connector's pads, which the pin map targets (SB2-18); empty while unmated. */
  matePads: string[];
}

export interface HarnessWire {
  id: string;
  from: { end: string; pin: string };
  to: { end: string; pin: string };
  signal: string;
  gaugeAwg: number | null;
  colour: string | null;
  label: string | null;
  netFrom: string[] | null;
  netTo: string[] | null;
  redactedEnds: ("from" | "to")[];
}

export interface SystemHarness {
  id: string;
  name: string;
  label: string | null;
  cutLengthMm: number | null;
  serviceAllowancePct: number | null;
  /** Two mated ends, no splices, identity pin maps: it can become a link (§16.1). */
  linkable: boolean;
  ends: HarnessEnd[];
  wires: HarnessWire[];
  updatedAt: string;
}

export interface SystemDocument {
  system: SystemSummary;
  instances: SystemInstance[];
  links: SystemLink[];
  /** Absent in documents frozen before harness objects existed. */
  harnesses?: SystemHarness[];
  /** Absent in documents frozen before exports existed. */
  exports?: SystemExport[];
  openReviewCount: number;
  findingCounts: FindingCounts | null;
}

/** A component from `GET …/interface`: artifact facts plus exposure, with pins instead of a count. */
export interface InstanceComponent extends Omit<SystemPort, "pinCount"> {
  pins: { pad: string; nets: string[]; pcbNets?: string[] | null; pinNames?: string[] | null; pinTypes?: string[] | null }[];
}

/** `GET …/instances/{iid}/interface`: the artifact (§3) plus exposure. */
export interface InstanceInterface {
  instanceId: string;
  atBaseline: boolean;
  projectId: string;
  commit: string;
  digest: string;
  hasPcb: boolean;
  components: InstanceComponent[];
}

// Validation (§7.2)

export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  name: string;
  severity: Severity;
  instanceId: string | null;
  linkId: string | null;
  rowId: string | null;
  end: "a" | "b" | null;
  reference: string | null;
  pin: string | null;
  detail: Record<string, unknown> | null;
  redacted: boolean;
}

export interface ValidationReport {
  findings: Finding[];
  notEvaluated: { rule: string; instanceId: string; reason: string }[];
  exempt: {
    rule: string;
    instanceId: string;
    portKey: string | null;
    reference: string | null;
    pin: string | null;
    links: string[];
    harness: string;
    redacted?: boolean;
  }[];
  counts: FindingCounts;
}

// Reviews (§7.1, §8.4)

export type ReviewKind = "source_update" | "baseline_unreachable" | "import" | "child_update";
export type ReviewStatus = "open" | "applied" | "kept_pinned" | "superseded" | "closed";
export type Decision = "accept" | "remap" | "bind_candidate" | "remove_rows";
export type ReviewItemKind = "connector_missing" | "connector_changed" | "pin_missing" | "net_changed" | "signal_mismatch";

export interface RebindCandidate {
  portKey: string;
  reference: string;
  referenceEqual: boolean;
  libIdEqual: boolean;
  pinCountEqual: boolean;
  netOverlap: number;
}

export interface ReviewItem {
  id: string;
  ordinal: number;
  kind: ReviewItemKind;
  linkId: string | null;
  end: "a" | "b" | null;
  rowIds: string[];
  pins: string[];
  expected: unknown;
  observed: unknown;
  candidates: RebindCandidate[] | null;
  decision: Decision | null;
  decisionPayload: Record<string, unknown> | null;
  redacted?: boolean;
}

export interface Review {
  id: string;
  kind: ReviewKind;
  status: ReviewStatus;
  instanceId: string | null;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  redacted: boolean;
  fromCommit: string | null;
  toCommit: string | null;
  pendingChanges: {
    portUpdates?: { linkId: string; end: "a" | "b"; port: PortBaseline }[];
    silent?: { kind: string; linkId: string; end: "a" | "b"; via?: string; before?: unknown; after?: unknown }[];
  } | null;
  items: ReviewItem[] | null;
}

// History (§8.4)

export interface AuditEvent {
  seq: number;
  id: string;
  at: string;
  actor: string;
  kind: string;
  payload: Record<string, unknown> | null;
  redacted: boolean;
}

export interface HistoryPage {
  events: AuditEvent[];
  nextCursor: number | null;
}

// Snapshots (§9.1)

export interface SnapshotMeta {
  id: string;
  name: string;
  note: string;
  createdBy: string;
  createdAt: string;
  digest: string;
  /** Manifest connectivity digest; null for snapshots taken before manifests (P2 §9.4). */
  connectivityDigest?: string | null;
  manifestSchema?: string | null;
  openReviewCount: number;
  rendererVersion: string;
  /** The catalog revision this snapshot was published as, if any. */
  publication?: SnapshotPublication | null;
}

export interface SnapshotPublication {
  componentId: string;
  revisionId: string;
  version: number | null;
  releaseStatus: string | null;
}

export interface Snapshot extends SnapshotMeta {
  document: SystemDocument & { validation: ValidationReport; reviewRowIds: string[] };
}

export interface RowFields {
  pinA: string | null;
  pinB: string | null;
  signal: string;
  netA: string[] | null;
  netB: string[] | null;
}

export interface SnapshotDiff {
  snapshotId: string;
  against: string;
  boards: { instanceId: string; label: string; status: "added" | "removed" | "rebased"; before: string | null; after: string | null }[];
  links: {
    linkId: string;
    name: string;
    status: "added" | "removed" | "changed";
    rows: { added: LinkRow[]; removed: LinkRow[]; changed: { id: string; before: RowFields; after: RowFields }[] };
  }[];
}

// CSV import (§9.3)

export type ImportTarget =
  | "from_board" | "from_connector" | "from_pin" | "to_board" | "to_connector" | "to_pin"
  | "signal" | "harness" | "link_name" | "row_id"
  // Harness wires (CONTRACTS_P2 §17.4)
  | "from_end" | "from_end_pin" | "to_end" | "to_end_pin" | "gauge_awg" | "colour" | "wire_label";
export type ImportBucket = "matched" | "needsReview" | "unresolved" | "conflict";

export interface ImportUpload {
  importId: string;
  filename: string;
  delimiter: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, string>[];
  suggestedColumnMap: Partial<Record<ImportTarget, string>>;
  boardValues: Record<string, string[]>;
}

export interface ImportEnd {
  instanceId: string;
  label: string;
  reference: string;
  portKey: string;
  exposed: boolean;
  pin: string;
  pinNames: string[] | null;
  nets: string[];
}

export interface ImportEntry {
  line: number;
  values: Record<ImportTarget, string>;
  reason: string | null;
  from: ImportEnd | null;
  to: ImportEnd | null;
  signal: string;
  harness: string | null;
  linkName: string;
  linkId: string | null;
  rowId: string | null;
  action: "create" | "update" | null;
  /** A harness wire (§17.4): `linkName` is the harness, `linkId` its ID once it exists; ends by position. */
  kind?: "wire";
  fromEnd?: number | null;
  fromPin?: string;
  toEnd?: number | null;
  toPin?: string;
}

export interface ImportPreview extends Record<ImportBucket, ImportEntry[]> {
  importId: string;
  committed: boolean;
  counts: Record<ImportBucket, number>;
}

export interface ImportCommitReport {
  importId: string;
  created: number;
  updated: number;
  unchanged: number;
  linksCreated: string[];
  harnessesCreated?: string[];
  reviewId: string | null;
  counts: Record<ImportBucket, number>;
  unresolved: ImportEntry[];
  conflict: ImportEntry[];
}

// Generators (§8.5)

export type GeneratorKind = "identity" | "reverse" | "offset" | "net_name";

export interface GeneratedRow {
  pinA: string;
  pinB: string;
  signal: string;
  source: "generator";
  netA: string[];
  netB: string[];
  pinNamesA: string[] | null;
  pinNamesB: string[] | null;
}

export interface GeneratorResult {
  linkId: string;
  generator: GeneratorKind;
  rows: GeneratedRow[];
  skipped: { pinA: string; pinB: string; reason: "existing" | "unconnected" }[];
}

/** `GET …/hierarchy` (CONTRACTS_P2 §11): every occurrence, redacted for the reader. */
export interface SystemOccurrence {
  path: string;
  displayPath: string;
  labels: string[];
  instanceId: string;
  kind: "board" | "assembly" | "module";
  depth: number;
  systemId: string;
  projectId: string | null;
  baselineCommit: string | null;
  componentId: string | null;
  revisionId: string | null;
  childSystemId: string | null;
  childSnapshotId: string | null;
  unresolved: boolean;
  restricted: boolean;
}

export interface SystemHierarchy {
  systemId: string;
  occurrences: SystemOccurrence[];
  boardCount: number;
}

/** `GET …/scene` → `prism.system_scene.a0` (CONTRACTS_P2 §20). Lengths in mm; matrices column-major. */
export interface SystemSceneAsset {
  assetId: string;
  projectId: string;
  commit: string;
  status: "ready" | "building" | "missing" | "failed";
  bundleUrl: string | null;
  sourceRevisionKey: string | null;
  generatorBuild: string | null;
  jobId: string | null;
  error: string | null;
  bundleToBoard: number[] | null;
}

export interface SystemSceneOccurrence {
  path: string;
  parentPath: string | null;
  displayPath: string;
  labels: string[];
  instanceId: string;
  kind: "board" | "assembly" | string;
  depth: number;
  restricted: boolean;
  assetId: string | null;
  pose: { translationMm: number[]; rotation: number[]; source: "default" | "manual" | "auto" };
  worldMatrix: number[];
  boundsMm: { minMm: number[]; maxMm: number[] } | null;
}

/** A stored pose (CONTRACTS_P2 §14.3); an instance without one takes its default pose. */
export interface StoredPose {
  instanceId: string;
  translationMm: [number, number, number];
  rotation: [number, number, number, number];
  source: "manual" | "auto" | "default";
  updatedBy: string;
  updatedAt: string;
}

export interface SystemPoses {
  systemId: string;
  version: number;
  poses: StoredPose[];
}

export interface SystemScene {
  schema: "prism.system_scene.a0";
  systemId: string;
  systemVersion: number;
  units: "mm";
  assets: SystemSceneAsset[];
  occurrences: SystemSceneOccurrence[];
}

/** `GET …/instances/{iid}/mating` (CONTRACTS_P2 §15.3). */
export type MatingAxis = "top" | "bottom" | "+x" | "-x" | "+y" | "-y";

export interface PortMating {
  portKey: string;
  reference: string;
  footprint: string;
  hasGeometry: boolean;
  inferred: { axis: MatingAxis | null; confidence: "high" | "medium" | "low"; reasons: string[] };
  stored: { mode: "confirmed" | "override"; axis: MatingAxis; quarterTurns: number; stale: boolean } | null;
}

export interface InstanceMating {
  instanceId: string;
  boardThicknessMm: number | null;
  ports: PortMating[];
}
