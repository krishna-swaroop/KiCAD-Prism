/** Generated from KiCad Monkey TypeSpec JSON Schema. Do not edit. */

/**
 * Selectable products. Every operation belongs to exactly one product. The
 * board profile has no product of its own: it is the add operation of every
 * dielectric and solder-mask slice, with cutouts subtracted there.
 */
export type MaterialProduct = "copper" | "holes" | "dielectric" | "solder_mask" | "paste" | "silkscreen" | "components";
/**
 * Board-frame length in integer nanometres. The range matches KiCad's own
 * 32-bit internal-unit limit, so the packed encoding stores it losslessly.
 */
export type Nm = number;
/**
 * Non-negative length in integer nanometres.
 */
export type NonNegativeNm = number;
/**
 * Physical role of a slice. `coverlay`, `adhesive`, and `stiffener` occur
 * only in flexible or stiffened stack regions.
 */
export type SliceRole =
  "conductor" | "dielectric" | "solder_mask" | "paste" | "silkscreen" | "coverlay" | "adhesive" | "stiffener";
export type BoardSide = "front" | "back";
export type StackRegionKind = "rigid" | "flex";
/**
 * Point in KiCad's board frame: X to the right, Y down, in nanometres.
 *
 * @minItems 2
 * @maxItems 2
 */
export type NmPoint = [Nm, Nm];
export type PathSegment = LineSegment | ArcSegment | CubicSegment;
export type MaterialOperation = SurfaceOperation | HoleOperation;
export type MaterialAction = "add" | "subtract";
export type SurfaceMaterial = "copper" | "dielectric" | "solder_mask" | "paste" | "silkscreen";
/**
 * Closed analytic shape vocabulary. Lowering is a consumer operation.
 */
export type Shape2D =
  | Disk2D
  | Rect2D
  | RoundedRect2D
  | ChamferedRect2D
  | Trapezoid2D
  | Capsule2D
  | Annulus2D
  | SweptPath2D
  | PlanarRegion2D;
export type RectCorner = "top_left" | "top_right" | "bottom_left" | "bottom_right";
export type PathCap = "round" | "flat";
export type PathJoin = "round" | "miter";
export type HolePlating = "plated" | "unplated";
/**
 * KiCad's tri-state for a protection option: set, cleared, or left to the board default.
 */
export type ProtectionState = "yes" | "no" | "unspecified";
export type PostMachiningMode = "counterbore" | "countersink";
export type BindingSourceKind =
  | "track"
  | "track_arc"
  | "via"
  | "pad"
  | "zone_fill"
  | "board_graphic"
  | "footprint_graphic"
  | "board_text"
  | "footprint_text"
  | "profile"
  | "derived";
export type DiagnosticSeverity = "info" | "warning" | "error";
/**
 * How copper joins the zone fills of its net: KiCad's `ZONE_CONNECTION`.
 * A zone's `(connect_pads)` without a mode is `thermal_reliefs`; `yes` and
 * `full` are `solid`, `no` is `none`. A pad's `(zone_connect N)` is 0
 * `none`, 1 `thermal_reliefs`, 2 `solid`, 3 `thru_hole_only`.
 */
export type PadConnection = "none" | "thermal_reliefs" | "solid" | "thru_hole_only";
/**
 * KiCad's island removal (`island_removal_mode`): 0 `always`, 1 `never`,
 * 2 `below_area` (islands smaller than `island_min_area_mm2`). Without the
 * token KiCad removes every island.
 */
export type IslandRemoval = "always" | "never" | "below_area";
/**
 * Corner smoothing KiCad applies to a zone's fill (`smoothing`).
 */
export type CornerSmoothing = "chamfer" | "fillet";

/**
 * Analytic materialization a1: a0 plus `design_facts`. The material is
 * unchanged; a1 adds facts in the header only. An a1 reader also reads a0
 * documents, which have no `design_facts`.
 */
export interface MaterializationDocumentA1 {
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
  design_facts?: DesignFacts;
}
export interface MaterializationProducer {
  name: string;
  version: string;
}
/**
 * The board file, and the project file when one was given: net classes come
 * only from the project.
 */
