import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Wavenumber.KicadMonkey.Contracts.MaterializationA0;

/**
 * Board-frame length in integer nanometres. The range matches KiCad's own
 * 32-bit internal-unit limit, so the packed encoding stores it losslessly.
 */
scalar Nm extends int32;

/** Non-negative length in integer nanometres. */
@minValue(0)
scalar NonNegativeNm extends int32;

/** Point in KiCad's board frame: X to the right, Y down, in nanometres. */
@minItems(2)
@maxItems(2)
model NmPoint is Array<Nm>;

/** Axis-aligned bounds in the board frame, inclusive. */
model NmBounds {
  min_x_nm: Nm;
  min_y_nm: Nm;
  max_x_nm: Nm;
  max_y_nm: Nm;
}

/**
 * One fully composed local-to-board transform. A shape's local coordinates
 * map to board coordinates as x' = m11*x + m12*y + tx_nm and
 * y' = m21*x + m22*y + ty_nm. Reflection, rotation, and non-uniform scale are
 * ordinary cases of the same matrix.
 */
model Affine2D {
  m11: float64;
  m12: float64;
  m21: float64;
  m22: float64;
  tx_nm: Nm;
  ty_nm: Nm;
}

// ---------------------------------------------------------------- shapes

/** Straight path segment to `end_nm`. */
model LineSegment {
  kind: "line";
  end_nm: NmPoint;
}

/** Circular arc segment through `mid_nm` to `end_nm`, the form KiCad stores. */
model ArcSegment {
  kind: "arc";
  mid_nm: NmPoint;
  end_nm: NmPoint;
}

/**
 * Cubic Bézier segment from the previous point through two control points
 * to `end_nm`, the form KiCad stores for curves.
 */
model CubicSegment {
  kind: "cubic";
  control1_nm: NmPoint;
  control2_nm: NmPoint;
  end_nm: NmPoint;
}

union PathSegment {
  line: LineSegment,
  arc: ArcSegment,
  cubic: CubicSegment,
}

/**
 * Closed contour of line, arc, and cubic segments starting at `start_nm`.
 * When the last segment does not end at `start_nm`, a straight closing
 * segment back to it is implied.
 */
model Contour {
  start_nm: NmPoint;
  @minItems(1) segments: PathSegment[];
}

enum PathCap {
  round,
  flat,
}

enum PathJoin {
  round,
  miter,
}

enum RectCorner {
  top_left,
  top_right,
  bottom_left,
  bottom_right,
}

model Disk2d {
  kind: "disk_2d";
  center_nm: NmPoint;
  radius_nm: NonNegativeNm;
}

model Rect2d {
  kind: "rect_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
}

model RoundedRect2d {
  kind: "rounded_rect_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
  radius_nm: NonNegativeNm;
}

/** Rectangle with the listed corners chamfered; unlisted corners keep `radius_nm`. */
model ChamferedRect2d {
  kind: "chamfered_rect_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
  chamfer_nm: NonNegativeNm;
  chamfered_corners: RectCorner[];
  radius_nm: NonNegativeNm;
}

/** KiCad trapezoid: a rectangle whose opposite edges are widened or narrowed by the deltas. */
model Trapezoid2d {
  kind: "trapezoid_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
  delta_x_nm: Nm;
  delta_y_nm: Nm;
}

/** Stadium between two centres with a common radius. */
model Capsule2d {
  kind: "capsule_2d";
  start_nm: NmPoint;
  end_nm: NmPoint;
  radius_nm: NonNegativeNm;
}

model Annulus2d {
  kind: "annulus_2d";
  center_nm: NmPoint;
  outer_radius_nm: NonNegativeNm;
  inner_radius_nm: NonNegativeNm;
}

/** Open centreline of line, arc, and cubic segments swept by a constant width. */
model SweptPath2d {
  kind: "swept_path_2d";
  start_nm: NmPoint;
  @minItems(1) segments: PathSegment[];
  width_nm: NonNegativeNm;
  cap: PathCap;
  join: PathJoin;
}

/** One analytic outer contour with optional hole contours. */
model PlanarRegion2d {
  kind: "planar_region_2d";
  outer: Contour;
  holes: Contour[];
}

