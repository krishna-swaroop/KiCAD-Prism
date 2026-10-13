import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { BASE_SHADERS, Renderer, SHADER_FAMILY_NAMES, shaderVariant } from "./renderer.js";
import { buildVariant, checkHooks, featureKey, hook, stripHooks } from "./shader-variants.js";

// SHA-256 of every draw and cull shader on dev a6e7a8de, before VT-01. With no
// shader feature on, the renderer must hand WebGPU exactly these texts: any
// change, even an identity one in the position path, can reorder the depth
// test between copper, mask and silkscreen 18 µm apart. Change a hash only
// with a pixel-diff record (tests/browser/pixel-diff) that shows the new picture is intended.
// The four barrel hashes changed for the stadium barrels (VT analytic spike):
// inward plating, end caps and slots; see their pixel-diff record.
const BASE_SHADER_SHA256 = {
  main: "edc1cc57115d1290ce767820b80bc8faaf12ff474e702f295ca5db5b08d3c40f",
  pick: "145be347c4265b85327be80db6d73257ef19dc6bf10cadb9922f157643b93a44",
  barrel: "e8657d0dd7d996c3c4f1d2a82dbcbde30a7c8864fa54f912868db9071bf94ce8",
  barrelPick: "f4aa4ef33489840a8a8e5ad4a7cb96a7a2e8b1dd6e88299ae220982ed16ddb2c",
  mainInstanced: "d8f31b049633ee76cd43ace316e8354851dc86d6ee2f5499b12b259d59278dae",
  pickInstanced: "a7a11f1df1349fbcdda92b92a891c4057c125a6a1a078ec5e4a167ed60adac05",
  barrelInstanced: "9d4af70e9ca825faed76e9469e67f6e160be2e051a1f528f5b790ab138ab861e",
  barrelPickInstanced: "2fb52e86d6df1c750fbdd54bdd06d4fcecb07c7d089560d7f8f20eb55952d810",
  component: "7692cd665938503eb7acc0cf1a7c2f33cdf8869b4f318103b1246ebf5c1b5139",
  componentInstanced: "ce6f954921f8b3ff0eea9fc1879f2c3c3a88b8979502c9d9d2fb8d0ba38086c6",
  componentPick: "368a92460b1e34d5fc245c954a56bb6a7ffcbd9df00afffeff78c8a27ea4e81c",
  componentPickInstanced: "538ed7973fce9d55c98338028351f075d93b1e4586184872417700246a28588c",
  box: "2ca4a32a749c6290c48d5b4a6718acc6c22e4e621cea0ec0f28ad5de6a93b984",
  boxPick: "a95da826da3a5f31c19e2482b57e5ac2b95b5db4efda2cc13e155de9f09caa5d",
  cull: "dbe1c89ad163e653d9d0a4e2ec8f95b5ed80029b0890753aee316de66eb8104a",
};

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Which base shader each family variant is with no features.
const BASE_NAME = {
  main: ["main", "mainInstanced"],
  pick: ["pick", "pickInstanced"],
  barrel: ["barrel", "barrelInstanced"],
  barrelPick: ["barrelPick", "barrelPickInstanced"],
  component: ["component", "componentInstanced"],
  componentPick: ["componentPick", "componentPickInstanced"],
  box: [null, "box"],
  boxPick: [null, "boxPick"],
};
const VARIANTS = SHADER_FAMILY_NAMES.flatMap((family) => [false, true]
  .filter((instanced) => BASE_NAME[family][instanced ? 1 : 0])
  .map((instanced) => ({ family, instanced, base: BASE_NAME[family][instanced ? 1 : 0] })));

// A feature touching every hook, as a clip plane or attribute buffer will.
const PROBE = {
  name: "probe",
  decl: () => "fn probeTint(c: vec4f) -> vec4f { return c; }",
  vsOut: () => "  @location(9) probeWorld: vec3f,",
  vsEnd: (ctx) => `  output.probeWorld = ${ctx.world};`,
  fsBegin: () => "  if (input.probeWorld.z < -1.0e9) { discard; }",
  fsReturn: (expr, ctx) => (ctx.output === "color" ? `probeTint(${expr})` : expr),
};
const SECOND = { name: "alpha", fsReturn: (expr, ctx) => (ctx.output === "color" ? `alphaTint(${expr})` : expr) };