export interface MaterializationSource {
  sha256: string;
  source_bytes: string;
  project_sha256?: string;
  project_bytes?: string;
}
export interface MaterializationCoordinateSystem {
  unit: "nm";
  x_axis: "board_right";
  y_axis: "board_down";
}
/**
 * What a document holds. It is canonical: products are distinct and in
 * `MaterialProduct` declaration order, and slice and net keys are distinct
 * and sorted by byte value. Every operation, component, and product-tagged
 * diagnostic lies within it: a named product, a listed slice (a hole spans
 * one), a listed net, and bounds meeting `region`.
 */
export interface MaterializationScope {
  products: MaterialProduct[];
  /**
   * Absent means every slice.
   */
  slice_keys?: string[];
  /**
   * Absent means every net.
   */
  net_keys?: string[];
  region?: NmBounds;
  tile_size_nm: NonNegativeNm;
  /**
   * True exactly when every product is named and there is no slice, net, or region filter.
   */
  complete: boolean;
}
/**
 * Axis-aligned bounds in the board frame, inclusive.
 */
export interface NmBounds {
  min_x_nm: Nm;
  min_y_nm: Nm;
  max_x_nm: Nm;
  max_y_nm: Nm;
}
export interface Stack {
  slices: StackSlice[];
  /**
   * @minItems 1
   */
  regions: [StackRegion, ...StackRegion[]];
  board_thickness_nm?: NonNegativeNm;
  copper_finish?: string;
  /**
   * KiCad's board-level impedance-control flag (`dielectric_constraints`).
   */
  impedance_controlled?: boolean;
  /**
   * KiCad's board-level plated-edge flag (`edge_plating`). KiCad stores no
   * plated-edge geometry; fabrication plates the profile.
   */
  edge_plating?: boolean;
}
/**
 * One physical slice of the rigid board stack. `order` is zero at the front
 * outermost slice and increases toward the back. Z positions are derived
 * from the ordered thicknesses and are never stored. Absent values are
 * unknown, never defaulted.
 */
export interface StackSlice {
  key: string;
  role: SliceRole;
  order: number;
  kicad_layer?: string;
  side?: BoardSide;
  thickness_nm?: NonNegativeNm;
  material_name?: string;
  relative_permittivity?: number;
  loss_tangent?: number;
  /**
   * A dielectric's construction, when the stackup states it.
   */
  dielectric_kind?: "core" | "prepreg";
}
/**
 * Part of the board with its own build-up. `slice_keys` lists the slices
 * present there in stack order. A slice that only one region lists exists
 * only in that region. Without `boundary` the region is the whole board
 * profile. A rigid board has exactly one rigid region holding every slice.
 */
export interface StackRegion {
  key: string;
  kind: StackRegionKind;
  /**
   * @minItems 1
   */
  slice_keys: [string, ...string[]];
  boundary?: PlanarRegion2D[];
  bend_lines: BendLine[];
}
/**
 * One analytic outer contour with optional hole contours.
 */
export interface PlanarRegion2D {
  kind: "planar_region_2d";
  outer: Contour;
  holes: Contour[];
}
/**
 * Closed contour of line, arc, and cubic segments starting at `start_nm`.
 * When the last segment does not end at `start_nm`, a straight closing
 * segment back to it is implied.
 */
export interface Contour {
  start_nm: NmPoint;
  /**
   * @minItems 1
   */
  segments: [PathSegment, ...PathSegment[]];
}
/**
 * Straight path segment to `end_nm`.
 */
export interface LineSegment {
  kind: "line";
  end_nm: NmPoint;
}
/**
 * Circular arc segment through `mid_nm` to `end_nm`, the form KiCad stores.
 */
export interface ArcSegment {
  kind: "arc";
  mid_nm: NmPoint;
  end_nm: NmPoint;
}
/**
 * Cubic Bézier segment from the previous point through two control points
 * to `end_nm`, the form KiCad stores for curves.
 */