/** Closed analytic shape vocabulary. Lowering is a consumer operation. */
union Shape2d {
  disk_2d: Disk2d,
  rect_2d: Rect2d,
  rounded_rect_2d: RoundedRect2d,
  chamfered_rect_2d: ChamferedRect2d,
  trapezoid_2d: Trapezoid2d,
  capsule_2d: Capsule2d,
  annulus_2d: Annulus2d,
  swept_path_2d: SweptPath2d,
  planar_region_2d: PlanarRegion2d,
}

// ---------------------------------------------------------------- stack

/**
 * Selectable products. Every operation belongs to exactly one product. The
 * board profile has no product of its own: it is the add operation of every
 * dielectric and solder-mask slice, with cutouts subtracted there.
 */
enum MaterialProduct {
  copper,
  holes,
  dielectric,
  solder_mask,
  paste,
  silkscreen,
  components,
}

/**
 * Physical role of a slice. `coverlay`, `adhesive`, and `stiffener` occur
 * only in flexible or stiffened stack regions.
 */
enum SliceRole {
  conductor,
  dielectric,
  solder_mask,
  paste,
  silkscreen,
  coverlay,
  adhesive,
  stiffener,
}

enum BoardSide {
  front,
  back,
}

/**
 * How a dielectric slice is built: a cured `core` laminate or a `prepreg`
 * bonding ply (KiCad's stackup layer `type`).
 */
enum DielectricKind {
  core,
  prepreg,
}

/**
 * One physical slice of the rigid board stack. `order` is zero at the front
 * outermost slice and increases toward the back. Z positions are derived
 * from the ordered thicknesses and are never stored. Absent values are
 * unknown, never defaulted.
 */
model StackSlice {
  key: string;
  role: SliceRole;
  order: uint32;
  kicad_layer?: string;
  side?: BoardSide;
  thickness_nm?: NonNegativeNm;
  material_name?: string;
  relative_permittivity?: float64;
  loss_tangent?: float64;
  /** A dielectric's construction, when the stackup states it. */
  dielectric_kind?: DielectricKind;
}

enum StackRegionKind {
  rigid,
  flex,
}

/** Fold line of a flexible region, for 3D views; flat analyses ignore it. */
model BendLine {
  start_nm: NmPoint;
  end_nm: NmPoint;
  radius_nm: NonNegativeNm;
  angle_deg: float64;
}

/**
 * Part of the board with its own build-up. `slice_keys` lists the slices
 * present there in stack order. A slice that only one region lists exists
 * only in that region. Without `boundary` the region is the whole board
 * profile. A rigid board has exactly one rigid region holding every slice.
 */
model StackRegion {
  key: string;
  kind: StackRegionKind;
  @minItems(1) slice_keys: string[];
  boundary?: PlanarRegion2d[];
  bend_lines: BendLine[];
}

model Stack {
  slices: StackSlice[];
  @minItems(1) regions: StackRegion[];
  board_thickness_nm?: NonNegativeNm;
  copper_finish?: string;
  /** KiCad's board-level impedance-control flag (`dielectric_constraints`). */
  impedance_controlled?: boolean;
  /**
   * KiCad's board-level plated-edge flag (`edge_plating`). KiCad stores no
   * plated-edge geometry; fabrication plates the profile.
   */
  edge_plating?: boolean;
}

// ---------------------------------------------------------------- nets

/** Resolved electrical net. The empty key is the no-net assignment. */
model Net {
  key: string;
  name: string;
  net_class?: string;
}

/**
 * Effective design rules of a KiCad net class. A net matched by several
 * classes gets a composite class: `constituents` are the matched classes by
 * priority, with `Default` last when it supplied a value, `name` joins them
 * with commas, and each rule comes from the first constituent that sets it.
 * A single class lists only itself.
 */
model NetClass {
  name: string;
  @minItems(1) constituents: string[];
  track_width_nm?: NonNegativeNm;
  clearance_nm?: NonNegativeNm;
  diff_pair_width_nm?: NonNegativeNm;
  diff_pair_gap_nm?: NonNegativeNm;
  diff_pair_via_gap_nm?: NonNegativeNm;
  via_diameter_nm?: NonNegativeNm;
  via_drill_nm?: NonNegativeNm;
  microvia_diameter_nm?: NonNegativeNm;
  microvia_drill_nm?: NonNegativeNm;
}