test("with no feature on, every shader is byte-identical to dev before VT-01", () => {
  assert.deepEqual(Object.keys(BASE_SHADERS).sort(), Object.keys(BASE_SHADER_SHA256).sort());
  for (const [name, code] of Object.entries(BASE_SHADERS)) assert.equal(sha256(code), BASE_SHADER_SHA256[name], name);
  for (const { family, instanced, base } of VARIANTS) assert.equal(shaderVariant(family, instanced, []), BASE_SHADERS[base], `${family} ${instanced}`);
});

test("no shader the renderer compiles keeps a hook marker", () => {
  for (const code of Object.values(BASE_SHADERS)) assert.doesNotMatch(code, /@feature:/);
  for (const { family, instanced } of VARIANTS) assert.doesNotMatch(shaderVariant(family, instanced, [PROBE]), /@feature:/);
});

test("every draw shader family has each hook once, one-board and instanced", () => {
  assert.deepEqual(SHADER_FAMILY_NAMES, ["main", "pick", "barrel", "barrelPick", "component", "componentPick", "box", "boxPick"]);
  assert.equal(VARIANTS.length, 14);
  for (const { family, instanced } of VARIANTS) {
    const code = shaderVariant(family, instanced, [PROBE]);
    const label = `${family}${instanced ? " instanced" : ""}`;
    // decl at module scope, before the vertex shader.
    assert.ok(code.indexOf("fn probeTint") < code.indexOf("@vertex fn vs"), label);
    // vs-out inside the vertex output struct (the struct the vertex shader returns).
    const out = code.match(/@vertex fn vs\(.*\) -> (\w+) \{/)[1];
    const struct = code.slice(code.indexOf(`struct ${out} {`), code.indexOf("};", code.indexOf(`struct ${out} {`)));
    assert.match(struct, /@location\(9\) probeWorld: vec3f/, label);
    // vs-end is the vertex shader's last statement, after the position it reads exists.
    const vs = code.slice(code.indexOf("@vertex fn vs"), code.indexOf("\n}\n", code.indexOf("@vertex fn vs")));
    assert.match(vs, /output\.probeWorld = .+;\n {2}return output;$/, label);
    // Every local the world expression reads is declared earlier in the vertex shader.
    const world = shaderVariantWorld(family, instanced);
    for (const name of ["world", "local", "occurrence", "placement"]) {
      if (!new RegExp(`\\b${name}\\b`).test(world.replace(/output\.world/g, ""))) continue;
      const declared = vs.indexOf(`let ${name} =`);
      assert.ok(declared !== -1 && declared < vs.indexOf("probeWorld"), `${label}: ${name} declared before vs-end`);
    }
    // fs-begin first, fs-return wraps the final return.
    const fs = code.slice(code.indexOf("@fragment fn fs"));
    assert.match(fs, /^@fragment fn fs\(input: \w+\) -> @location\(0\) vec(4f|2u) \{\n {2}if \(input\.probeWorld\.z < -1\.0e9\) \{ discard; \}\n/, label);
    if (SHADER_FAMILY_ENTRY_OUTPUT[family] === "color") assert.match(fs, /return probeTint\(.+\);\n\}\n$/, label);
    else assert.match(fs, /return vec2u\(.+\);\n\}\n$/, label);
  }
});

// What a feature sees as the scene position at vs-end, per family (mirrors renderer.js).
const SHADER_FAMILY_ENTRY_OUTPUT = { main: "color", pick: "pick", barrel: "color", barrelPick: "pick", component: "color", componentPick: "pick", box: "color", boxPick: "pick" };
function shaderVariantWorld(family, instanced) {
  let seen = null;
  shaderVariant(family, instanced, [{ name: "spy", vsEnd: (ctx) => { seen = ctx.world; return ""; } }]);
  return seen;
}