export interface CubicSegment {
  kind: "cubic";
  control1_nm: NmPoint;
  control2_nm: NmPoint;
  end_nm: NmPoint;
}
/**
 * Fold line of a flexible region, for 3D views; flat analyses ignore it.
 */
export interface BendLine {
  start_nm: NmPoint;
  end_nm: NmPoint;
  radius_nm: NonNegativeNm;
  angle_deg: number;
}
/**
 * Resolved electrical net. The empty key is the no-net assignment.
 */
export interface Net {
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
export interface NetClass {
  name: string;
  /**
   * @minItems 1
   */
  constituents: [string, ...string[]];
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
export interface DiffPair {
  base_name: string;
  positive_net_key: string;
  negative_net_key: string;
}
export interface Component {
  refdes: string;
  footprint: string;
  side: BoardSide;
  affine: Affine2D;
  source_uid: string;
  body_bounds?: NmBounds1;
  body_height_nm?: NonNegativeNm;
  /**
   * Net-tie pad groups: copper in the footprint may join these pads' nets.
   */
  net_tie_groups: PadGroup[];
  /**
   * Jumper pad groups, connected inside the part without board copper.
   */
  jumper_groups: PadGroup[];
}
/**
 * One fully composed local-to-board transform. A shape's local coordinates
 * map to board coordinates as x' = m11*x + m12*y + tx_nm and
 * y' = m21*x + m22*y + ty_nm. Reflection, rotation, and non-uniform scale are
 * ordinary cases of the same matrix.
 */
export interface Affine2D {
  m11: number;
  m12: number;
  m21: number;
  m22: number;
  tx_nm: Nm;
  ty_nm: Nm;
}
/**
 * Axis-aligned bounds in the board frame, inclusive.
 */
export interface NmBounds1 {
  min_x_nm: Nm;
  min_y_nm: Nm;
  max_x_nm: Nm;
  max_y_nm: Nm;
}
/**
 * Pad numbers of one footprint that KiCad connects as a group.
 */
export interface PadGroup {
  /**
   * @minItems 1
   */
  pad_numbers: [string, ...string[]];
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
export interface SurfaceOperation {
  kind: "surface";
  index: number;
  action: MaterialAction;
  material: SurfaceMaterial;
  slice_key: string;
  net_key?: string;
  shape: Shape2D;
  /**
   * Board-frame length in integer nanometres. The range matches KiCad's own
   * 32-bit internal-unit limit, so the packed encoding stores it losslessly.
   */
  offset_nm?: number;
  /**
   * Item that this operation's subtracts are confined to, such as one
   * knockout text whose glyph strokes are cut from its own box. It is the
   * item's source UID, so it survives filtering unchanged.
   */
  group_key?: string;
  affine: Affine2D;
  bounds: NmBounds2;
}
export interface Disk2D {
  kind: "disk_2d";
  center_nm: NmPoint;
  radius_nm: NonNegativeNm;
}
export interface Rect2D {
  kind: "rect_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
}
export interface RoundedRect2D {
  kind: "rounded_rect_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
  radius_nm: NonNegativeNm;
}
/**
 * Rectangle with the listed corners chamfered; unlisted corners keep `radius_nm`.
 */
export interface ChamferedRect2D {
  kind: "chamfered_rect_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
  chamfer_nm: NonNegativeNm;
  chamfered_corners: RectCorner[];
  radius_nm: NonNegativeNm;
}
/**
 * KiCad trapezoid: a rectangle whose opposite edges are widened or narrowed by the deltas.
 */
export interface Trapezoid2D {
  kind: "trapezoid_2d";
  center_nm: NmPoint;
  width_nm: NonNegativeNm;
  height_nm: NonNegativeNm;
  delta_x_nm: Nm;
  delta_y_nm: Nm;
}
/**
 * Stadium between two centres with a common radius.
 */
export interface Capsule2D {
  kind: "capsule_2d";
  start_nm: NmPoint;
  end_nm: NmPoint;
  radius_nm: NonNegativeNm;
}
export interface Annulus2D {
  kind: "annulus_2d";
  center_nm: NmPoint;
  outer_radius_nm: NonNegativeNm;
  inner_radius_nm: NonNegativeNm;
}
/**
 * Open centreline of line, arc, and cubic segments swept by a constant width.
 */
export interface SweptPath2D {
  kind: "swept_path_2d";
  start_nm: NmPoint;
  /**
   * @minItems 1
   */
  segments: [PathSegment, ...PathSegment[]];
  width_nm: NonNegativeNm;
  cap: PathCap;
  join: PathJoin;
}
/**
 * Axis-aligned bounds in the board frame, inclusive.
 */
export interface NmBounds2 {
  min_x_nm: Nm;
  min_y_nm: Nm;
  max_x_nm: Nm;
  max_y_nm: Nm;
}
/**
 * Drilled or milled hole spanning the conductor slices `start_slice_key` to
 * `end_slice_key` inclusive, in either order.
 */
export interface HoleOperation {
  kind: "hole";
  index: number;
  shape: Shape2D;
  affine: Affine2D;
  plating: HolePlating;
  start_slice_key: string;
  end_slice_key: string;
  net_key?: string;
  plating_thickness_nm?: NonNegativeNm;
  protection?: HoleProtection;
  backdrills: Backdrill[];
  post_machining: PostMachining[];
  /**
   * The hole belongs to a castellated pad, cut by the board edge in fabrication.
   */
  castellated?: boolean;
  bounds: NmBounds;
}
export interface HoleProtection {
  front: SideProtection;
  back: SideProtection;
  filled: ProtectionState;
  capped: ProtectionState;
}
export interface SideProtection {
  tented: ProtectionState;
  covered: ProtectionState;
  plugged: ProtectionState;
}
/**
 * Controlled-depth removal of barrel plating from one side.
 */
export interface Backdrill {
  side: BoardSide;
  diameter_nm?: NonNegativeNm;
  until_slice_key?: string;
}
/**
 * Counterbore or countersink machined from one side. A countersink's
 * `angle_deg` is the full included cone angle. Without `depth_nm`, a
 * countersink runs to its cone apex.
 */
export interface PostMachining {
  side: BoardSide;
  mode: PostMachiningMode;
  diameter_nm?: NonNegativeNm;
  depth_nm?: NonNegativeNm;
  angle_deg?: number;
}
/**
 * Links one operation to the KiCad object that produced it. Required for
 * simulation and picking; geometry consumers may ignore it.
 */
export interface BindingEntry {
  operation_index: number;
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
  /**
   * Non-negative length in integer nanometres.
   */
  die_length_nm?: number;
  /**
   * Pad-to-die delay of the pad's pin, in picoseconds.
   */
  die_delay_ps?: number;
}
/**
 * Operations of one (slice, tile) occupy a contiguous index range. An
 * operation belongs to the tile containing the centre of its bounds (floor
 * division by `tile_size_nm`); the chunk bounds cover every operation in it.
 * Chunks are non-empty, start at operation 0, follow each other without
 * gaps, and are ordered by slice order, tile row, then tile column.
 * `net_keys` are the distinct nets of the chunk's operations, sorted.
 */
export interface ChunkEntry {
  slice_key: string;
  tile_x: number;
  tile_y: number;
  bounds: NmBounds;
  net_keys: string[];
  first_operation_index: number;
  operation_count: number;
}
/**
 * A finding of the producer. `product` scopes it so selective results filter it like operations.
 */
export interface MaterializationDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  product?: MaterialProduct;
  source_uid?: string;
}
/**
 * Present in every a1 document. Optional only so that an a1 reader can
 * hold an a0 document in this model: absent means a0, whose producer did
 * not report these facts.
 */
export interface DesignFacts {
  /**
   * Non-negative length in integer nanometres.
   */
  max_error_nm?: number;
  /**
   * Non-negative length in integer nanometres.
   */
  copper_edge_clearance_nm?: number;
  zones: ZoneFacts[];
  pad_rules: PadRules[];
  footprint_rules: FootprintRules[];
  /**
   * By component in file order, front before back.
   */
  courtyards: Courtyard[];
}
/**
 * One zone or rule area on copper, as drawn. `outline` is the authored
 * outline in the board frame with its arcs: KiCad reads the first
 * `(polygon)` as the outline and later ones as holes in it. Exactly one of
 * `fill` (a copper zone) and `keepout` (a rule area) is present.
 */
export interface ZoneFacts {
  /**
   * The zone's binding `source_uid`: its UUID, or `zone@<offset>` when the UUID is nil or repeats an earlier zone's.
   */
  source_uid: string;
  name?: string;
  /**
   * Absent for no net.
   */
  net_key?: string;
  /**
   * The owning footprint's component `source_uid`, for a footprint's rule area.
   */
  footprint_source_uid?: string;
  /**
   * Conductor slices of the zone's copper layers, in stack order.
   *
   * @minItems 1
   */
  slice_keys: [string, ...string[]];
  priority: number;
  outline: PlanarRegion2D;
  fill?: ZoneFillRules;
  keepout?: RuleAreaKeepouts;
}
/**
 * Fill rules of a copper zone, as KiCad's zone filler reads them. Values
 * KiCad's parser defaults when the file omits them carry that default.
 */
export interface ZoneFillRules {
  /**
   * Non-negative length in integer nanometres.
   */
  clearance_nm: number;
  /**
   * Non-negative length in integer nanometres.
   */
  min_width_nm: number;
  pad_connection: PadConnection;
  thermal_gap_nm: NonNegativeNm;
  /**
   * Non-negative length in integer nanometres.
   */
  thermal_spoke_width_nm: number;
  island_removal: IslandRemoval;
  /**
   * Island area threshold as written, in mm².
   */
  island_min_area_mm2?: number;
  corner_smoothing?: CornerSmoothing;
  corner_radius_nm?: NonNegativeNm;
  hatch?: ZoneHatchFill;
}
/**
 * Present when the zone fills with a hatch instead of solid copper.
 */
export interface ZoneHatchFill {
  thickness_nm?: NonNegativeNm;
  gap_nm?: NonNegativeNm;
  orientation_deg?: number;
}
/**
 * What a rule area forbids: each flag is true where KiCad's keep-out says `not_allowed`.
 */
export interface RuleAreaKeepouts {
  tracks: boolean;
  vias: boolean;
  pads: boolean;
  copper_pour: boolean;
  footprints: boolean;
}
/**
 * A pad's own zone rules, keyed by the pad's binding `source_uid`. A value
 * is present only when the pad sets it instead of inheriting it; a pad that
 * sets nothing has no record.
 */
export interface PadRules {
  source_uid: string;
  clearance_nm?: NonNegativeNm;
  pad_connection?: PadConnection;
  thermal_gap_nm?: NonNegativeNm;
  thermal_spoke_width_nm?: NonNegativeNm;
  thermal_spoke_angle_deg?: number;
  /**
   * Padstack layers that set a rule, in file order.
   */
  layers: PadstackLayerRules[];
}
/**
 * Zone rules a padstack layer sets for itself (`(padstack (layer ...))`).
 * `kicad_layer` is the selector as written: a copper layer name, or `Inner`
 * for every inner layer in KiCad's front/inner/back mode.
 */
export interface PadstackLayerRules {
  kicad_layer: string;
  clearance_nm?: NonNegativeNm;
  pad_connection?: PadConnection;
  thermal_gap_nm?: NonNegativeNm;
  thermal_spoke_width_nm?: NonNegativeNm;
  thermal_spoke_angle_deg?: number;
}
/**
 * A footprint's zone rules for its pads, keyed by the component's
 * `source_uid`. Present only for values it sets; a footprint that sets
 * nothing has no record.
 */
export interface FootprintRules {
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
export interface Courtyard {
  /**
   * The component's `source_uid`.
   */
  source_uid: string;
  side: BoardSide;
  /**
   * @minItems 1
   */
  regions: [PlanarRegion2D, ...PlanarRegion2D[]];
}