/**
 * Two nets paired by KiCad's suffix rule: after any trailing digits and
 * underscores, `+` or `P` marks the positive net and `-` or `N` the
 * negative one, and both nets exist.
 */
model DiffPair {
  base_name: string;
  positive_net_key: string;
  negative_net_key: string;
}

// ---------------------------------------------------------------- operations

enum MaterialAction {
  add,
  subtract,
}

enum SurfaceMaterial {
  copper,
  dielectric,
  solder_mask,
  paste,
  silkscreen,
}

/**
 * Add or remove one shape of material on one slice whose role matches the
 * material (copper on conductor slices, and so on). Conductive material
 * always carries `net_key`; operations on different nets are never merged.
 *
 * Operations combine without regard to order. Per slice and material
 * (and per net for conductive material), operations that share a
 * `group_key` form one item whose subtracts remove only that item's own
 * adds; the material is then the union of the ungrouped adds and every
 * group's result, minus the union of the ungrouped subtracts.
 */
model SurfaceOperation {
  kind: "surface";
  index: uint32;
  action: MaterialAction;
  material: SurfaceMaterial;
  slice_key: string;
  net_key?: string;
  shape: Shape2d;

  /**
   * Signed offset of `shape` in its local frame, before `affine`: the
   * Minkowski sum with a disk of this radius when positive, or the erosion
   * by it when negative, with round corners. It is present only where the
   * offset shape has no closed form in this vocabulary: KiCad's polygonal
   * inflation of trapezoid, chamfered, and custom pad openings, and the
   * mask opening of a copper graphic grown by its margin. Never zero.
   */
  offset_nm?: Nm;

  /**
   * Item that this operation's subtracts are confined to, such as one
   * knockout text whose glyph strokes are cut from its own box. It is the
   * item's source UID, so it survives filtering unchanged.
   */
  group_key?: string;

  affine: Affine2D;

  /** Board-frame bounds holding the whole shape after `affine` and any growing offset. */
  bounds: NmBounds;
}

enum HolePlating {
  plated,
  unplated,
}

/** KiCad's tri-state for a protection option: set, cleared, or left to the board default. */
enum ProtectionState {
  yes,
  no,
  unspecified,
}

model SideProtection {
  tented: ProtectionState;
  covered: ProtectionState;
  plugged: ProtectionState;
}

model HoleProtection {
  front: SideProtection;
  back: SideProtection;
  filled: ProtectionState;
  capped: ProtectionState;
}

enum PostMachiningMode {
  counterbore,
  countersink,
}

/**
 * Counterbore or countersink machined from one side. A countersink's
 * `angle_deg` is the full included cone angle. Without `depth_nm`, a
 * countersink runs to its cone apex.
 */
model PostMachining {
  side: BoardSide;
  mode: PostMachiningMode;
  diameter_nm?: NonNegativeNm;
  depth_nm?: NonNegativeNm;
  angle_deg?: float64;
}

/** Controlled-depth removal of barrel plating from one side. */
model Backdrill {
  side: BoardSide;
  diameter_nm?: NonNegativeNm;
  until_slice_key?: string;
}

/**
 * Drilled or milled hole spanning the conductor slices `start_slice_key` to
 * `end_slice_key` inclusive, in either order.
 */
model HoleOperation {
  kind: "hole";
  index: uint32;
  shape: Shape2d;
  affine: Affine2D;
  plating: HolePlating;
  start_slice_key: string;
  end_slice_key: string;
  net_key?: string;
  plating_thickness_nm?: NonNegativeNm;
  protection?: HoleProtection;
  backdrills: Backdrill[];
  post_machining: PostMachining[];
  /** The hole belongs to a castellated pad, cut by the board edge in fabrication. */
  castellated?: boolean;
  bounds: NmBounds;
}

union MaterialOperation {
  surface: SurfaceOperation,
  hole: HoleOperation,
}

// ---------------------------------------------------------------- components and binding

/** Pad numbers of one footprint that KiCad connects as a group. */
model PadGroup {
  @minItems(1) pad_numbers: string[];
}