test("features apply in name order, whatever order they are given in", () => {
  const a = shaderVariant("main", false, [PROBE, SECOND]);
  const b = shaderVariant("main", false, [SECOND, PROBE]);
  assert.equal(a, b);
  // "alpha" wraps first, "probe" wraps its result.
  assert.match(a, /return probeTint\(alphaTint\(vec4f\(aces\(lit\), alpha\)\)\);/);
  assert.equal(featureKey([PROBE, SECOND]), "alpha+probe");
  assert.equal(featureKey([]), "");
});

test("buildVariant inserts hook code, strips markers, and rejects bad sources and features", () => {
  const source = `${hook("decl")}struct O {\n${hook("vs-out")}  p: f32,\n};\nfn vs() {\n${hook("vs-end")}  return output;\n}\nfn fs() {\n${hook("fs-begin")}${hook("fs-return")}  return x;\n}\n`;
  assert.equal(stripHooks(source), "struct O {\n  p: f32,\n};\nfn vs() {\n  return output;\n}\nfn fs() {\n  return x;\n}\n");
  assert.equal(buildVariant(source, []), stripHooks(source));
  const built = buildVariant(source, [{ name: "a", decl: () => "const k = 1;", fsBegin: () => "  k;\n", fsReturn: (e) => `f(${e})` }]);
  assert.equal(built, "const k = 1;\nstruct O {\n  p: f32,\n};\nfn vs() {\n  return output;\n}\nfn fs() {\n  k;\n  return f(x);\n}\n");
  assert.throws(() => checkHooks(source.replace(hook("vs-end"), "")), /hook vs-end appears 0 times/);
  assert.throws(() => checkHooks(source + hook("decl")), /hook decl appears 2 times/);
  assert.throws(() => checkHooks(source.replace("  return x;\n", "  x;\n")), /fs-return is not followed by a return line/);
  assert.throws(() => buildVariant(source, [{ name: "a" }, { name: "a" }]), /given twice/);
  assert.throws(() => buildVariant(source, [{ name: "Bad Name" }]), /Bad shader feature name/);
  assert.throws(() => hook("vs-start"), /Unknown shader hook/);
});

// --- Pipeline sets, against a device that records what it is asked for.

