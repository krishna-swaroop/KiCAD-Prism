import { GeometryArena } from "./geometry-arena.js";
import {
  FEATURE_MASK_WGSL,
  MIN_FEATURE_MASK_CAPACITY,
  featureMaskCapacityFor,
  normalizeHiddenFeatureIds,
  packFeatureVisibility,
} from "./feature-visibility.js";
import {
  MIN_NET_MASK_CAPACITY,
  NET_MASK_WGSL,
  OCCURRENCE_EMPHASIS_WGSL,
  netMaskCapacityFor,
  normalizeNetIds,
  packNetEmphasis,
  packOccurrenceEmphasis,
} from "./net-emphasis.js";
import {
  BARREL_RECORD_STRIDE,
  IDENTITY,
  OCCURRENCE_STRIDE,
  OCCURRENCE_WGSL,
  LOD_CULLED,
  LOD_FULL,
  LOD_THRESHOLDS,
  decodePick,
  frustumPlanes,
  isIdentity,
  normalizeLodThresholds,
  normalizeOccurrences,
  packBarrels,
  packOccurrences,
} from "./occurrences.js";

// position unorm16×4 within the primitive's bounds (SB2-89), normal snorm8×4
// (SB2-84), netId, objectId. SB2-82 dropped the per-primitive layer and material
// ids, which no shader read.
const VERTEX_STRIDE = 20;
// WebGPU dynamic uniform offsets require 256-byte alignment; each draw buffer is padded to that size.
const DRAW_UNIFORM_SIZE = 256;
const GLOBAL_UNIFORM_SIZE = 112;
// Two channels (SB2-24): R = occurrence index + 1, G = feature id (occurrences.js).
const PICK_FORMAT = "rg32uint";
const DRAW_FLOATS = DRAW_UNIFORM_SIZE / 4;
const MIN_DRAW_SLOTS = 256;
// Stencil marks: outer copper writes 1 where it is the nearest opaque surface,
// anything else opaque writes 0. The mask then draws lighter where it is 1.
const STENCIL_OPAQUE = { compare: "always", passOp: "zero" };
const STENCIL_MARK = { compare: "always", passOp: "replace" };
const STENCIL_UNMARKED = { compare: "not-equal", passOp: "keep" };
const STENCIL_MARKED = { compare: "equal", passOp: "keep" };

// SB2-89: positions are unorm16 within the primitive's bounds; the draw names the bounds.
const DEQUANT_WGSL = `fn dequant(p: vec3f) -> vec3f { return draw.quantMin.xyz + p * draw.quantSize.xyz; }`;

const MAIN_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw {
  color: vec4f,
  material: vec4f,
  offset: vec4f,
  flags: vec4f,
  placement: vec4u,
  quantMin: vec4f,
  quantSize: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
${DEQUANT_WGSL}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${FEATURE_MASK_WGSL}
${NET_MASK_WGSL}
// Set on the pipeline that draws the solder mask over copper.
override COVERED: bool = false;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
  @location(3) world: vec3f,
};
@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);
  output.netId = input.netId;
  output.objectId = input.objectId;
  return output;
}
fn aces(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0), vec3f(1));
}
@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
  let kind = u32(draw.flags.x);
  let copper = kind == 1u;
  let component = kind == 2u;
  if (component && featureHidden(input.objectId)) { discard; }
  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  let selectedComponent = component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;
  var base = draw.color.rgb;
  if (COVERED) {
    // Mask over copper reads lighter, as in KiCad.
    base = min(base * 1.6 + vec3f(0.03, 0.05, 0.02), vec3f(1.0));
  }
  if (selected && copper) {
    // flags.z: 0 draws all copper, 1 isolates (lit copper keeps its colour), 2 is inner copper
    // that shows only where lit (SB2-85) and pulses like the outer layers.
    if (draw.flags.z < 0.5 || draw.flags.z > 1.5) {
      let pulse = 0.88 + 0.12 * sin(globals.time * 3.2);
      base = vec3f(0.08, 1.0, 0.2) * pulse;
    }
  } else if (globals.hasHighlight > 0.5 && copper) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  if (selectedComponent) {
    let pulse = 0.84 + 0.16 * sin(globals.time * 3.6);
    base = mix(base, vec3f(0.15, 0.72, 1.0) * pulse, 0.72);
  }
  if (draw.flags.z > 0.5 && copper && !selected) { discard; }
  let normal = normalize(input.normal);
  // Light each side of the board from its own side, as KiCad does, so the
  // bottom reads as clearly as the top.
  let side = vec3f(1.0, 1.0, select(1.0, -1.0, normal.z < 0.0));
  let light = normalize(globals.lightDirection.xyz * side);
  let diffuse = max(dot(normal, light), 0.0);
  let hemi = mix(0.28, 0.62, abs(normal.z) * 0.5 + 0.5);
  let roughness = clamp(draw.material.y, 0.05, 1.0);
  let metallic = clamp(draw.material.x, 0.0, 1.0);
  let specular = pow(max(dot(normal, normalize(light + vec3f(0.3, -0.4, 0.85) * side)), 0.0), mix(96.0, 6.0, roughness));
  let shaded = base * (hemi + diffuse * 0.72) + mix(vec3f(0.04), base, metallic) * specular * 0.5;
  var lit = shaded;
  if (draw.flags.w > 0.5) {
    lit = base;
  }
  var alpha = draw.flags.y;
  // Translucent placeholders (material.z = full component opacity) turn solid when selected.
  if (selectedComponent) { alpha = max(alpha, draw.material.z * 0.9); }
  if (COVERED) { alpha = min(1.0, alpha * 1.2); }
  return vec4f(aces(lit), alpha);
}
`;

const PICK_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f, placement: vec4u, quantMin: vec4f, quantSize: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
${DEQUANT_WGSL}
@group(0) @binding(3) var<storage, read> hiddenMask: array<u32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${FEATURE_MASK_WGSL}
${NET_MASK_WGSL}
struct Input {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(2) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
};
@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);
  output.objectId = input.objectId;
  output.netId = input.netId;
  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec2u {
  if (u32(draw.flags.x) == 2u && featureHidden(input.objectId)) { discard; }
  // Isolated (flags.z), unlit copper is not drawn, so it is not there to pick (SB2-31e).
  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  if (u32(draw.flags.x) == 1u && draw.flags.z > 0.5 && !lit) { discard; }
  return vec2u(1u, input.objectId);
}
`;