model Component {
  refdes: string;
  footprint: string;
  side: BoardSide;
  affine: Affine2D;
  source_uid: string;
  /** Body extent in footprint-local coordinates, from courtyard or fabrication outline. */
  body_bounds?: NmBounds;
  body_height_nm?: NonNegativeNm;
  /** Net-tie pad groups: copper in the footprint may join these pads' nets. */
  net_tie_groups: PadGroup[];
  /** Jumper pad groups, connected inside the part without board copper. */
  jumper_groups: PadGroup[];
}

enum BindingSourceKind {
  track,
  track_arc,
  via,
  pad,
  zone_fill,
  board_graphic,
  footprint_graphic,
  board_text,
  footprint_text,
  profile,
  derived,
}

/**
 * Links one operation to the KiCad object that produced it. Required for
 * simulation and picking; geometry consumers may ignore it.
 */
model BindingEntry {
  operation_index: uint32;
  source_kind: BindingSourceKind;
  source_uid: string;
  refdes?: string;
  pad_number?: string;
  net_key?: string;
  /**
   * Nets a net-tie bridge joins: the nets of the net-tie pads its copper
   * touches. The nets stay separate; consumers decide whether to join them.
   */
  tied_net_keys?: string[];
  /** Pad-to-die length of the pad's pin. */
  die_length_nm?: NonNegativeNm;
  /** Pad-to-die delay of the pad's pin, in picoseconds. */
  die_delay_ps?: float64;
}

// ---------------------------------------------------------------- scope, chunks, document

/**
 * What a document holds. It is canonical: products are distinct and in
 * `MaterialProduct` declaration order, and slice and net keys are distinct
 * and sorted by byte value. Every operation, component, and product-tagged
 * diagnostic lies within it: a named product, a listed slice (a hole spans
 * one), a listed net, and bounds meeting `region`.
 */
model MaterializationScope {
  products: MaterialProduct[];
  /** Absent means every slice. */
  slice_keys?: string[];
  /** Absent means every net. */
  net_keys?: string[];
  region?: NmBounds;
  tile_size_nm: NonNegativeNm;
  /** True exactly when every product is named and there is no slice, net, or region filter. */
  complete: boolean;
}

/**
 * Operations of one (slice, tile) occupy a contiguous index range. An
 * operation belongs to the tile containing the centre of its bounds (floor
 * division by `tile_size_nm`); the chunk bounds cover every operation in it.
 * Chunks are non-empty, start at operation 0, follow each other without
 * gaps, and are ordered by slice order, tile row, then tile column.
 * `net_keys` are the distinct nets of the chunk's operations, sorted.
 */
model ChunkEntry {
  slice_key: string;
  tile_x: int32;
  tile_y: int32;
  bounds: NmBounds;
  net_keys: string[];
  first_operation_index: uint32;
  operation_count: uint32;
}

enum DiagnosticSeverity {
  info,
  warning,
  error,
}

/** A finding of the producer. `product` scopes it so selective results filter it like operations. */
model MaterializationDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  product?: MaterialProduct;
  source_uid?: string;
}

model MaterializationProducer {
  name: string;
  version: string;
}

/**
 * The board file, and the project file when one was given: net classes come
 * only from the project.
 */
model MaterializationSource {
  sha256: string;
  source_bytes: uint64;
  project_sha256?: string;
  project_bytes?: uint64;
}

model MaterializationCoordinateSystem {
  unit: "nm";
  x_axis: "board_right";
  y_axis: "board_down";
}

// ---------------------------------------------------------------- design facts (a1)

/**
 * How copper joins the zone fills of its net: KiCad's `ZONE_CONNECTION`.
 * A zone's `(connect_pads)` without a mode is `thermal_reliefs`; `yes` and
 * `full` are `solid`, `no` is `none`. A pad's `(zone_connect N)` is 0
 * `none`, 1 `thermal_reliefs`, 2 `solid`, 3 `thru_hole_only`.
 */
enum PadConnection {
  none,
  thermal_reliefs,
  solid,
  /** Thermal reliefs for plated through-hole pads, solid for the rest. */
  thru_hole_only,
}

/**
 * KiCad's island removal (`island_removal_mode`): 0 `always`, 1 `never`,
 * 2 `below_area` (islands smaller than `island_min_area_mm2`). Without the
 * token KiCad removes every island.
 */
enum IslandRemoval {
  always,
  `never`,
  below_area,
}