function fakeGpu() {
  const modules = [];
  const pipelines = [];
  const device = {
    modules,
    pipelines,
    addEventListener() {},
    lost: new Promise(() => {}),
    createBuffer: ({ size, label }) => ({ size, label, destroy() {} }),
    createTexture: (descriptor) => ({ ...descriptor, createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createBindGroupLayout: (descriptor) => ({ descriptor }),
    createPipelineLayout: (descriptor) => ({ descriptor }),
    createBindGroup: (descriptor) => ({ descriptor }),
    createShaderModule(descriptor) {
      const module = { ...descriptor };
      modules.push(module);
      return module;
    },
    createRenderPipeline(descriptor) {
      const pipeline = { label: descriptor.vertex.module.label.replace(/^pcb-/, ""), code: descriptor.vertex.module.code, constants: descriptor.fragment?.constants, depthStencil: descriptor.depthStencil };
      pipelines.push(pipeline);
      return pipeline;
    },
    createComputePipeline: (descriptor) => ({ label: descriptor.label, getBindGroupLayout: () => ({}) }),
    createCommandEncoder: () => ({ finish: () => ({}) }),
    queue: { writeBuffer() {}, submit() {} },
  };
  return device;
}

function fakeRenderer() {
  globalThis.GPUBufferUsage ??= { STORAGE: 1, COPY_DST: 2, COPY_SRC: 4, UNIFORM: 8, VERTEX: 16, INDEX: 32, INDIRECT: 64, MAP_READ: 128 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  globalThis.GPUTextureUsage ??= { RENDER_ATTACHMENT: 1, COPY_SRC: 2, TEXTURE_BINDING: 4 };
  if (!globalThis.navigator?.gpu) {
    Object.defineProperty(globalThis.navigator, "gpu", { value: { getPreferredCanvasFormat: () => "bgra8unorm" }, configurable: true });
  }
  const canvas = { width: 64, height: 64, getContext: () => ({ configure() {} }) };
  const device = fakeGpu();
  return { device, renderer: new Renderer(canvas, device, { stencil: true }) };
}

test("one-board pipelines with no features are the original shaders and labels", () => {
  const { device, renderer } = fakeRenderer();
  const { pipelines } = renderer.drawSet();
  assert.equal(pipelines, renderer.singlePipelines);
  assert.equal(pipelines.main.code, BASE_SHADERS.main);
  assert.equal(pipelines.pick.code, BASE_SHADERS.pick);
  assert.equal(pipelines.barrel.code, BASE_SHADERS.barrel);
  assert.equal(pipelines.barrelPick.code, BASE_SHADERS.barrelPick);
  assert.deepEqual(device.pipelines.map((p) => p.label).sort(),
    ["barrel", "barrel-pick", "main", "main-blend", "main-mark", "main-translucent", "mask", "mask-covered", "pick"]);
  assert.equal(pipelines.maskCovered.constants.COVERED, 1);
  // Placeholder boxes blend without writing depth, so overlapping ones never z-fight.
  assert.equal(pipelines.translucent.depthStencil.depthWriteEnabled, false);
  assert.equal(pipelines.blend.depthStencil.depthWriteEnabled, true);
});

test("barrels are capped stadium tubes: two walls and two caps of 32 segments", () => {
  const { renderer } = fakeRenderer();
  renderer.setBarrels([{
    centerMm: [1, 2], drillWidthMm: 0.6, drillHeightMm: 1.3, outerWidthMm: 0.65, outerHeightMm: 1.35,
    startZMm: 1.5, endZMm: 0, startLayerId: 4, endLayerId: 14, netId: 1, objectFeatureId: 2,
  }]);
  // Each band is 32 quads of two triangles.
  assert.equal(renderer.barrels.indexCount, 4 * 32 * 6);
});

test("a feature set compiles its own pipelines once, and an empty list returns to the originals", () => {
  const { device, renderer } = fakeRenderer();
  const original = renderer.drawSet().pipelines;
  const before = device.pipelines.length;
  renderer.bundleCache.set("stale", {});
  const version = renderer.version;
  renderer.setShaderFeatures([PROBE]);
  assert.equal(renderer.bundleCache.size, 0);
  assert.ok(renderer.version > version);
  const featured = renderer.drawSet().pipelines;
  assert.notEqual(featured, original);
  assert.equal(featured.main.label, "main+probe");
  assert.equal(featured.main.code, shaderVariant("main", false, [PROBE]));
  assert.equal(featured.barrelPick.code, shaderVariant("barrelPick", false, [PROBE]));
  const compiled = device.pipelines.length - before;
  assert.equal(compiled, 9);
  assert.equal(renderer.drawSet().pipelines, featured, "cached");
  assert.equal(device.pipelines.length - before, compiled);
  // Components follow the set they are drawn with.
  const components = renderer.componentPipelines(featured);
  assert.equal(components.main.code, shaderVariant("component", false, [PROBE]));
  assert.equal(components.pick.code, shaderVariant("componentPick", false, [PROBE]));
  assert.equal(renderer.componentPipelines(original).main.code, BASE_SHADERS.component);
  // The same set again: no change, no recompile.
  renderer.setShaderFeatures([PROBE]);
  renderer.setShaderFeatures([]);
  assert.equal(renderer.drawSet().pipelines, original);
  renderer.setShaderFeatures([PROBE]);
  assert.equal(renderer.drawSet().pipelines, featured);
});

test("instanced feature sets include the box pipelines and keep the instanced originals apart", () => {
  const { renderer } = fakeRenderer();
  renderer.setShaderFeatures([PROBE]);
  const set = renderer.pipelinesFor(true);
  assert.equal(set.main.code, shaderVariant("main", true, [PROBE]));
  assert.equal(set.box.code, shaderVariant("box", true, [PROBE]));
  assert.equal(set.boxPick.label, "box-pick+probe");
  assert.equal(renderer.instancedPipelines.main.code, BASE_SHADERS.mainInstanced);
  assert.equal(renderer.instancedPipelines.box.code, BASE_SHADERS.box);
  assert.equal(renderer.componentPipelines(set).main.code, shaderVariant("component", true, [PROBE]));
});