const BARREL_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${NET_MASK_WGSL}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
  let radius = mix(input.dimensions.z, input.dimensions.w, input.radiusMix);
  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];
  let world = vec3f(
    input.dimensions.x + input.unit.x * radius,
    input.dimensions.y + input.unit.y * radius,
    mix(z0, z1, input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = input.normal;
  output.netId = input.ids.x;
  output.objectId = input.ids.y;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
  if (input.visible == 0u) { discard; }
  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  var base = draw.color.rgb;
  if (selected) {
    if (draw.flags.z < 0.5) {
      base = vec3f(0.1, 1.0, 0.22) * (0.88 + 0.12 * sin(globals.time * 3.2));
    }
  } else if (globals.hasHighlight > 0.5) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  if (draw.flags.z > 0.5 && !selected) { discard; }
  let light = normalize(globals.lightDirection.xyz);
  let lit = base * (0.38 + max(dot(normalize(input.normal), light), 0.0) * 0.72);
  return vec4f(lit, 1.0);
}
`;

const BARREL_PICK_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
@group(0) @binding(4) var<storage, read> netMask: array<u32>;
${NET_MASK_WGSL}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(3) @interpolate(flat) netId: u32,
  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
  let radius = mix(input.dimensions.z, input.dimensions.w, input.radiusMix);
  let world = vec3f(
    input.dimensions.x + input.unit.x * radius,
    input.dimensions.y + input.unit.y * radius,
    mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId = input.ids.y;
  output.netId = input.ids.x;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec2u {
  if (input.visible == 0u) { discard; }
  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  if (draw.flags.z > 0.5 && !lit) { discard; }
  return vec2u(1u, input.objectId);
}
`;

// Occurrence-instanced variants (System Builder SB2-23). Every draw runs once
// per occurrence and places the board-local position (after the explode and
// compare offsets) by that occurrence's model matrix; barrels are instanced
// twice over, instance = occurrence × barrel count + barrel, reading their
// records from storage. The one-board viewer keeps the shaders above, unchanged:
// any per-instance matrix in the position path, even an identity, compiles to a
// different float evaluation order, and copper, mask and silkscreen 18 µm apart
// then trade places in the depth test. Separate pipelines keep that view
// pixel-identical; these compile only when a scene places real occurrences.
function variant(source, replacements) {
  return replacements.reduce((code, [before, after]) => {
    if (code.split(before).length !== 2) throw new Error(`Shader variant anchor not found once: ${before.slice(0, 60)}`);
    return code.replace(before, () => after);
  }, source);
}

// Instanced shaders read their Globals' spare words as the selected occurrence
// (index + 1), so the inspected selection lights only its own copy, and as the
// renderer's first occurrence in a multi-asset scene (SB2-27), so picks and the
// selection carry scene-wide occurrence numbers. Both are 0 for one renderer.
const SELECTED_OCCURRENCE = ["  padding0: u32,\n  padding1: u32,", "  selectedOccurrence: u32,\n  occurrenceBase: u32,"];
// SB2-31: the last spare word is the per-occurrence emphasis table's stride
// (0: `netMask` is the plain per-net mask, shared by every occurrence).
const EMPHASIS_TABLE = [
  ["  padding2: u32,", "  emphasisStride: u32,"],
  ["fn netEmphasized(id: u32) -> bool {", `${OCCURRENCE_EMPHASIS_WGSL}fn netEmphasized(id: u32) -> bool {`],
];

// What an isolated pick keeps: copper lit on this occurrence.
const PICK_LIT = "  let lit = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);";
const PICK_LIT_INSTANCED = `  let lit = emphasisOf(input.occurrence, input.netId) != 0u
    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);`;

const MAIN_SHADER_INSTANCED = variant(MAIN_SHADER, [
  SELECTED_OCCURRENCE,
  [`  @location(3) world: vec3f,
};`, `  @location(3) world: vec3f,
  @location(4) @interpolate(flat) occurrence: u32,
  // Mask and silkscreen opacity of this occurrence's own stackup separation (SB2-31f).
  @location(5) @interpolate(flat) fade: f32,
};`],
  [`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);`,
  `${OCCURRENCE_WGSL}
@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  // Full-detail draws (components; inner copper behind an opaque board) list only
  // occurrences at full detail (draw.material.w = LIST_FULL); copper and the
  // like list full or board, substrate and mask full, board or body.
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);
  let occurrence = occurrences[index];
  var output: VertexOutput;
  let lift = vec3f(0.0, 0.0, explodeLift(occurrence, draw.offset.w));
  output.world = (occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)).xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize((occurrence.normal * vec4f(input.normal, 0.0)).xyz);
  output.occurrence = index + 1u + globals.occurrenceBase;
  output.fade = select(1.0, occurrence.explode.z, occurrence.explode.w > 0.5 && draw.flags.x < 0.5);
  // A layer this copy hides (SB2-31e), or a draw its separation removes (SB2-31f), collapses outside the clip volume.
  if (layerHiddenAt(occurrence, draw.offset.w) || explodeHides(occurrence, draw.flags.x, draw.offset.w)) {
    output.position = vec4f(0.0, 0.0, 2.0, 1.0);
  }`],
  [`  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);
  let selectedComponent = component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`,
  `  // The inspected selection lights its own copy; host-highlighted nets light every copy.
  let here = input.occurrence == globals.selectedOccurrence;
  let mark = emphasisOf(input.occurrence, input.netId);
  let selected = mark != 0u || (here && globals.activeNet != 0u && input.netId == globals.activeNet);
  let selectedComponent = here && component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;`],
  ...EMPHASIS_TABLE,
  ["      base = vec3f(0.08, 1.0, 0.2) * pulse;", "      base = emphasisColor(mark, vec3f(0.08, 1.0, 0.2)) * pulse;"],
  ["  var alpha = draw.flags.y;", "  var alpha = draw.flags.y * input.fade;"],
]);

const PICK_SHADER_INSTANCED = variant(PICK_SHADER, [
  SELECTED_OCCURRENCE,
  [`  @location(0) @interpolate(flat) objectId: u32,
};`, `  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) occurrence: u32,
};`],
  [`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`,
  `${OCCURRENCE_WGSL}
@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);
  let occurrence = occurrences[index];
  let lift = vec3f(0.0, 0.0, explodeLift(occurrence, draw.offset.w));
  let world = (occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)).xyz;
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.occurrence = index + 1u + globals.occurrenceBase;
  if (layerHiddenAt(occurrence, draw.offset.w) || explodeHides(occurrence, draw.flags.x, draw.offset.w)) {
    output.position = vec4f(0.0, 0.0, 2.0, 1.0);
  }`],
  // Board context draws (kind 0) pick as feature 0: "this board", no feature.
  [`  return vec2u(1u, input.objectId);`,
  `  let kind = u32(draw.flags.x);
  return vec2u(input.occurrence, select(input.objectId, 0u, kind == 0u));`],
  ...EMPHASIS_TABLE,
  [PICK_LIT, PICK_LIT_INSTANCED],
]);

// Component instancing (SB2-86): a component model is uploaded once and drawn at
// every placement. A placement is a 3×4 transform (board frame, the GLB's axes
// already turned) and the component's feature id, in storage; the draw names its
// first placement and how many there are. Occurrence-instanced draws run
// occurrence × placement count + placement, as the barrels do.
const PLACEMENT_WGSL = `struct Placement { r0: vec4f, r1: vec4f, r2: vec4f, ids: vec4u };
@group(0) @binding(8) var<storage, read> placements: array<Placement>;
fn place(p: Placement, v: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, v) + p.r0.w, dot(p.r1.xyz, v) + p.r1.w, dot(p.r2.xyz, v) + p.r2.w);
}
fn turn(p: Placement, n: vec3f) -> vec3f {
  return vec3f(dot(p.r0.xyz, n), dot(p.r1.xyz, n), dot(p.r2.xyz, n));
}`;
const DRAW_BINDING = "@group(0) @binding(1) var<uniform> draw: Draw;";
const PLACEMENT_PRELUDE = [DRAW_BINDING, `${DRAW_BINDING}\n${PLACEMENT_WGSL}`];
// A model's own per-vertex feature ids win; otherwise the placement's component.
const PLACED_OBJECT = ["  output.objectId = input.objectId;", "  output.objectId = select(placement.ids.x, input.objectId, input.objectId != 0u);"];
const INSTANCED_PLACEMENT = ["  let index = listedOccurrence(u32(draw.material.w + 0.5), instance);",
  "  let placement = placements[draw.placement.x + instance % draw.placement.y];\n  let index = listedOccurrence(u32(draw.material.w + 0.5), instance / draw.placement.y);"];

const COMPONENT_SHADER = variant(MAIN_SHADER, [
  PLACEMENT_PRELUDE,
  [`@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = dequant(input.position) + draw.offset.xyz;`, `@vertex fn vs(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  let placement = placements[draw.placement.x + instance];
  var output: VertexOutput;
  output.world = place(placement, dequant(input.position)) + draw.offset.xyz;`],
  ["  output.normal = normalize(input.normal);", "  output.normal = normalize(turn(placement, input.normal));"],
  PLACED_OBJECT,
]);
const COMPONENT_SHADER_INSTANCED = variant(MAIN_SHADER_INSTANCED, [
  PLACEMENT_PRELUDE,
  INSTANCED_PLACEMENT,
  ["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)",
    "occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],
  ["(occurrence.normal * vec4f(input.normal, 0.0))", "(occurrence.normal * vec4f(turn(placement, input.normal), 0.0))"],
  PLACED_OBJECT,
]);
const COMPONENT_PICK_SHADER = variant(PICK_SHADER, [
  PLACEMENT_PRELUDE,
  [`@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(dequant(input.position) + draw.offset.xyz, 1.0);`, `@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let placement = placements[draw.placement.x + instance];
  var output: Output;
  output.position = globals.viewProjection * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz, 1.0);`],
  PLACED_OBJECT,
]);
const COMPONENT_PICK_SHADER_INSTANCED = variant(PICK_SHADER_INSTANCED, [
  PLACEMENT_PRELUDE,
  INSTANCED_PLACEMENT,
  ["occurrence.model * vec4f(dequant(input.position) + draw.offset.xyz + lift, 1.0)",
    "occurrence.model * vec4f(place(placement, dequant(input.position)) + draw.offset.xyz + lift, 1.0)"],
  PLACED_OBJECT,
]);
// A placement record: three rows of the transform, then the feature id.
export const PLACEMENT_STRIDE = 64;
// Instanced component slots carry their placement count in the class word: 6 | count << 3.
const COMPONENT_SLOT_CLASS = 6;

const BARREL_INPUT = `struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};`;
const BARREL_INPUT_INSTANCED = `struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;
${OCCURRENCE_WGSL}
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
};`;

// The barrel bodies read `input.dimensions/span/ids`; the variant binds `input`
// to a merged record so those lines stay as written. Barrels are nested:
// instance = listed slot × barrel count + barrel, over the board list.
function barrelVariant(source, positionLine, extra = []) {
  return variant(source, [
    SELECTED_OCCURRENCE,
    // OCCURRENCE_WGSL declares the layer offsets for every instanced shader.
    ["@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;\n", ""],
    [BARREL_INPUT, BARREL_INPUT_INSTANCED],
    [`@vertex fn vs(input: Input) -> Output {`, `struct Record {
  unit: vec3f,
  normal: vec3f,
  radiusMix: f32,
  dimensions: vec4f,
  span: vec2f,
  ids: vec4u,
};
@vertex fn vs(vertex: Input, @builtin(instance_index) instance: u32) -> Output {
  let count = arrayLength(&barrels);
  let barrel = barrels[instance % count];
  let index = listedOccurrence(LIST_BOARD, instance / count);
  let occurrence = occurrences[index];
  // An occurrence that explodes itself (SB2-31f) scales the renderer's per-layer steps by its own gap.
  let spread = select(1.0, occurrence.explode.x, occurrence.explode.w > 0.5);
  let input = Record(vertex.unit, vertex.normal, vertex.radiusMix, barrel.dimensions, barrel.span, barrel.ids);`],
    [positionLine, positionLine.replace("vec4f(world, 1.0)", "vec4f((occurrence.model * vec4f(world, 1.0)).xyz, 1.0)")],
    ["  output.objectId = input.ids.y;", "  output.objectId = input.ids.y;\n  output.occurrence = index + 1u + globals.occurrenceBase;"],
    ...extra,
  ]);
}

const BARREL_SHADER_INSTANCED = barrelVariant(
  BARREL_SHADER,
  "  output.position = globals.viewProjection * vec4f(world, 1.0);\n  output.normal = input.normal;",
  [
    ["  let z0 = input.span.x + layerOffsets[input.ids.z];\n  let z1 = input.span.y + layerOffsets[input.ids.w];",
      "  let z0 = input.span.x + layerOffsets[input.ids.z] * spread;\n  let z1 = input.span.y + layerOffsets[input.ids.w] * spread;"],
    ["  output.normal = input.normal;\n  output.netId", "  output.normal = (occurrence.normal * vec4f(input.normal, 0.0)).xyz;\n  output.netId"],
    ["  @location(3) @interpolate(flat) visible: u32,\n};", "  @location(3) @interpolate(flat) visible: u32,\n  @location(4) @interpolate(flat) occurrence: u32,\n};"],
    ["  let selected = netEmphasized(input.netId) || (globals.activeNet != 0u && input.netId == globals.activeNet);",
      "  let mark = emphasisOf(input.occurrence, input.netId);\n  let selected = mark != 0u\n    || (input.occurrence == globals.selectedOccurrence && globals.activeNet != 0u && input.netId == globals.activeNet);"],
    ...EMPHASIS_TABLE,
    ["      base = vec3f(0.1, 1.0, 0.22) * (", "      base = emphasisColor(mark, vec3f(0.1, 1.0, 0.22)) * ("],
  ],
);
const BARREL_PICK_SHADER_INSTANCED = barrelVariant(
  BARREL_PICK_SHADER,
  "  output.position = globals.viewProjection * vec4f(world, 1.0);\n  output.objectId",
  [
    ["mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)",
      "mix(input.span.x + layerOffsets[input.ids.z] * spread, input.span.y + layerOffsets[input.ids.w] * spread, input.unit.z)"],
    ["  @location(1) @interpolate(flat) visible: u32,\n};", "  @location(1) @interpolate(flat) visible: u32,\n  @location(2) @interpolate(flat) occurrence: u32,\n};"],
    ["  return vec2u(1u, input.objectId);", "  return vec2u(input.occurrence, input.objectId);"],
    ...EMPHASIS_TABLE,
    [PICK_LIT, PICK_LIT_INSTANCED],
  ],
);

// The stand-in for an occurrence at box detail: the board's bounding box
// (draw.offset = minimum, draw.material.xyz = size, in the board's own frame).
const BOX_SHADER_HEAD = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  selectedOccurrence: u32,
  occurrenceBase: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
${OCCURRENCE_WGSL}
struct Input {
  @location(0) corner: vec3f,
  @location(1) normal: vec3f,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) occurrence: u32,
};
@vertex fn vs(input: Input, @builtin(instance_index) instance: u32) -> Output {
  let index = listedOccurrence(LIST_BOX, instance);
  let occurrence = occurrences[index];
  let local = draw.offset.xyz + input.corner * draw.material.xyz;
  var output: Output;
  output.position = globals.viewProjection * vec4f((occurrence.model * vec4f(local, 1.0)).xyz, 1.0);
  output.normal = (occurrence.normal * vec4f(input.normal, 0.0)).xyz;
  output.occurrence = index + 1u + globals.occurrenceBase;
  return output;
}
`;
const BOX_SHADER = `${BOX_SHADER_HEAD}
@fragment fn fs(input: Output) -> @location(0) vec4f {
  let light = normalize(globals.lightDirection.xyz);
  return vec4f(draw.color.rgb * (0.45 + max(dot(normalize(input.normal), light), 0.0) * 0.55), 1.0);
}
`;
const BOX_PICK_SHADER = `${BOX_SHADER_HEAD}
@fragment fn fs(input: Output) -> @location(0) vec2u {
  return vec2u(input.occurrence, 0u);
}
`;

// The cull pass (SB2-25). `classify` runs per occurrence: frustum test on the
// transformed board box, then a level of detail from its projected radius with
// hysteresis (occurrences.js `chooseLod` is the same rule), appending the
// occurrence to the lists the instanced shaders read. `writeArgs` then sets
// every indirect draw's instance count from the list lengths.
const CULL_SHADER = `
struct Occurrence {
  model: mat4x4f,
  normal: mat4x4f,
  hiddenLayers: vec4u,
  explode: vec4f,
};
struct Cull {
  planes: array<vec4f, 6>,
  eye: vec4f,
  boundsMin: vec4f,
  boundsMax: vec4f,
  lod: vec4f,
  info: vec4u,
  extra: vec4u,
};
@group(0) @binding(0) var<uniform> cull: Cull;
@group(0) @binding(1) var<storage, read> occurrences: array<Occurrence>;
@group(0) @binding(2) var<storage, read_write> lods: array<u32>;
@group(0) @binding(3) var<storage, read_write> lists: array<u32>;
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>, 4>;
@group(0) @binding(5) var<storage, read_write> args: array<u32>;
@group(0) @binding(6) var<storage, read> classes: array<u32>;

fn chooseLod(previous: u32, pixels: f32) -> u32 {
  var limits = array<f32, 3>(cull.lod.y, bitcast<f32>(cull.extra.y), cull.lod.z);
  let keep = cull.lod.w;
  var lod = 3u;
  if (pixels >= limits[2]) { lod = 2u; }
  if (pixels >= limits[1]) { lod = 1u; }
  if (pixels >= limits[0]) { lod = 0u; }
  for (var level = 0u; level < lod; level += 1u) {
    if (previous <= level && pixels >= limits[level] * keep) { return level; }
  }
  return lod;
}

@compute @workgroup_size(64) fn classify(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= cull.info.x) { return; }
  let model = occurrences[i].model;
  var lo = vec3f(3.0e38);
  var hi = vec3f(-3.0e38);
  for (var corner = 0u; corner < 8u; corner += 1u) {
    let local = vec3f(
      select(cull.boundsMin.x, cull.boundsMax.x, (corner & 1u) != 0u),
      select(cull.boundsMin.y, cull.boundsMax.y, (corner & 2u) != 0u),
      select(cull.boundsMin.z, cull.boundsMax.z, (corner & 4u) != 0u));
    let point = (model * vec4f(local, 1.0)).xyz;
    lo = min(lo, point);
    hi = max(hi, point);
  }
  var inside = true;
  for (var k = 0u; k < 6u; k += 1u) {
    let plane = cull.planes[k];
    let far = select(lo, hi, plane.xyz >= vec3f(0.0));
    if (dot(plane.xyz, far) + plane.w < 0.0) { inside = false; }
  }
  var lod = 3u;
  if (inside) {
    let center = (lo + hi) * 0.5;
    let radius = length(hi - lo) * 0.5;
    // Perspective: pixels per unit at unit distance over the distance; orthographic: per unit.
    let distance = select(1.0, max(length(center - cull.eye.xyz), 1.0e-6), cull.eye.w > 0.5);
    lod = chooseLod(lods[i], radius * cull.lod.x / distance);
    if (cull.info.z != 0u) { lod = cull.info.z - 1u; }
    if (i + 1u == cull.info.y) { lod = 0u; }
  }
  lods[i] = lod;
  if (lod == 0u) { lists[atomicAdd(&counters[0], 1u) * 4u] = i; }
  if (lod <= 1u) { lists[atomicAdd(&counters[1], 1u) * 4u + 1u] = i; }
  if (lod <= 2u) { lists[atomicAdd(&counters[2], 1u) * 4u + 2u] = i; }
  if (lod == 3u) { lists[atomicAdd(&counters[3], 1u) * 4u + 3u] = i; }
}