/** Corner smoothing KiCad applies to a zone's fill (`smoothing`). */
enum CornerSmoothing {
  chamfer,
  fillet,
}

/**
 * Hatched fill (`(mode hatch)`). Absent values are not in the file; KiCad's
 * defaults then apply.
 */
model ZoneHatchFill {
  thickness_nm?: NonNegativeNm;
  gap_nm?: NonNegativeNm;
  orientation_deg?: float64;
}

/**
 * Fill rules of a copper zone, as KiCad's zone filler reads them. Values
 * KiCad's parser defaults when the file omits them carry that default.
 */
model ZoneFillRules {
  /** Zone-to-other-net clearance (`connect_pads (clearance)`). */
  clearance_nm: NonNegativeNm;
  /** Minimum fill width (`min_thickness`). */
  min_width_nm: NonNegativeNm;
  pad_connection: PadConnection;
  thermal_gap_nm: NonNegativeNm;
  /** Thermal spoke width (`thermal_bridge_width`). */
  thermal_spoke_width_nm: NonNegativeNm;
  island_removal: IslandRemoval;
  /** Island area threshold as written, in mm². */
  island_min_area_mm2?: float64;
  corner_smoothing?: CornerSmoothing;
  corner_radius_nm?: NonNegativeNm;
  /** Present when the zone fills with a hatch instead of solid copper. */
  hatch?: ZoneHatchFill;
}

/** What a rule area forbids: each flag is true where KiCad's keep-out says `not_allowed`. */
model RuleAreaKeepouts {
  tracks: boolean;
  vias: boolean;
  pads: boolean;
  copper_pour: boolean;
  footprints: boolean;
}

/**
 * One zone or rule area on copper, as drawn. `outline` is the authored
 * outline in the board frame with its arcs: KiCad reads the first
 * `(polygon)` as the outline and later ones as holes in it. Exactly one of
 * `fill` (a copper zone) and `keepout` (a rule area) is present.
 */
model ZoneFacts {
  /** The zone's binding `source_uid`: its UUID, or `zone@<offset>` when the UUID is nil or repeats an earlier zone's. */
  source_uid: string;
  name?: string;
  /** Absent for no net. */
  net_key?: string;
  /** The owning footprint's component `source_uid`, for a footprint's rule area. */
  footprint_source_uid?: string;
  /** Conductor slices of the zone's copper layers, in stack order. */
  @minItems(1) slice_keys: string[];
  priority: uint32;
  outline: PlanarRegion2d;
  fill?: ZoneFillRules;
  keepout?: RuleAreaKeepouts;
}

/**
 * Zone rules a padstack layer sets for itself (`(padstack (layer ...))`).
 * `kicad_layer` is the selector as written: a copper layer name, or `Inner`
 * for every inner layer in KiCad's front/inner/back mode.
 */
model PadstackLayerRules {
  kicad_layer: string;
  clearance_nm?: NonNegativeNm;
  pad_connection?: PadConnection;
  thermal_gap_nm?: NonNegativeNm;
  thermal_spoke_width_nm?: NonNegativeNm;
  thermal_spoke_angle_deg?: float64;
}

/**
 * A pad's own zone rules, keyed by the pad's binding `source_uid`. A value
 * is present only when the pad sets it instead of inheriting it; a pad that
 * sets nothing has no record.
 */
model PadRules {
  source_uid: string;
  clearance_nm?: NonNegativeNm;
  pad_connection?: PadConnection;
  thermal_gap_nm?: NonNegativeNm;
  thermal_spoke_width_nm?: NonNegativeNm;
  thermal_spoke_angle_deg?: float64;
  /** Padstack layers that set a rule, in file order. */
  layers: PadstackLayerRules[];
}

/**
 * A footprint's zone rules for its pads, keyed by the component's
 * `source_uid`. Present only for values it sets; a footprint that sets
 * nothing has no record.
 */
model FootprintRules {
  source_uid: string;
  clearance_nm?: NonNegativeNm;
  pad_connection?: PadConnection;
  thermal_gap_nm?: NonNegativeNm;
  thermal_spoke_width_nm?: NonNegativeNm;
}

/**
 * A component's courtyard on one side, closed as KiCad closes it, in the
 * board frame: the graphics on `F.CrtYd` (front) or `B.CrtYd` (back),
 * chained end to end within 0.01 mm.
 */