@compute @workgroup_size(64) fn writeArgs(@builtin(global_invocation_id) id: vec3u) {
  let slot = id.x;
  if (slot >= cull.info.w) { return; }
  let full = atomicLoad(&counters[0]);
  let board = atomicLoad(&counters[1]);
  let body = atomicLoad(&counters[2]);
  let box = atomicLoad(&counters[3]);
  let kind = classes[slot];
  var count = 0u;
  if (kind == 0u) { count = board; }
  else if (kind == 1u) { count = full; }
  else if (kind == 2u) { count = board * cull.extra.x; }
  else if (kind == 3u) { count = box; }
  else if (kind == 5u) { count = body; }
  else if ((kind & 7u) == 6u) { count = full * (kind >> 3u); }
  args[slot * 5u + 1u] = count;
}
`;

const BOX_VERTEX_BUFFERS = [{
  arrayStride: 24,
  attributes: [
    { shaderLocation: 0, offset: 0, format: "float32x3" },
    { shaderLocation: 1, offset: 12, format: "float32x3" },
  ],
}];

// For tests: the variants are derived at load, so a drifted anchor fails there.
export const INSTANCED_SHADERS = Object.freeze({
  main: MAIN_SHADER_INSTANCED,
  pick: PICK_SHADER_INSTANCED,
  barrel: BARREL_SHADER_INSTANCED,
  barrelPick: BARREL_PICK_SHADER_INSTANCED,
  box: BOX_SHADER,
  boxPick: BOX_PICK_SHADER,
  cull: CULL_SHADER,
  component: COMPONENT_SHADER,
  componentInstanced: COMPONENT_SHADER_INSTANCED,
  componentPick: COMPONENT_PICK_SHADER,
  componentPickInstanced: COMPONENT_PICK_SHADER_INSTANCED,
});

export class Renderer {
  static async create(canvas) {
    if (!navigator.gpu) throw new Error("WebGPU is unavailable in this browser");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter is available");
    // Stencil keeps the float depth precision only with this format; without it
    // the mask draws one shade everywhere.
    const stencil = adapter.features.has("depth32float-stencil8");
    const device = await adapter.requestDevice(stencil ? { requiredFeatures: ["depth32float-stencil8"] } : undefined);
    return new Renderer(canvas, device, { stencil });
  }

  /**
   * `shareFrom` makes this renderer one asset of a multi-asset scene (SB2-27):
   * it borrows that renderer's device, canvas context, layouts and pipelines,
   * keeps its own geometry, occurrences, cull state and indirect slots, and
   * always draws through the instanced pipelines. A `SceneRenderer` encodes the
   * passes for all of them.
   */
  constructor(canvas, device, { shareFrom = null, stencil = false } = {}) {
    this.canvas = canvas;
    this.device = device;
    this.shareFrom = shareFrom;
    this.stencil = shareFrom ? shareFrom.stencil : Boolean(stencil);
    // Reversed depth (see math.js): cleared to 0, nearer fragments are greater.
    this.depthFormat = this.stencil ? "depth32float-stencil8" : "depth32float";
    // Bumped by every change that alters the picture outside the per-frame inputs.
    this.version = 0;
    this.barrelColor = [0.55, 0.35, 0.16, 0.78];
    this.alwaysInstanced = Boolean(shareFrom);
    // Scene-wide number of this renderer's first occurrence (Globals.occurrenceBase).
    this.occurrenceBase = 0;
    if (shareFrom) {
      this.context = shareFrom.context;
      this.format = shareFrom.format;
    } else {
      device.addEventListener("uncapturederror", (event) => {
        console.error(`Uncaptured WebGPU error: ${event.error?.message || event.error}`);
      });
      device.lost.then((info) => {
        // A scene that is closed destroys its device on purpose (SB2-27); that is not a loss.
        if (info.reason !== "destroyed") console.error(`WebGPU device lost: ${info.reason}`, info.message);
      });
      this.context = canvas.getContext("webgpu");
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({ device, format: this.format, alphaMode: "opaque" });
    }
    this.entries = [];
    this.barrels = null;
    // All draw uniforms live in one buffer, one 256-byte slot per entry, and go
    // up in one write per pass.
    this.drawSlotCapacity = MIN_DRAW_SLOTS;
    this.drawSlotBuffer = this.createDrawSlotBuffer(this.drawSlotCapacity);
    this.drawStaging = new Float32Array(this.drawSlotCapacity * DRAW_FLOATS);
    this.freeDrawSlots = [];
    this.nextDrawSlot = 0;
    this.globalBuffer = device.createBuffer({ size: GLOBAL_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.layerOffsetBuffer = device.createBuffer({ size: 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    // Occurrences (SB2-23): the one-board viewer is a single identity
    // occurrence drawn by the original pipelines; anything else switches to the
    // instanced ones. Barrel records are mirrored into storage for them, with a
    // one-record placeholder so every bind group is valid.
    this.occurrenceMatrices = [[...IDENTITY]];
    this.occurrenceKeys = ["0"];
    this.occurrenceHiddenLayers = [[]];
    this.occurrenceExplode = [null];
    this.identityOnly = true;
    this.occurrenceCapacity = 1;
    this.occurrenceBuffer = this.createOccurrenceBuffer(this.occurrenceCapacity);
    this.device.queue.writeBuffer(this.occurrenceBuffer, 0, packOccurrences(this.occurrenceMatrices));
    this.barrelRecordBuffer = device.createBuffer({ label: "barrel-records", size: BARREL_RECORD_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    // Component placements (SB2-86), one record per placed model; a one-record placeholder keeps bind groups valid.
    this.placementBuffer = device.createBuffer({ label: "component-placements", size: PLACEMENT_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.componentPipelineSets = new Map();
    this.instancedPipelines = null;
    // Culled lists the instanced shaders read (SB2-25): three u32 per occurrence.
    this.listBuffer = this.createListBuffer(this.occurrenceCapacity);
    // Indirect draw arguments: a five-word slot per draw. Slot 0 is the barrels,
    // slot 1 the stand-in box, primitives take the rest. The cull pass writes
    // each slot's instance count from the list its class names (0 board level,
    // 1 components, 2 barrels, 3 box, 4 unused, 5 body level).
    this.slotCapacity = 0;
    this.slotArgs = new Uint32Array(0);
    this.slotClasses = new Uint32Array(0);
    this.freeSlots = [];
    this.nextSlot = 2;
    this.argsBuffer = null;
    this.classesBuffer = null;
    this.growSlots(256);
    this.setSlot(0, 0, 4);
    this.setSlot(1, 0, 4);
    this.cull = null;
    this.box = null;
    this.boardBounds = null;
    this.selectedOccurrence = -1; // the copy holding the selection, or -1
    this.lodOverride = null;
    this.lodThresholds = { ...LOD_THRESHOLDS };
    // Inner copper is hidden by an opaque board, so it draws at full detail only;
    // exploded or see-through boards move it down to board detail.
    this.innerCopperAtFull = true;
    // SB2-85: "all" inner copper, only the "lit" nets', or "none" (an opaque board with nothing lit).
    this.innerCopperMode = "all";
    this.cullCounts = { full: 0, board: 0, body: 0, box: 0, culled: 0 };
    this.frameStats = { triangles: 0, draws: 0 };
    this.boxColor = [0.24, 0.36, 0.28, 1]; // solder-mask green, darkened
    if (shareFrom) {
      for (const key of ["bindGroupLayout", "pipelineLayout", "vertexBuffers", "pipeline", "pickPipeline",
        "barrelPipeline", "barrelPickPipeline", "singlePipelines"]) this[key] = shareFrom[key];
    } else {
      this.createSinglePipelines();
    }
    this.depth = null;
    this.pickTexture = null;
    this.pickSerial = Promise.resolve();
    this.bundleCache = new Map();
    this.globalScratch = new ArrayBuffer(GLOBAL_UNIFORM_SIZE);
    this.globalScratchF32 = new Float32Array(this.globalScratch);
    this.globalScratchView = new DataView(this.globalScratch);
    this.barrelDrawScratch = new Float32Array(DRAW_UNIFORM_SIZE / 4);
    this.nextEntryId = 1;
    // Feature-visibility mask: default-visible, indexed by component feature
    // id. It always exists so every bind group is valid before any hide call.
    this.hiddenFeatureIds = new Set();
    this.showPlaceholders = true;
    this.featureMaskCapacity = MIN_FEATURE_MASK_CAPACITY;
    this.featureMaskBuffer = this.createFeatureMaskBuffer(
      this.featureMaskCapacity,
    );
    this.uploadFeatureMask();
    // Net-emphasis mask: default-off, indexed by net id (Prism #305). It always
    // exists so every bind group is valid before the first highlight.
    this.emphasizedNetIds = new Set();
    // SB2-31: per-occurrence emphasis rows (Map net id → packed colour), or null.
    this.occurrenceEmphasis = null;
    this.emphasisStride = 0;
    // Dim unlit copper although this asset lights nothing (another board in the scene does).
    this.dimCopper = false;
    this.netMaskCapacity = MIN_NET_MASK_CAPACITY;
    this.netMaskBuffer = this.createNetMaskBuffer(this.netMaskCapacity);
    this.uploadNetMask();
    // A scene asset never takes the one-board path, even with one identity copy.
    if (shareFrom) this.setOccurrences([]);
  }

  createSinglePipelines() {
    const device = this.device;
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 6, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 7, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 8, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    this.pipelineLayout = layout;
    const vertexBuffers = this.vertexBuffers = [{
      arrayStride: VERTEX_STRIDE,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "unorm16x4" },
        { shaderLocation: 1, offset: 8, format: "snorm8x4" },
        { shaderLocation: 2, offset: 12, format: "uint32" },
        { shaderLocation: 3, offset: 16, format: "uint32" },
      ],
    }];
    this.singlePipelines = {
      ...this.makeMainPipelines(MAIN_SHADER, ""),
      pick: this.makePipeline(layout, PICK_SHADER, PICK_FORMAT, vertexBuffers, "pick"),
      barrel: this.makeBarrelPipeline(layout, BARREL_SHADER, this.format, "barrel"),
      barrelPick: this.makeBarrelPipeline(layout, BARREL_PICK_SHADER, PICK_FORMAT, "barrel-pick"),
    };
    this.pipeline = this.singlePipelines.main;
    this.pickPipeline = this.singlePipelines.pick;
    this.barrelPipeline = this.singlePipelines.barrel;
    this.barrelPickPipeline = this.singlePipelines.barrelPick;
  }

  /**
   * The draw pipelines of one main shader: opaque, opaque marking the stencil
   * (outer copper), blended, and the solder mask off and over copper. Without
   * a stencil the marking and covered variants fall back to one shade.
   */
  makeMainPipelines(code, suffix) {
    const layout = this.pipelineLayout;
    const buffers = this.vertexBuffers;
    const make = (label, variant) => this.makePipeline(layout, code, this.format, buffers, `${label}${suffix}`, variant);
    const main = make("main", { stencil: STENCIL_OPAQUE });
    const blend = make("main-blend");
    return {
      main,
      mark: this.stencil ? make("main-mark", { stencil: STENCIL_MARK }) : main,
      blend,
      mask: this.stencil ? make("mask", { stencil: STENCIL_UNMARKED }) : blend,
      maskCovered: this.stencil ? make("mask-covered", { stencil: STENCIL_MARKED, constants: { COVERED: 1 } }) : null,
    };
  }

  createOccurrenceBuffer(capacity) {
    return this.device.createBuffer({
      label: "occurrences",
      size: capacity * OCCURRENCE_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  createListBuffer(capacity) {
    return this.device.createBuffer({
      label: "visible-occurrences",
      size: capacity * 4 * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  growSlots(capacity) {
    const args = new Uint32Array(capacity * 5);
    args.set(this.slotArgs);
    const classes = new Uint32Array(capacity).fill(4);
    classes.set(this.slotClasses);
    this.slotArgs = args;
    this.slotClasses = classes;
    this.slotCapacity = capacity;
    this.argsBuffer?.destroy?.();
    this.classesBuffer?.destroy?.();
    this.argsBuffer = this.device.createBuffer({
      label: "indirect-args",
      size: args.byteLength,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.classesBuffer = this.device.createBuffer({
      label: "draw-classes",
      size: classes.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.argsBuffer, 0, args);
    this.device.queue.writeBuffer(this.classesBuffer, 0, classes);
    if (this.cull) this.cull.bindGroup = this.makeCullBindGroup();
    this.bundleCache?.clear();
  }

  // One draw's indirect slot: index count and class; the cull pass fills the instance count.
  setSlot(slot, indexCount, drawClass) {
    this.slotArgs.fill(0, slot * 5, slot * 5 + 5);
    this.slotArgs[slot * 5] = indexCount;
    this.slotClasses[slot] = drawClass;
    this.device.queue.writeBuffer(this.argsBuffer, slot * 20, this.slotArgs, slot * 5, 5);
    this.device.queue.writeBuffer(this.classesBuffer, slot * 4, this.slotClasses, slot, 1);
  }

  allocSlot(indexCount, drawClass) {
    const slot = this.freeSlots.length ? this.freeSlots.pop() : this.nextSlot++;
    if (slot >= this.slotCapacity) this.growSlots(this.slotCapacity * 2);
    this.setSlot(slot, indexCount, drawClass);
    return slot;
  }

  get occurrenceCount() {
    return this.occurrenceMatrices.length;
  }

  /**
   * Replace the occurrences every primitive and barrel is drawn at: column-major
   * 4×4 model matrices in renderer units (metres, the bundle's runtime frame),
   * or `{ matrix, key }` naming each occurrence for picks. Uploaded geometry is
   * shared; only this buffer changes. An empty list draws nothing; `null`
   * restores the single identity occurrence.
   */
  setOccurrences(occurrences) {
    const { matrices: next, keys, hiddenLayers, explode } = normalizeOccurrences(occurrences == null ? [IDENTITY] : occurrences);
    this.occurrenceMatrices = next;
    this.occurrenceKeys = keys;
    this.occurrenceHiddenLayers = hiddenLayers;
    this.occurrenceExplode = explode;
    this.identityOnly = !this.alwaysInstanced && next.length === 1 && isIdentity(next[0]);
    if (!this.identityOnly) this.ensureInstancedPipelines();
    if (next.length > this.occurrenceCapacity) {
      this.occurrenceBuffer?.destroy?.();
      this.listBuffer?.destroy?.();
      this.occurrenceCapacity = Math.max(next.length, this.occurrenceCapacity * 2);
      this.occurrenceBuffer = this.createOccurrenceBuffer(this.occurrenceCapacity);
      this.listBuffer = this.createListBuffer(this.occurrenceCapacity);
      if (this.cull) {
        this.cull.lods.destroy();
        this.cull.lods = this.createLodBuffer(this.occurrenceCapacity);
      }
      this.rebindAll();
    }
    if (next.length) this.device.queue.writeBuffer(this.occurrenceBuffer, 0, packOccurrences(next, hiddenLayers, explode));
    // New occurrences start without history: no hysteresis carried over.
    if (this.cull) this.device.queue.writeBuffer(this.cull.lods, 0, new Uint32Array(this.occurrenceCapacity).fill(LOD_CULLED));
    if (this.selectedOccurrence >= next.length) this.selectedOccurrence = -1;
    this.bundleCache.clear();
    this.invalidate();
  }

  /**
   * The copper layers each occurrence hides (layer ids per occurrence, in
   * occurrence order), without placing them again: level-of-detail history stays.
   */
  setOccurrenceHiddenLayers(hiddenLayers) {
    this.occurrenceHiddenLayers = this.occurrenceMatrices.map((_, index) => [...(hiddenLayers?.[index] || [])].map(Number));
    this.writeOccurrenceRecords();
  }

  /** Each occurrence's own stackup separation (`NO_EXPLODE` or [gap, components, mask opacity, 1]), in occurrence order. */
  setOccurrenceExplode(explode) {
    this.occurrenceExplode = this.occurrenceMatrices.map((_, index) => (explode?.[index] ? [...explode[index]].map(Number) : null));
    this.writeOccurrenceRecords();
  }

  writeOccurrenceRecords() {
    if (this.occurrenceMatrices.length) {
      this.device.queue.writeBuffer(
        this.occurrenceBuffer, 0,
        packOccurrences(this.occurrenceMatrices, this.occurrenceHiddenLayers, this.occurrenceExplode),
      );
    }
    this.invalidate();
  }

  /** Draw inner copper only for full-detail occurrences (opaque boards) or for board detail too. */
  /** Which inner copper draws (SB2-85): "all", only the lit nets' ("lit"), or "none". */
  setInnerCopperMode(mode) {
    this.setInnerCopperAtFull(false);
    if (this.innerCopperMode === mode) return;
    this.innerCopperMode = mode;
    this.invalidate();
  }

  setInnerCopperAtFull(atFull) {
    if (this.innerCopperAtFull === atFull) return;
    this.innerCopperAtFull = atFull;
    for (const entry of this.entries) {
      if (!entry.innerCopper) continue;
      entry.drawClass = drawClassOf(entry, atFull);
      this.setSlot(entry.slot, entry.indexCount, entry.drawClass);
    }    this.invalidate();
  }

  /** The board's box in its own frame (runtime units), for culling and the box stand-in. */
  setBoardBounds(bounds) {
    this.boardBounds = bounds ? [...bounds] : null;
    this.invalidate();
  }

  /** Level-of-detail thresholds in projected pixels ({ fullPx, boardPx, boxPx, keep }). */
  setLodThresholds(thresholds) {
    this.lodThresholds = normalizeLodThresholds({ ...this.lodThresholds, ...thresholds });
    this.invalidate();
  }

  /** Force a level of detail for every occurrence (LOD_FULL…LOD_BOX), or null for automatic. */
  setLodOverride(lod) {
    this.lodOverride = lod == null ? null : Number(lod);
    this.invalidate();
  }

  createLodBuffer(capacity) {
    return this.device.createBuffer({
      label: "occurrence-lods",
      size: capacity * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  createCull() {
    const device = this.device;
    const shared = this.shareFrom?.cull;
    const storage = (type) => ({ visibility: GPUShaderStage.COMPUTE, buffer: { type } });
    const layout = shared?.layout || device.createBindGroupLayout({
      label: "cull",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, ...storage("read-only-storage") },
        { binding: 2, ...storage("storage") },
        { binding: 3, ...storage("storage") },
        { binding: 4, ...storage("storage") },
        { binding: 5, ...storage("storage") },
        { binding: 6, ...storage("read-only-storage") },
      ],
    });
    let pipelines = shared && { layout, classify: shared.classify, writeArgs: shared.writeArgs };
    if (!pipelines) {
      const module = this.createShaderModule(CULL_SHADER, "cull");
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
      pipelines = {
        layout,
        classify: device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: "classify" } }),
        writeArgs: device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: "writeArgs" } }),
      };
    }
    this.cull = {
      ...pipelines,
      uniform: device.createBuffer({ label: "cull-params", size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      lods: this.createLodBuffer(this.occurrenceCapacity),
      counters: device.createBuffer({ label: "cull-counters", size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }),
      readback: device.createBuffer({ label: "cull-readback", size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
      scratch: new ArrayBuffer(192),
      reading: false,
      readAt: 0,
      bindGroup: null,
    };
    device.queue.writeBuffer(this.cull.lods, 0, new Uint32Array(this.occurrenceCapacity).fill(LOD_CULLED));
    this.cull.bindGroup = this.makeCullBindGroup();
  }

  makeCullBindGroup() {
    // The list buffer is written here and read by the render pipelines (binding 7).
    return this.device.createBindGroup({
      layout: this.cull.layout,
      entries: [
        { binding: 0, resource: { buffer: this.cull.uniform } },
        { binding: 1, resource: { buffer: this.occurrenceBuffer } },
        { binding: 2, resource: { buffer: this.cull.lods } },
        { binding: 3, resource: { buffer: this.listBuffer } },
        { binding: 4, resource: { buffer: this.cull.counters } },
        { binding: 5, resource: { buffer: this.argsBuffer } },
        { binding: 6, resource: { buffer: this.classesBuffer } },
      ],
    });
  }

  // A unit box (corners in [0, 1]³) with face normals, scaled to the board box by its draw uniform.
  createBox() {
    const faces = [
      [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
      [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
      [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
      [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
      [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
      [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
    ];
    const vertices = [];
    const indices = [];
    faces.forEach(([normal, corners], face) => {
      for (const corner of corners) vertices.push(...corner, ...normal);
      const base = face * 4;
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const vertexArray = new Float32Array(vertices);
    const indexArray = new Uint16Array(indices);
    const vertexBuffer = this.device.createBuffer({ label: "box-vertices", size: vertexArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const indexBuffer = this.device.createBuffer({ label: "box-indices", size: indexArray.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vertexBuffer, 0, vertexArray);
    this.device.queue.writeBuffer(indexBuffer, 0, indexArray);
    const drawBuffer = this.device.createBuffer({ size: DRAW_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.box = { vertexBuffer, indexBuffer, indexCount: indexArray.length, drawBuffer, bindGroup: this.makeBindGroup(drawBuffer), scratch: new Float32Array(DRAW_UNIFORM_SIZE / 4) };
    this.setSlot(1, indexArray.length, 3);
  }

  writeBoxDraw() {
    const data = this.box.scratch;
    const [x0, y0, z0, x1, y1, z1] = this.boardBounds;
    data.fill(0);
    data.set(this.boxColor, 0);
    data.set([x1 - x0, y1 - y0, z1 - z0, 0], 4);
    data.set([x0, y0, z0, 0], 8);
    this.device.queue.writeBuffer(this.box.drawBuffer, 0, data);
  }

  /**
   * Cull and choose a level of detail for every occurrence on the GPU, then
   * write each indirect draw's instance count. Recorded ahead of the panel's
   * render pass; counts are read back for the stats a few times a second.
   */
  encodeCull(encoder, panel) {
    const cull = this.cull;
    const f32 = new Float32Array(cull.scratch);
    const u32 = new Uint32Array(cull.scratch);
    f32.fill(0);
    frustumPlanes(panel.matrix).forEach((plane, index) => f32.set(plane, index * 4));
    const lod = panel.lod;
    if (lod) f32.set([...lod.eye, lod.orthographic ? 0 : 1], 24);
    const bounds = this.boardBounds || [-1e6, -1e6, -1e6, 1e6, 1e6, 1e6];
    f32.set([bounds[0], bounds[1], bounds[2], 0, bounds[3], bounds[4], bounds[5], 0], 28);
    const { fullPx, boardPx, boxPx, keep } = this.lodThresholds;
    f32.set([lod?.pixelScale || 0, fullPx, boxPx, keep], 36);
    // Without camera data or a board box every occurrence draws in full.
    const forced = this.lodOverride != null ? this.lodOverride + 1 : (!lod || !this.boardBounds ? LOD_FULL + 1 : 0);
    u32.set([this.occurrenceMatrices.length, this.selectedOccurrence + 1, forced, this.nextSlot], 40);
    u32[44] = this.barrels?.instanceCount || 0;
    f32[45] = boardPx; // extra.y, read back as a float
    this.device.queue.writeBuffer(cull.uniform, 0, cull.scratch);
    encoder.clearBuffer(cull.counters);
    const pass = encoder.beginComputePass({ label: "cull" });
    pass.setBindGroup(0, cull.bindGroup);
    pass.setPipeline(cull.classify);
    pass.dispatchWorkgroups(Math.ceil(this.occurrenceMatrices.length / 64));
    pass.setPipeline(cull.writeArgs);
    pass.dispatchWorkgroups(Math.ceil(this.nextSlot / 64));
    pass.end();
    const now = performance.now();
    if (!cull.reading && now - cull.readAt > 250) {
      encoder.copyBufferToBuffer(cull.counters, 0, cull.readback, 0, 16);
      cull.readAt = now;
      return true;
    }
    return false;
  }

  readCullCounts() {
    const cull = this.cull;
    cull.reading = true;
    const total = this.occurrenceMatrices.length;
    cull.readback.mapAsync(GPUMapMode.READ).then(() => {
      const [full, board, body, box] = new Uint32Array(cull.readback.getMappedRange().slice(0));
      cull.readback.unmap();
      this.cullCounts = { full, board: board - full, body: body - board, box, culled: Math.max(0, total - body - box) };
    }).catch(() => {}).finally(() => {
      cull.reading = false;
    });
  }

  // Instances a draw of this class ran with, from the last counts read back.
  countFor(drawClass) {
    if (this.identityOnly) return drawClass === 2 ? this.barrels?.instanceCount || 0 : drawClass === 3 ? 0 : 1;
    const { full, board, body, box } = this.cullCounts;
    if (drawClass === 5) return full + board + body;
    if (drawClass === 0) return full + board;
    if (drawClass === 1) return full;
    if (drawClass === 2) return (full + board) * (this.barrels?.instanceCount || 0);
    return box;
  }

  /** GPU bytes held by the renderer: geometry, per-occurrence data and render targets. */
  gpuMemoryBytes() {
    let bytes = 0;
    for (const entry of this.entries) bytes += (entry.vertexAllocation?.size || 0) + (entry.indexAllocation?.size || 0);
    // The arena's chunks are shared; their unused space is counted once, by the renderer that owns them.
    if (!this.shareFrom) bytes += this.arenaSlackBytes();
    for (const buffer of [this.barrels?.vertexBuffer, this.barrels?.indexBuffer, this.barrels?.instanceBuffer,
      this.barrelRecordBuffer, this.occurrenceBuffer, this.listBuffer, this.argsBuffer, this.classesBuffer,
      this.featureMaskBuffer, this.netMaskBuffer, this.cull?.lods]) bytes += buffer?.size || 0;
    // Depth (4 bytes) and pick (rg32uint, 8 bytes) targets.
    bytes += this.canvas.width * this.canvas.height * 12;
    return bytes;
  }

  /** Where `gpuMemoryBytes()` goes (SB2-80): geometry by entry kind, per-occurrence data and targets. */
  gpuMemoryBreakdown() {
    const geometry = {};
    let vertex = 0;
    let index = 0;
    for (const entry of this.entries) {
      const v = entry.vertexAllocation?.size || 0;
      const i = entry.indexAllocation?.size || 0;
      vertex += v;
      index += i;
      const kind = entry.kind === "copper" ? `copper:${entry.layerId ?? "?"}`
        : entry.boardRole ? `${entry.kind}:${entry.boardRole}` : entry.kind || "other";
      geometry[kind] = (geometry[kind] || 0) + v + i;
    }
    const barrels = [this.barrels?.vertexBuffer, this.barrels?.indexBuffer, this.barrels?.instanceBuffer, this.barrelRecordBuffer]
      .reduce((sum, buffer) => sum + (buffer?.size || 0), 0);
    const occurrences = [this.occurrenceBuffer, this.listBuffer, this.argsBuffer, this.classesBuffer, this.featureMaskBuffer,
      this.netMaskBuffer, this.cull?.lods].reduce((sum, buffer) => sum + (buffer?.size || 0), 0);
    // SB2-90: the arena chunks that hold the geometry (shared in a scene; reported by their owner).
    const arena = this.shareFrom ? null : this.arenaStats();
    return { vertex, index, geometry, barrels, occurrences, targets: this.canvas.width * this.canvas.height * 12, entries: this.entries.length, arena };
  }

  ensureInstancedPipelines() {
    if (this.instancedPipelines) return;
    if (this.shareFrom) {
      // Scene assets compile nothing: pipelines and the cull programs are the host's.
      this.shareFrom.ensureInstancedPipelines();
      this.instancedPipelines = this.shareFrom.instancedPipelines;
      this.createBox();
      this.createCull();
      return;
    }
    const layout = this.pipelineLayout;
    this.instancedPipelines = {
      ...this.makeMainPipelines(MAIN_SHADER_INSTANCED, "-instanced"),
      pick: this.makePipeline(layout, PICK_SHADER_INSTANCED, PICK_FORMAT, this.vertexBuffers, "pick-instanced"),
      barrel: this.makeBarrelPipeline(layout, BARREL_SHADER_INSTANCED, this.format, "barrel-instanced", false),
      barrelPick: this.makeBarrelPipeline(layout, BARREL_PICK_SHADER_INSTANCED, PICK_FORMAT, "barrel-pick-instanced", false),
      box: this.makePipeline(layout, BOX_SHADER, this.format, BOX_VERTEX_BUFFERS, "box"),
      boxPick: this.makePipeline(layout, BOX_PICK_SHADER, PICK_FORMAT, BOX_VERTEX_BUFFERS, "box-pick"),
    };
    this.createBox();
    this.createCull();
  }

  // The pipelines and instance counts for the current occurrences.
  // The one-board view draws directly; occurrences draw indirectly, counted by the cull pass.
  drawSet() {
    if (this.identityOnly) {
      return { pipelines: this.singlePipelines, indirect: false, barrelInstances: this.barrels?.instanceCount || 0 };
    }
    return { pipelines: this.instancedPipelines, indirect: true, barrelInstances: 0 };
  }

  drawEntry(pass, entry, indirect) {
    pass.setBindGroup(0, entry.bindGroup);
    const vertex = entry.vertexAllocation;
    const index = entry.indexAllocation;
    pass.setVertexBuffer(0, vertex.buffer, vertex.offset, vertex.size);
    pass.setIndexBuffer(index.buffer, entry.indexFormat, index.offset, index.size);
    if (indirect) pass.drawIndexedIndirect(this.argsBuffer, entry.slot * 20);
    else pass.drawIndexed(entry.indexCount, entry.placementCount || 1);
  }

  drawBarrels(pass, pipeline, indirect, barrelInstances) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.barrels.bindGroup);
    pass.setVertexBuffer(0, this.barrels.vertexBuffer);
    pass.setVertexBuffer(1, this.barrels.instanceBuffer);
    pass.setIndexBuffer(this.barrels.indexBuffer, "uint16");
    if (indirect) pass.drawIndexedIndirect(this.argsBuffer, 0);
    else pass.drawIndexed(this.barrels.indexCount, barrelInstances);
  }

  drawBox(pass, pipeline) {
    if (!this.box || !this.boardBounds) return;
    this.writeBoxDraw();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.box.bindGroup);
    pass.setVertexBuffer(0, this.box.vertexBuffer);
    pass.setIndexBuffer(this.box.indexBuffer, "uint16");
    pass.drawIndexedIndirect(this.argsBuffer, 20);
  }

  createNetMaskBuffer(capacity) {
    return this.device.createBuffer({
      label: "net-emphasis-mask",
      size: capacity * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  uploadNetMask() {
    let data;
    if (this.occurrenceEmphasis && !this.identityOnly) {
      const table = packOccurrenceEmphasis(this.occurrenceEmphasis);
      this.emphasisStride = table.stride;
      data = table.data;
    } else {
      this.emphasisStride = 0;
      data = packNetEmphasis(this.emphasizedNetIds, this.netMaskCapacity);
    }
    if (data.length > this.netMaskCapacity) {
      this.netMaskBuffer?.destroy?.();
      let capacity = this.netMaskCapacity;
      while (capacity < data.length) capacity *= 2;
      this.netMaskCapacity = capacity;
      this.netMaskBuffer = this.createNetMaskBuffer(capacity);
      this.rebindAll();
    }
    const padded = new Uint32Array(this.netMaskCapacity);
    padded.set(data);
    this.device.queue.writeBuffer(this.netMaskBuffer, 0, padded);
  }

  /**
   * SB2-31: light nets per occurrence of this asset. `rows[i]` is a Map of net
   * id → packed colour (net-emphasis.js `packEmphasisColor`) for the i-th
   * occurrence, or null; `rows` null goes back to the shared net mask.
   * `dimCopper` dims unlit copper even when this asset lights nothing.
   */
  setOccurrenceEmphasis(rows, { dimCopper = false } = {}) {
    const lit = Array.isArray(rows) && rows.some((row) => row && row.size);
    this.occurrenceEmphasis = lit ? rows.map((row) => (row && row.size ? new Map(row) : null)) : null;
    this.dimCopper = Boolean(dimCopper);
    this.uploadNetMask();
    this.invalidate();
  }

  /** True while any net is emphasised or the scene asks to dim copper. */
  get netHighlightActive() {
    return Boolean(this.emphasizedNetIds.size || this.occurrenceEmphasis || this.dimCopper);
  }

  /**
   * Replace the emphasised net set. Idempotent; the mask is rebuilt from
   * scratch so no stale slot survives, and the buffer only grows.
   */
  setEmphasizedNetIds(ids) {
    this.emphasizedNetIds = normalizeNetIds(ids);
    this.occurrenceEmphasis = null;
    const capacity = netMaskCapacityFor(this.emphasizedNetIds, this.netMaskCapacity);
    if (capacity !== this.netMaskCapacity) {
      this.netMaskBuffer?.destroy?.();
      this.netMaskCapacity = capacity;
      this.netMaskBuffer = this.createNetMaskBuffer(capacity);
      this.rebindAll();
    }
    this.uploadNetMask();
    this.invalidate();
  }

  rebindAll() {
    for (const entry of this.entries) {
      entry.bindGroup = this.makeBindGroup(this.drawSlotBuffer, entry.drawSlot * DRAW_UNIFORM_SIZE);
    }
    if (this.barrels) {
      this.barrels.bindGroup = this.makeBindGroup(this.barrels.drawBuffer);
    }
    if (this.box) this.box.bindGroup = this.makeBindGroup(this.box.drawBuffer);
    if (this.cull) this.cull.bindGroup = this.makeCullBindGroup();
    this.bundleCache.clear();
  }

  createFeatureMaskBuffer(capacity) {
    return this.device.createBuffer({
      label: "feature-visibility-mask",
      size: capacity * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  createDrawSlotBuffer(capacity) {
    return this.device.createBuffer({
      label: "draw-uniforms",
      size: capacity * DRAW_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  allocateDrawSlot() {
    if (this.freeDrawSlots.length) return this.freeDrawSlots.pop();
    if (this.nextDrawSlot >= this.drawSlotCapacity) {
      const capacity = this.drawSlotCapacity * 2;
      const staging = new Float32Array(capacity * DRAW_FLOATS);
      staging.set(this.drawStaging);
      this.drawSlotBuffer.destroy?.();
      this.drawSlotCapacity = capacity;
      this.drawSlotBuffer = this.createDrawSlotBuffer(capacity);
      this.drawStaging = staging;
      this.rebindAll();
    }
    return this.nextDrawSlot++;
  }

  /** Upload the draw uniforms of the given entries in one write. */
  flushDraws(entries) {
    if (!entries.length) return;
    let first = Infinity;
    let last = -1;
    for (const entry of entries) {
      first = Math.min(first, entry.drawSlot);
      last = Math.max(last, entry.drawSlot);
    }
    this.device.queue.writeBuffer(
      this.drawSlotBuffer,
      first * DRAW_UNIFORM_SIZE,
      this.drawStaging,
      first * DRAW_FLOATS,
      (last - first + 1) * DRAW_FLOATS,
    );
  }

  /** Mark the picture stale after a change the per-frame inputs do not show. */
  invalidate() {
    this.version += 1;
  }

  setBarrelColor(color) {
    this.barrelColor = [...color];
    this.invalidate();
  }

  makeBindGroup(drawBuffer, drawOffset = 0) {
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globalBuffer } },
        { binding: 1, resource: { buffer: drawBuffer, offset: drawOffset, size: DRAW_UNIFORM_SIZE } },
        { binding: 2, resource: { buffer: this.layerOffsetBuffer } },
        { binding: 3, resource: { buffer: this.featureMaskBuffer } },
        { binding: 4, resource: { buffer: this.netMaskBuffer } },
        { binding: 5, resource: { buffer: this.occurrenceBuffer } },
        { binding: 6, resource: { buffer: this.barrelRecordBuffer } },
        { binding: 7, resource: { buffer: this.listBuffer } },
        { binding: 8, resource: { buffer: this.placementBuffer } },
      ],
    });
  }

  uploadFeatureMask() {
    const data = packFeatureVisibility(
      this.hiddenFeatureIds,
      this.featureMaskCapacity,
    );
    this.device.queue.writeBuffer(this.featureMaskBuffer, 0, data);
  }

  /**
   * Replace the hidden feature set (component feature ids). Idempotent; safe
   * before any primitives exist. Invalid ids are dropped, the mask is rebuilt
   * from scratch so no stale zeros survive, and the buffer only grows — a
   * growth recreates the buffer and rebinds every draw.
   */
  setHiddenFeatureIds(ids) {
    this.hiddenFeatureIds = normalizeHiddenFeatureIds(ids);
    const capacity = featureMaskCapacityFor(
      this.hiddenFeatureIds,
      this.featureMaskCapacity,
    );
    if (capacity !== this.featureMaskCapacity) {
      this.featureMaskBuffer?.destroy?.();
      this.featureMaskCapacity = capacity;
      this.featureMaskBuffer = this.createFeatureMaskBuffer(capacity);
      this.rebindAll();
    }
    this.uploadFeatureMask();
    this.bundleCache.clear();
    this.invalidate();
  }

  depthStencilState(stencil = null) {
    const state = { format: this.depthFormat, depthWriteEnabled: true, depthCompare: "greater" };
    if (this.stencil && stencil) {
      state.stencilFront = stencil;
      state.stencilBack = stencil;
    }
    return state;
  }

  makePipeline(layout, code, format, buffers, label, variant = {}) {
    const module = this.createShaderModule(code, label);
    return this.device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: "vs", buffers },
      fragment: {
        module,
        entryPoint: "fs",
        ...(variant.constants ? { constants: variant.constants } : {}),
        targets: [{
          format,
          blend: format === PICK_FORMAT ? undefined : {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: this.depthStencilState(variant.stencil),
      multisample: { count: 1 },
    });
  }

  makeBarrelPipeline(layout, code, format, label, instanceBuffer = true) {
    const module = this.createShaderModule(code, label);
    return this.device.createRenderPipeline({
      layout,
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 28,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32" },
            ],
          },
          // Instanced pipelines read barrel records from storage instead.
          ...(instanceBuffer ? [{
            arrayStride: 40,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 3, offset: 0, format: "float32x4" },
              { shaderLocation: 4, offset: 16, format: "float32x2" },
              { shaderLocation: 5, offset: 24, format: "uint32x4" },
            ],
          }] : []),
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{
          format,
          blend: format === PICK_FORMAT ? undefined : {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: this.depthStencilState(),
    });
  }

  createShaderModule(code, label) {
    const module = this.device.createShaderModule({ label: `pcb-${label}`, code });
    if (typeof module.getCompilationInfo === "function") {
      void module.getCompilationInfo().then((info) => {
        const messages = [...info.messages || []];
        if (!messages.length) return;
        console.groupCollapsed(`WebGPU shader compilation info: pcb-${label}`);
        for (const message of messages) {
          console[message.type === "error" ? "error" : "warn"](
            `${message.type} ${message.lineNum}:${message.linePos} ${message.message}`,
          );
        }
        console.groupEnd();
      });
    }
    return module;
  }

  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.depth?.destroy();
    this.pickTexture?.destroy();
    this.depth = this.device.createTexture({ size: [width, height], format: this.depthFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.pickTexture = this.device.createTexture({ size: [width, height], format: PICK_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  }

  addPrimitive(primitive, metadata) {
    const count = primitive.position.length / 3;
    const vertices = new ArrayBuffer(count * VERTEX_STRIDE);
    const vertexU32 = new Uint32Array(vertices);
    const vertexU16 = new Uint16Array(vertices);
    const vertexI8 = new Int8Array(vertices);
    const quant = quantisationOf(primitive.position);
    for (let index = 0; index < count; index += 1) {
      const word = index * 5;
      const source = index * 3;
      packPosition(vertexU16, word * 2, primitive.position, source, quant);
      packNormal(vertexI8, (word + 2) * 4, primitive.normal, source);
      vertexU32[word + 3] = primitive.netId[index] || 0;
      vertexU32[word + 4] = primitive.objectFeatureId[index] || 0;
    }
    // SB2-90: geometry lives in a shared arena, not a buffer of its own.
    const arenas = this.arenas();
    const vertexAllocation = arenas.vertex.alloc(vertices.byteLength);
    arenas.vertex.write(vertexAllocation, vertices);
    const { indices, format: indexFormat } = packIndices(primitive.indices, count);
    const indexAllocation = arenas.index.alloc(indices.byteLength);
    arenas.index.write(indexAllocation, indices);
    const drawSlot = this.allocateDrawSlot();
    const bindGroup = this.makeBindGroup(this.drawSlotBuffer, drawSlot * DRAW_UNIFORM_SIZE);
    const drawClass = drawClassOf(metadata, this.innerCopperAtFull);
    const entry = {
      ...metadata,
      drawClass,
      // An instanced component (SB2-86) draws once per placement for each full-detail occurrence.
      slot: this.allocSlot(primitive.indices.length, metadata.placements ? COMPONENT_SLOT_CLASS | (metadata.placements << 3) : drawClass),
      placementCount: metadata.placements || 0,
      placementBase: 0,
      bounds: primitive.bounds || metadata.bounds || null,
      id: this.nextEntryId++,
      vertexAllocation,
      indexAllocation,
      quantMin: quant.min,
      quantSize: quant.size,
      indexFormat,
      indexCount: primitive.indices.length,
      drawSlot,
      bindGroup,
    };
    this.entries.push(entry);
    this.bundleCache.clear();
    this.invalidate();
    return entry;
  }

  /** The vertex and index arenas (SB2-90), owned by the host renderer and shared by a scene's assets. */
  arenas() {
    const owner = this.shareFrom || this;
    owner.geometryArenas ??= {
      vertex: new GeometryArena(owner.device, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, "geometry-vertices"),
      index: new GeometryArena(owner.device, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, "geometry-indices"),
    };
    return owner.geometryArenas;
  }

  /** Bytes the arena chunks hold beyond what geometry uses. */
  arenaSlackBytes() {
    const arenas = this.geometryArenas;
    if (!arenas) return 0;
    return arenas.vertex.reservedBytes() - arenas.vertex.usedBytes + arenas.index.reservedBytes() - arenas.index.usedBytes;
  }

  arenaStats() {
    const arenas = this.geometryArenas;
    if (!arenas) return { chunks: 0, reserved: 0, used: 0 };
    const holes = (arena) => arena.chunks.reduce((sum, chunk) => sum
      + chunk.free.filter((range) => range.offset + range.size < chunk.size).reduce((total, range) => total + range.size, 0), 0);
    return {
      chunks: arenas.vertex.chunks.length + arenas.index.chunks.length,
      reserved: arenas.vertex.reservedBytes() + arenas.index.reservedBytes(),
      used: arenas.vertex.usedBytes + arenas.index.usedBytes,
      holes: holes(arenas.vertex) + holes(arenas.index),
    };
  }

  /**
   * The component pipelines (SB2-86) for a draw set, compiled on first use and
   * shared with the host renderer: opaque, blended (component opacity) and pick.
   */
  componentPipelines(pipelines) {
    const owner = this.shareFrom || this;
    let set = owner.componentPipelineSets.get(pipelines);
    if (!set) {
      const instanced = pipelines !== owner.singlePipelines;
      const layout = owner.pipelineLayout;
      const buffers = owner.vertexBuffers;
      const draw = instanced ? COMPONENT_SHADER_INSTANCED : COMPONENT_SHADER;
      const pick = instanced ? COMPONENT_PICK_SHADER_INSTANCED : COMPONENT_PICK_SHADER;
      const suffix = instanced ? "-instanced" : "";
      set = {
        main: owner.makePipeline(layout, draw, owner.format, buffers, `component${suffix}`, { stencil: STENCIL_OPAQUE }),
        blend: owner.makePipeline(layout, draw, owner.format, buffers, `component-blend${suffix}`),
        pick: owner.makePipeline(layout, pick, PICK_FORMAT, buffers, `component-pick${suffix}`),
      };
      owner.componentPipelineSets.set(pipelines, set);
    }
    return set;
  }

  /**
   * Add component models drawn at their placements (SB2-86). Each model is
   * `{primitive, placements, metadata}`: the primitive in the model's own frame,
   * placements as `{rows: [12 numbers], featureId}`. Returns the entries.
   */
  addInstancedPrimitives(models) {
    const entries = models.map(({ primitive, placements, metadata }) => {
      const entry = this.addPrimitive(primitive, { ...metadata, placements: placements.length });
      entry.placementRecords = placements;
      return entry;
    });
    this.writePlacements();
    return entries;
  }

  /** Lay every instanced entry's placements out in one storage buffer, in entry order. */
  writePlacements() {
    const instanced = this.entries.filter((entry) => entry.placementRecords);
    const total = instanced.reduce((sum, entry) => sum + entry.placementRecords.length, 0);
    const data = new ArrayBuffer(Math.max(1, total) * PLACEMENT_STRIDE);
    const floats = new Float32Array(data);
    const words = new Uint32Array(data);
    let base = 0;
    for (const entry of instanced) {
      entry.placementBase = base;
      for (const placement of entry.placementRecords) {
        const word = base * (PLACEMENT_STRIDE / 4);
        floats.set(placement.rows, word);
        words[word + 12] = placement.featureId || 0;
        base += 1;
      }
    }
    if (this.placementBuffer.size < data.byteLength) {
      this.placementBuffer.destroy?.();
      this.placementBuffer = this.device.createBuffer({
        label: "component-placements",
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.rebindAll();
    }
    this.device.queue.writeBuffer(this.placementBuffer, 0, data);
    this.invalidate();
  }

  removeEntries(entries) {
    if (!entries?.length) return;
    const removeIds = new Set(entries.map((entry) => entry.id));
    for (const entry of entries) {
      const arenas = this.arenas();
      if (entry.vertexAllocation) arenas.vertex.free(entry.vertexAllocation);
      if (entry.indexAllocation) arenas.index.free(entry.indexAllocation);
      this.freeDrawSlots.push(entry.drawSlot);
      if (entry.slot != null) {
        this.setSlot(entry.slot, 0, 4);
        this.freeSlots.push(entry.slot);
      }
    }
    this.entries = this.entries.filter((entry) => !removeIds.has(entry.id));
    if (entries.some((entry) => entry.placementRecords)) this.writePlacements();
    this.bundleCache.clear();
    this.invalidate();
  }

  dispose() {
    this.removeEntries(this.entries);
    if (!this.shareFrom) {
      this.geometryArenas?.vertex.destroy();
      this.geometryArenas?.index.destroy();
      this.geometryArenas = null;
    }
    if (this.barrels) {
      this.barrels.vertexBuffer?.destroy?.();
      this.barrels.indexBuffer?.destroy?.();
      this.barrels.instanceBuffer?.destroy?.();
      this.barrels.drawBuffer?.destroy?.();
      this.barrels = null;
    }
    this.depth?.destroy();
    this.pickTexture?.destroy();
    this.featureMaskBuffer?.destroy?.();
    this.occurrenceBuffer?.destroy?.();
    this.barrelRecordBuffer?.destroy?.();
    this.listBuffer?.destroy?.();
    this.argsBuffer?.destroy?.();
    this.classesBuffer?.destroy?.();
    for (const buffer of [this.box?.vertexBuffer, this.box?.indexBuffer, this.box?.drawBuffer,
      this.cull?.uniform, this.cull?.lods, this.cull?.counters, this.cull?.readback]) buffer?.destroy?.();
    this.box = null;
    this.cull = null;
    this.drawSlotBuffer?.destroy?.();
    this.depth = null;
    this.pickTexture = null;
    this.featureMaskBuffer = null;
    this.bundleCache.clear();
  }

  setBarrels(records) {
    if (!records?.length) return;
    const segments = 20;
    const vertices = [];
    const indices = [];
    for (const inner of [0, 1]) {
      const base = vertices.length / 7;
      for (let index = 0; index < segments; index += 1) {
        const angle = (Math.PI * 2 * index) / segments;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        for (const t of [0, 1]) vertices.push(x, y, t, inner ? -x : x, inner ? -y : y, 0, inner);
      }
      for (let index = 0; index < segments; index += 1) {
        const next = (index + 1) % segments;
        const a = base + index * 2;
        const b = base + next * 2;
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    const vertexArray = new Float32Array(vertices);
    const indexArray = new Uint16Array(indices);
    const instances = new ArrayBuffer(records.length * 40);
    const view = new DataView(instances);
    records.forEach((record, index) => {
      const offset = index * 40;
      view.setFloat32(offset, record.centerMm[0] / 1000, true);
      view.setFloat32(offset + 4, -record.centerMm[1] / 1000, true);
      view.setFloat32(offset + 8, Math.min(record.drillWidthMm, record.drillHeightMm) / 2000, true);
      view.setFloat32(offset + 12, Math.max(record.outerWidthMm, record.outerHeightMm) / 2000, true);
      view.setFloat32(offset + 16, record.startZMm / 1000, true);
      view.setFloat32(offset + 20, record.endZMm / 1000, true);
      view.setUint32(offset + 24, record.netId || 0, true);
      view.setUint32(offset + 28, record.objectFeatureId || 0, true);
      view.setUint32(offset + 32, record.startLayerId || 0, true);
      view.setUint32(offset + 36, record.endLayerId || 0, true);
    });
    const vertexBuffer = this.device.createBuffer({ size: vertexArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const indexBuffer = this.device.createBuffer({ size: indexArray.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    const instanceBuffer = this.device.createBuffer({ size: instances.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vertexBuffer, 0, vertexArray);
    this.device.queue.writeBuffer(indexBuffer, 0, indexArray);
    this.device.queue.writeBuffer(instanceBuffer, 0, instances);
    const records32 = packBarrels(records);
    this.barrelRecordBuffer?.destroy?.();
    this.barrelRecordBuffer = this.device.createBuffer({ label: "barrel-records", size: records32.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.barrelRecordBuffer, 0, records32);
    const drawBuffer = this.device.createBuffer({ size: DRAW_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.barrels = { records, vertexBuffer, indexBuffer, instanceBuffer, indexCount: indexArray.length, instanceCount: records.length, drawBuffer, bindGroup: null };
    this.setSlot(0, indexArray.length, 2);
    // Every bind group carries the barrel records: rebuild them all (this one included).
    this.rebindAll();
    this.invalidate();
  }

  render(options) {
    const { panels, layerOffsets } = options;
    this.resize();
    this.device.queue.writeBuffer(this.layerOffsetBuffer, 0, layerOffsets);
    const targetView = this.context.getCurrentTexture().createView();
    let triangles = 0;
    let draws = 0;
    panels.forEach((panel, panelIndex) => {
      const encoder = this.device.createCommandEncoder();
      const readCounts = !this.identityOnly && this.encodeCull(encoder, panel);
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          clearValue: { r: 0.91, g: 0.93, b: 0.94, a: 1 },
          loadOp: panelIndex === 0 ? "clear" : "load",
          storeOp: "store",
        }],
        depthStencilAttachment: this.depthAttachment(),
      });
      const viewport = clampViewport(panel.viewport, this.canvas.width, this.canvas.height);
      pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
      pass.setScissorRect(viewport.x, viewport.y, viewport.width, viewport.height);
      const counted = this.encodeDraws(pass, panel, options);
      triangles += counted.triangles;
      draws += counted.draws;
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      if (readCounts) this.readCullCounts();
    });
    this.frameStats = { triangles: Math.round(triangles), draws };
  }

  /**
   * IN-60: draw one panel into targets of the caller's (an inset), not
   * the main canvas. Its own submit, so it never shares the globals or draw
   * slots of the main frame's; nothing the main frame reads is touched, so
   * the main view stays pixel-identical. One-board only: no cull pass.
   *
   * `target` = { colorView, depthView, width, height }; the panel's viewport
   * is the inset's rectangle inside those targets.
   */
  renderInto(target, panel, options) {
    if (!this.identityOnly) throw new Error("renderInto: one-board renderer only");
    const encoder = this.device.createCommandEncoder({ label: "inset" });
    const depthAttachment = { view: target.depthView, depthClearValue: 0, depthLoadOp: "clear", depthStoreOp: "store" };
    if (this.stencil) Object.assign(depthAttachment, { stencilClearValue: 0, stencilLoadOp: "clear", stencilStoreOp: "discard" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target.colorView,
        clearValue: { r: 0.91, g: 0.93, b: 0.94, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: depthAttachment,
    });
    const viewport = clampViewport(panel.viewport, target.width, target.height);
    pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
    pass.setScissorRect(viewport.x, viewport.y, viewport.width, viewport.height);
    const counted = this.encodeDraws(pass, panel, options);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return counted;
  }

  /**
   * Record this renderer's draws for one panel into an open render pass, and
   * count them. `render` wraps it for one renderer; a `SceneRenderer` calls it
   * for every asset into a shared pass.
   */
  encodeDraws(pass, panel, {
    activeNetId,
    selectedFeatureId,
    time,
    visibleLayers,
    showBoard,
    showComponents,
    showPaste = true,
    componentOpacity,
    boardOpacity,
    isolateNet,
    compareMode = false,
    compareOffsets = new Map(),
    layerAlphas = null,
    visibleTileIds = null,
  }) {
    let triangles = 0;
    let draws = 0;
    if (this.stencil) pass.setStencilReference(1);
    this.writeGlobals(panel.matrix, activeNetId, panel.layerId, time, selectedFeatureId);
    const { pipelines, indirect, barrelInstances } = this.drawSet();
    // Paste would sit over highlighted pads; it steps aside while a net is lit.
    const hidePaste = !showPaste || Boolean(activeNetId || this.netHighlightActive);
    const visibleEntries = this.entries.filter((entry) =>
      this.visible(entry, panel.layerId, visibleLayers, showBoard, showComponents, componentOpacity, compareMode, visibleTileIds)
      && !(hidePaste && entry.boardRole === "paste"));
    // Blended entries (mask, silkscreen, placeholders) draw after the opaque
    // ones, the barrels and the stand-in boxes, so the copper under the mask
    // shows through it. Marking copper goes last among the opaque ones, which
    // keeps pipeline switches to one.
    const opaqueEntries = visibleEntries
      .filter((entry) => !blendRank(entry))
      .sort((a, b) => Number(Boolean(a.stencilMark)) - Number(Boolean(b.stencilMark)));
    const blendedEntries = visibleEntries
      .filter((entry) => blendRank(entry))
      .sort((a, b) => blendRank(a) - blendRank(b));
    for (const entry of visibleEntries) {
      this.writeDraw(
        entry,
        activeNetId,
        componentOpacity,
        boardOpacity,
        isolateNet,
        compareMode,
        compareOffsets.get(entry.layerId),
        layerAlphas?.get(entry.layerId) ?? 1,
      );
    }
    this.flushDraws(visibleEntries);
    if (opaqueEntries.length > 64) {
      pass.executeBundles([this.renderBundle(opaqueEntries, panel.layerId)]);
    } else {
      this.drawEntries(pass, opaqueEntries, pipelines, indirect);
    }
    for (const entry of visibleEntries) triangles += entry.indexCount / 3 * this.countFor(entry.drawClass) * (entry.placementCount || 1);
    draws += visibleEntries.length;
    if (!compareMode && this.barrels && (panel.layerId === 0 || visibleLayers.has(panel.layerId))) {
      this.writeBarrelDraw(isolateNet);
      this.drawBarrels(pass, pipelines.barrel, indirect, barrelInstances);
      triangles += this.barrels.indexCount / 3 * this.countFor(2);
      draws += 1;
    }
    if (indirect && !compareMode) {
      this.drawBox(pass, pipelines.box);
      triangles += 12 * this.countFor(3);
      draws += 1;
    }
    this.drawBlended(pass, blendedEntries, pipelines, indirect);
    return { triangles, draws };
  }

  depthAttachment() {
    const attachment = { view: this.depth.createView(), depthClearValue: 0, depthLoadOp: "clear", depthStoreOp: "store" };
    if (this.stencil) Object.assign(attachment, { stencilClearValue: 0, stencilLoadOp: "clear", stencilStoreOp: "discard" });
    return attachment;
  }

  /** Opaque entries; `encoder` is a render pass or a render bundle encoder. */
  drawEntries(encoder, entries, pipelines, indirect) {
    let pipeline = null;
    for (const entry of entries) {
      const next = entry.placementCount ? this.componentPipelines(pipelines).main : entry.stencilMark ? pipelines.mark : pipelines.main;
      if (next !== pipeline) {
        encoder.setPipeline(next);
        pipeline = next;
      }
      this.drawEntry(encoder, entry, indirect);
    }
  }

  /** Blended entries in rank order; the mask draws twice, over and off copper. */
  drawBlended(pass, entries, pipelines, indirect) {
    for (const entry of entries) {
      if (entry.boardRole === "soldermask" && entry.kind === "board") {
        pass.setPipeline(pipelines.mask);
        this.drawEntry(pass, entry, indirect);
        if (pipelines.maskCovered) {
          pass.setPipeline(pipelines.maskCovered);
          this.drawEntry(pass, entry, indirect);
        }
      } else {
        pass.setPipeline(entry.placementCount ? this.componentPipelines(pipelines).blend : pipelines.blend);
        this.drawEntry(pass, entry, indirect);
      }
    }
  }

  /** Show or hide the boxes standing in for footprints without a 3D model. */
  setPlaceholdersVisible(visible) {
    this.showPlaceholders = Boolean(visible);
    this.invalidate();
  }

  visible(entry, panelLayer, visibleLayers, showBoard, showComponents, componentOpacity, compareMode = false, visibleTileIds = null) {
    if (entry.placeholder && !this.showPlaceholders) return false;
    if (entry.kind === "board" && entry.boardRole === "pad") return false;
    if (!compareMode && entry.kind === "copper" && visibleTileIds && !visibleTileIds.has(entry.tileId)) return false;
    if (compareMode) return entry.kind === "copper" && visibleLayers.has(entry.layerId);
    if (entry.innerCopper && this.innerCopperMode === "none") return false;
    // Paste belongs to its copper layer: shown with it, whatever the substrate does.
    if (entry.boardRole === "paste") return panelLayer === 0 && visibleLayers.has(entry.layerId);
    if (entry.kind === "board") return panelLayer === 0 && showBoard;
    if (entry.kind === "component") return panelLayer === 0 && showComponents && componentOpacity > 0.001;
    return panelLayer ? entry.layerId === panelLayer : visibleLayers.has(entry.layerId);
  }

  writeGlobals(matrix, activeNetId, selectedLayer, time, selectedFeatureId = 0) {
    const data = this.globalScratch;
    const floats = this.globalScratchF32;
    floats.fill(0);
    floats.set(matrix, 0);
    const view = this.globalScratchView;
    view.setUint32(64, activeNetId || 0, true);
    view.setUint32(68, selectedLayer || 0, true);
    view.setFloat32(72, time, true);
    view.setFloat32(76, activeNetId || this.netHighlightActive ? 1 : 0, true);
    view.setUint32(80, selectedFeatureId || 0, true);
    // Read only by the instanced shaders (`selectedOccurrence`, `occurrenceBase`); padding to the one-board ones.
    view.setUint32(84, this.selectedOccurrence >= 0 ? this.selectedOccurrence + 1 + this.occurrenceBase : 0, true);
    view.setUint32(88, this.occurrenceBase, true);
    view.setUint32(92, this.emphasisStride, true); // `emphasisStride` (SB2-31), instanced shaders only
    floats.set([0.35, -0.5, 0.8, 0], 24);
    this.device.queue.writeBuffer(this.globalBuffer, 0, data);
  }

  writeDraw(
    entry,
    activeNetId,
    componentOpacity,
    boardOpacity = 1,
    isolateNet = false,
    compareMode = false,
    compareOffset = null,
    layerAlpha = 1,
  ) {
    const data = this.drawStaging.subarray(entry.drawSlot * DRAW_FLOATS, (entry.drawSlot + 1) * DRAW_FLOATS);
    data.fill(0);
    const color = entry.color || entry.material.baseColor;
    data.set(color, 0);
    // material.z: full component opacity for translucent placeholders (selected ones turn solid).
    // material.w is the occurrence list the instanced shaders read; the one-board ones ignore it.
    data.set([
      entry.material.metallic || 0,
      entry.material.roughness ?? 0.72,
      entry.opacityScale != null ? componentOpacity : 0,
      LIST_OF_CLASS[entry.drawClass] ?? 1,
    ], 4);
    const boardOverlayOffset = boardContextOffset(entry);
    data.set([
      compareOffset?.[0] || 0,
      compareOffset?.[1] || 0,
      (compareMode ? -(entry.baseZ || 0) : entry.layerOffset || 0) + boardOverlayOffset,
      // The layer + 1 an occurrence can hide (SB2-31e); only the instanced shaders read it.
      entry.kind === "copper" || entry.boardRole === "paste" ? Number(entry.layerId || 0) + 1 : 0,
    ], 8);
    const materialAlpha = Number.isFinite(color?.[3]) ? color[3] : 1;
    const opacity = entry.kind === "component"
      ? componentOpacity * (entry.opacityScale ?? 1)
      : entry.kind === "board" && entry.boardRole !== "paste"
        ? boardOpacity * boardRoleOpacity(entry, materialAlpha)
        : layerAlpha;
    const kind = entry.kind === "copper" ? 1 : entry.kind === "component" ? 2 : 0;
    const isolate = isolateNet ? 1 : entry.innerCopper && this.innerCopperMode === "lit" ? 2 : 0;
    data.set([kind, opacity, isolate, compareMode ? 1 : 0], 12);
    if (entry.placementCount) {
      const words = new Uint32Array(data.buffer, data.byteOffset + 64, 2);
      words[0] = entry.placementBase;
      words[1] = entry.placementCount;
    }
    // SB2-89: the bounds the positions were quantised in.
    data.set(entry.quantMin, 20);
    data.set(entry.quantSize, 24);
  }

  writeBarrelDraw(isolateNet = false) {
    const data = this.barrelDrawScratch;
    data.fill(0);
    data.set(this.barrelColor, 0);
    data.set([0.75, 0.32, 0, 0], 4);
    data.set([1, 1, isolateNet ? 1 : 0, 0], 12);
    this.device.queue.writeBuffer(this.barrels.drawBuffer, 0, data);
  }

  renderBundle(entries, panelLayerId) {
    const { pipelines, indirect } = this.drawSet();
    // A repack (SB2-90) moves geometry: bundles recorded before it name the old ranges.
    const { vertex, index } = this.arenas();
    const key = `${panelLayerId}:${indirect ? "indirect" : "single"}:${vertex.generation}.${index.generation}:${entries.map((entry) => entry.id).join(",")}`;
    const cached = this.bundleCache.get(key);
    if (cached) return cached;
    const encoder = this.device.createRenderBundleEncoder({
      colorFormats: [this.format],
      depthStencilFormat: this.depthFormat,
    });
    this.drawEntries(encoder, entries, pipelines, indirect);
    const bundle = encoder.finish();
    this.bundleCache.set(key, bundle);
    if (this.bundleCache.size > 32) this.bundleCache.delete(this.bundleCache.keys().next().value);
    return bundle;
  }

  pick(panel, x, y, options) {
    const operation = this.pickSerial.then(() => this.performPick(panel, x, y, options));
    this.pickSerial = operation.catch(() => 0);
    return operation;
  }

  async performPick(panel, x, y, options) {
    this.resize();
    const pixelX = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(x)));
    const pixelY = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(y)));
    this.device.queue.writeBuffer(this.layerOffsetBuffer, 0, options.layerOffsets);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.pickTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: this.depthAttachment(),
    });
    const viewport = clampViewport(panel.viewport, this.canvas.width, this.canvas.height);
    pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
    pass.setScissorRect(viewport.x, viewport.y, viewport.width, viewport.height);
    this.encodePick(pass, panel, options);
    pass.end();
    return this.readPick(encoder, pixelX, pixelY);
  }

  /** Record this renderer's pick draws into an open pass (see `encodeDraws`). */
  encodePick(pass, panel, options) {
    this.writeGlobals(
      panel.matrix,
      options.activeNetId,
      panel.layerId,
      performance.now() / 1000,
      options.selectedFeatureId,
    );
    // Occurrences pick through the lists and counts of the last rendered frame.
    const { pipelines, indirect, barrelInstances } = this.drawSet();
    pass.setPipeline(pipelines.pick);
    const pickEntries = [];
    for (const entry of this.entries) {
      if (!this.visible(
        entry,
        panel.layerId,
        options.visibleLayers,
        options.showBoard,
        options.showComponents,
        options.componentOpacity,
        options.compareMode,
        options.visibleTileIds,
      )) continue;
      // The one-board view never picked the board. A system scene picks its
      // substrate as feature 0 (which board); mask and silkscreen stay out so
      // copper under them is still pickable.
      if (entry.kind === "board" && (this.identityOnly || entry.boardRole !== "substrate")) continue;
      this.writeDraw(
        entry,
        options.activeNetId,
        options.componentOpacity,
        options.boardOpacity,
        options.isolateNet,
        options.compareMode,
        options.compareOffsets?.get(entry.layerId),
      );
      pickEntries.push(entry);
    }
    // One upload for the uniforms just written; the draws read them at submit.
    this.flushDraws(pickEntries);
    for (const entry of pickEntries) {
      pass.setPipeline(entry.placementCount ? this.componentPipelines(pipelines).pick : pipelines.pick);
      this.drawEntry(pass, entry, indirect);
    }
    if (!options.compareMode && this.barrels) {
      this.writeBarrelDraw(options.isolateNet);
      this.drawBarrels(pass, pipelines.barrelPick, indirect, barrelInstances);
    }
    if (indirect && !options.compareMode) this.drawBox(pass, pipelines.boxPick);
  }

  // Copy one pick texel, submit, and decode it. Occurrence numbers are scene-wide.
  async readPick(encoder, pixelX, pixelY) {
    const readBuffer = this.device.createBuffer({
      label: "pick-readback", // one rg32uint texel; rows are 256-byte aligned
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyTextureToBuffer(
      { texture: this.pickTexture, origin: { x: pixelX, y: pixelY } },
      { buffer: readBuffer, bytesPerRow: 256 },
      { width: 1, height: 1 },
    );
    this.device.queue.submit([encoder.finish()]);
    try {
      await readBuffer.mapAsync(GPUMapMode.READ);
      const view = new DataView(readBuffer.getMappedRange());
      const hit = decodePick(view.getUint32(0, true), view.getUint32(4, true));
      readBuffer.unmap();
      return { ...hit, occurrenceKey: hit.occurrenceIndex >= 0 ? this.occurrenceKeys[hit.occurrenceIndex] ?? null : null };
    } finally {
      if (readBuffer.mapState === "mapped") readBuffer.unmap();
      readBuffer.destroy();
    }
  }
}

// The occurrence list each draw class reads (occurrences.js LIST_*).
const LIST_OF_CLASS = Object.freeze({ 0: 1, 1: 0, 5: 2 });

/**
 * A primitive's draw class: components (and inner copper under an opaque
 * board) at full detail, substrate and mask down to body detail, the rest
 * (outer copper, silkscreen, paste) down to board detail.
 */
/**
 * SB2-89: a primitive's positions are stored as unorm16 fractions of its own
 * bounds. The step is the extent ÷ 65,535 on each axis: ~1.5 µm on a 100 mm
 * copper tile, finer still through the thickness of thin layers.
 */
export function quantisationOf(position) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < position.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], size: [1, 1, 1] };
  return { min, size: min.map((low, axis) => (max[axis] > low ? max[axis] - low : 1)) };
}

/** A position as unorm16×4 at `offset` (in u16 units) within `quant`'s bounds; the fourth word unused. */
export function packPosition(target, offset, position, source, quant) {
  for (let axis = 0; axis < 3; axis += 1) {
    const fraction = (position[source + axis] - quant.min[axis]) / quant.size[axis];
    target[offset + axis] = Math.max(0, Math.min(65535, Math.round(fraction * 65535)));
  }
  target[offset + 3] = 0;
}

/** A unit normal as snorm8×4 at `offset` (SB2-84): each axis rounded to 1/127, the fourth byte unused. */
export function packNormal(target, offset, normal, source) {
  for (let axis = 0; axis < 3; axis += 1) {
    const value = Number(normal[source + axis]) || 0;
    target[offset + axis] = Math.max(-127, Math.min(127, Math.round(value * 127)));
  }
  target[offset + 3] = 0;
}

/**
 * A primitive's indices as the GPU takes them (SB2-82): 16-bit when every vertex
 * fits, padded to a 4-byte multiple for writeBuffer; otherwise 32-bit.
 */
export function packIndices(indices, vertexCount) {
  if (vertexCount <= 0x10000) {
    const packed = new Uint16Array(indices.length + (indices.length & 1));
    packed.set(indices);
    return { indices: packed, format: "uint16" };
  }
  return { indices: indices instanceof Uint32Array ? indices : new Uint32Array(indices), format: "uint32" };
}

/** GPU bytes for a primitive with `vertexCount` vertices and `indexCount` indices, as `addPrimitive` packs it. */
export function primitiveGpuBytes(vertexCount, indexCount) {
  return vertexCount * VERTEX_STRIDE + (vertexCount <= 0x10000 ? (indexCount + (indexCount & 1)) * 2 : indexCount * 4);
}

function drawClassOf(entry, innerCopperAtFull) {
  if (entry.kind === "component" || (entry.innerCopper && innerCopperAtFull)) return 1;
  if (entry.kind === "board" && (entry.boardRole === "substrate" || entry.boardRole === "soldermask")) return 5;
  return 0;
}

/** Draw order after the opaque pass: 0 = opaque, then mask, silkscreen, translucent. */
function blendRank(entry) {
  if (entry.translucent) return 3;
  if (entry.kind !== "board") return 0;
  if (entry.boardRole === "soldermask") return 1;
  if (entry.boardRole === "silkscreen") return 2;
  return 0;
}

function boardRoleOpacity(entry, materialAlpha) {
  if (entry.kind !== "board") return 1;
  if (entry.boardRole === "substrate") return 1;
  if (entry.boardRole === "soldermask") return Math.min(materialAlpha, 0.72);
  if (entry.boardRole === "silkscreen") return Math.min(materialAlpha, 0.92);
  return materialAlpha;
}

function boardContextOffset(entry) {
  if (entry.kind !== "board") return 0;
  if (entry.boardRole !== "soldermask" && entry.boardRole !== "silkscreen") return 0;
  const bounds = entry.bounds;
  const centerZ = bounds ? (bounds[2] + bounds[5]) * 0.5 : 0;
  const direction = centerZ < 0 ? -1 : 1;
  const roleOffset = entry.boardRole === "silkscreen" ? 0.000035 : 0.000018;
  return direction * roleOffset;
}

function clampViewport(viewport, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.floor(viewport.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(viewport.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.floor(viewport.width))),
    height: Math.max(1, Math.min(height - y, Math.floor(viewport.height))),
  };
}