model Courtyard {
  /** The component's `source_uid`. */
  source_uid: string;
  side: BoardSide;
  @minItems(1) regions: PlanarRegion2d[];
}

/** One pad of a footprint, as the board file lists it. */
model FootprintPad {
  /** The pad's binding `source_uid` (its UUID, or `pad@<offset>`). */
  source_uid: string;
  /** Pad number as written; may be empty (a mounting hole). */
  number: string;
  /** Absent for no net. */
  net_key?: string;
}

/**
 * A footprint's pads in board file order, whatever the scope and whether or
 * not a pad has copper. The order decides which of several pads with one
 * number is the part's pin (the first), which operation order cannot.
 */
model FootprintPads {
  /** The component's `source_uid`. */
  source_uid: string;
  @minItems(1) pads: FootprintPad[];
}

/**
 * Design rules and regions that are not material: they draw nothing and
 * are not operations. Board facts like `nets`: every document of a board
 * holds all of them whatever its scope. Arrays are in file order.
 */
model DesignFacts {
  /** KiCad's arc-approximation error (`max_error`) from the project file. */
  max_error_nm?: NonNegativeNm;
  /** Minimum copper-to-board-edge clearance (`min_copper_edge_clearance`) from the project file. */
  copper_edge_clearance_nm?: NonNegativeNm;
  zones: ZoneFacts[];
  pad_rules: PadRules[];
  footprint_rules: FootprintRules[];
  /** By component in file order, front before back. */
  courtyards: Courtyard[];  /** By component in file order; footprints without pads are left out. */
  footprint_pads: FootprintPads[];
}

/** Resource-bounded materialization request. Source bytes are out of band. */
@jsonSchema
@id("urn:wavenumber:schema:kicad_monkey.materialization.request:a0")
@extension("title", "Materialization request a0")
model MaterializationRequest {
  type: "kicad_monkey.materialization.request";
  version: "a0";
  products: MaterialProduct[];
  slice_keys?: string[];
  net_keys?: string[];
  region?: NmBounds;
  tile_size_nm: NonNegativeNm;
  /** Bounds the board and project files together. */
  max_source_bytes: uint64;
  max_operations: uint32;
  max_points: uint32;
}

/**
 * Analytic materialization of one KiCad board. This JSON form is the
 * deterministic debug view; the packed columnar encoding is canonical.
 */
@jsonSchema
@id("urn:wavenumber:schema:kicad_monkey.materialization.document:a0")
@extension("title", "Materialization document a0")
model MaterializationDocument {
  schema: "kicad_monkey.materialization.a0";
  type: "kicad_monkey.materialization.document";
  version: "a0";
  producer: MaterializationProducer;
  source: MaterializationSource;
  coordinate_system: MaterializationCoordinateSystem;
  scope: MaterializationScope;
  stack: Stack;
  nets: Net[];
  net_classes: NetClass[];
  diff_pairs: DiffPair[];
  components: Component[];
  operations: MaterialOperation[];
  binding: BindingEntry[];
  chunks: ChunkEntry[];
  diagnostics: MaterializationDiagnostic[];
}

/**
 * Analytic materialization a1: a0 plus `design_facts`. The material is
 * unchanged; a1 adds facts in the header only. An a1 reader also reads a0
 * documents, which have no `design_facts`.
 */
@jsonSchema
@id("urn:wavenumber:schema:kicad_monkey.materialization.document:a1")
@extension("title", "Materialization document a1")
model MaterializationDocumentA1 {
  schema: "kicad_monkey.materialization.a1";
  type: "kicad_monkey.materialization.document";
  version: "a1";
  producer: MaterializationProducer;
  source: MaterializationSource;
  coordinate_system: MaterializationCoordinateSystem;
  scope: MaterializationScope;
  stack: Stack;
  nets: Net[];
  net_classes: NetClass[];
  diff_pairs: DiffPair[];
  components: Component[];
  operations: MaterialOperation[];
  binding: BindingEntry[];
  chunks: ChunkEntry[];
  diagnostics: MaterializationDiagnostic[];
  /**
   * Present in every a1 document. Optional only so that an a1 reader can
   * hold an a0 document in this model: absent means a0, whose producer did
   * not report these facts.
   */
  design_facts?: DesignFacts;
}
