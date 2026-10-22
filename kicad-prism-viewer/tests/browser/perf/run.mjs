#!/usr/bin/env node
// Analytic renderer perf harness: one measurement for every perf change.
//
//   node tests/browser/perf/run.mjs --board name=<analytic bundle dir> [--board ...]
//     [--build name=spec ...]  builds to compare (as the pixel-diff runner: worktree, a git ref, a .js); default worktree
//     [--scale 2] [--size 1280x800] [--orbit-ms 3000] [--repeat 1] [--only case,case] [--out dir] [--headed]
//     [--capture]  capture fixed views instead, and diff every build's against the first's
//
// For every board and build, on a fresh page, it measures:
//   - orbits of a fixed set of views (solid, separated, exploded, substrate off,
//     zoomed in, a field overlay over all copper, its relief): per frame the
//     GPU time (timestamp queries on every pass), the CPU time of the frame
//     callback, draws, stencil references, scissors, pipelines, uploads
//     (writeBuffer/writeTexture calls and bytes) and allocations;
//   - interactions: a field switch (two synthetic fields, back and forth), a
//     relief rebuild, a pick, each from the call to the next drawn frame;
//   - idle: one second with nothing changing, with and without a highlighted
//     net, as frames drawn and GPU ms spent, after the camera settles; and
//     after each orbit, how long frames keep coming once the drag ends.
// With --capture it draws a fixed set of views (board, separated, field
// overlays and their switches, the relief) and records the overlay's range
// and three probe values per view; every build is diffed against the first.
// The synthetic fields cover every copper slice of the board on a 0.2 mm grid.
// Results go to <out>/summary.json and a table on stdout.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildElement } from "../pixel-diff/build-element.mjs";
import { launchChrome } from "../pixel-diff/chrome.mjs";
import { diffImages, encodePng } from "../pixel-diff/image.mjs";
import { loadAnalyticWasm, openAnalyticPack, sliceBoundsMm } from "../../../viewer/src/analytic-pack.js";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(here, "../../..");
const wasmFile = join(viewerRoot, "viewer/vendor/prism-kicad-wasm/prism_kicad_analytic_bg.wasm");
// Captured RGBA by file, for the diffs.
const rgbaCache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const options = parseArgs(process.argv.slice(2));
const outDir = resolve(options.out || join(here, "out", new Date().toISOString().replace(/[:.]/g, "-")));
mkdirSync(outDir, { recursive: true });

// View cases: name, setup code run in the page (el = the element), and whether to zoom first.
const CASES = [
  ["solid", "el.setSeparation(0); el.setShowBoard(true); el.setShowComponents(true)"],
  // The conformal mask with the board partly off screen, and the board small in the view.
  ["solid-zoomed", "", [0.3, 0.35, 8]],
  ["solid-far", "", [0.5, 0.5, -6]],
  ["separated-0.3", "el.setSeparation(0.3)"],
  ["exploded", "el.setSeparation(1)"],
  ["substrate-off", "el.setSeparation(0); el.setShowBoard(false)"],
  ["exploded-zoomed", "el.setShowBoard(true); el.setSeparation(1)", [0.5, 0.42, 8]],
  // As Simulation Studio shows a run: the copper alone, exploded, coloured by a field.
  ["field-exploded", "el.setShowComponents(false); el.setShowBoard(false); el.setSeparation(1); el.setAnalyticOverlay(window.__fields.a)"],
  ["field-relief", "el.setSeparation(0); el.setAnalyticRelief({})"],
  // Spike: the solid board with its parts hidden, near and far (what part geometry costs).
  ["solid-noparts", "el.setAnalyticRelief(null); el.setAnalyticOverlay(null); el.setShowBoard(true); el.setSeparation(0); el.setShowComponents(false)"],
  ["solid-far-noparts", "", [0.5, 0.5, -6]],
  ["solid-parts-again", "el.setShowComponents(true)"],
];

// Captured views (--capture): name and setup code; each is drawn from the loaded camera, settled.
const VIEWS = [
  ["solid", ""],
  ["solid-zoomed", "await window.__zoom(0.3, 0.35, 8)"],
  ["exploded", "await window.__zoom(0.3, 0.35, -8); el.setSeparation(1)"],
  ["separated-0.3", "el.setSeparation(0.3)"],
  ["field-a-exploded", "el.setShowComponents(false); el.setShowBoard(false); el.setSeparation(1); window.__range = el.setAnalyticOverlay(window.__fields.a)?.range"],
  ["field-b-exploded", "window.__range = el.setAnalyticOverlay(window.__fields.b)?.range"],
  ["field-a-again", "window.__range = el.setAnalyticOverlay(window.__fields.a)?.range"],
  ["field-a-relief", "el.setSeparation(0); el.setAnalyticRelief({})"],
  ["field-b-relief", "window.__range = el.setAnalyticOverlay(window.__fields.b)?.range"],
];

const summary = { startedAt: new Date().toISOString(), options, builds: {}, boards: {}, results: [] };
const buildDir = mkdtempSync(join(tmpdir(), "analytic-perf-"));
const chrome = await launchChrome({ headless: !options.headed, unthrottled: true });
try {
  for (const [name, spec] of options.builds) {
    summary.builds[name] = buildElement(spec, join(buildDir, `${name}.js`));
  }
  await loadAnalyticWasm(readFileSync(wasmFile));
  for (const board of options.boards) {
    const fields = await syntheticFields(join(board.dir, "board.kmpack"));
    summary.boards[board.name] = { dir: board.dir, ...fields.describe };
    const server = await serve(board.dir, fields);
    try {
      for (let round = 0; round < options.repeat; round += 1) {
        for (const build of options.builds.keys()) {
          if (options.capture) {
            summary.results.push({ board: board.name, build, round, captures: await capture(server, build, board.name, round) });
            continue;
          }
          const result = await measure(server, build, board.name);
          summary.results.push({ board: board.name, build, round, ...result });
          report(board.name, build, result);
        }
      }
    } finally {
      server.close();
    }
  }
  if (options.capture) compareCaptures();
} finally {
  await chrome.close();
  rmSync(buildDir, { recursive: true, force: true });
  summary.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(`\nwrote ${join(outDir, "summary.json")}`);
}

/** Two synthetic fields over every copper slice (0.2 mm cells), as prism.sim.field grids. */
async function syntheticFields(packFile) {
  const pack = await openAnalyticPack(readFileSync(packFile));
  try {
    const header = pack.header;
    const conductors = header.stack.slices.filter((slice) => slice.role === "conductor");
    const pitch = 0.2e-3;
    const slices = [];
    let all = null;
    for (const slice of conductors) {
      const bounds = sliceBoundsMm(header, slice.key);
      if (!bounds) continue;
      slices.push({ key: slice.key, bounds });
      all = all ? [Math.min(all[0], bounds[0]), Math.min(all[1], bounds[1]), Math.max(all[2], bounds[2]), Math.max(all[3], bounds[3])] : [...bounds];
    }
    const origin = [Math.floor(all[0] / 0.2) * 0.2e-3, Math.floor(all[1] / 0.2) * 0.2e-3];
    const plan = slices.map(({ key, bounds }) => {
      const ix0 = Math.floor((bounds[0] / 1000 - origin[0]) / pitch);
      const iy0 = Math.floor((bounds[1] / 1000 - origin[1]) / pitch);
      const nx = Math.ceil((bounds[2] / 1000 - origin[0]) / pitch) - ix0;
      const ny = Math.ceil((bounds[3] / 1000 - origin[1]) / pitch) - iy0;
      return { slice_key: key, ix0, iy0, nx, ny };
    });
    return {
      plan: { origin, pitch, slices: plan, centre: [(all[0] + all[2]) / 2000, (all[1] + all[3]) / 2000], reach: Math.hypot(all[2] - all[0], all[3] - all[1]) / 2000 },
      describe: { copperSlices: plan.length, cells: plan.reduce((sum, s) => sum + s.nx * s.ny, 0), boundsMm: all, operations: header.chunks.reduce((sum, c) => sum + c.operation_count, 0) },
    };
  } finally {
    pack.free();
  }
}

function pageSource(fields) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>analytic perf</title>
<style>html, body { margin: 0; background: #000; overflow: hidden; }</style>
<script>
// The fields are made in the page: a falling "voltage" (a) and a ridged one (b).
window.__fieldPlan = ${JSON.stringify(fields.plan)};
window.__makeFields = () => {
  const p = window.__fieldPlan;
  const grid = (shape) => ({
    origin_x_m: p.origin[0], origin_y_m: p.origin[1], dx_m: p.pitch, dy_m: p.pitch,
    slices: p.slices.map((s, layer) => {
      const values = new Float32Array(s.nx * s.ny);
      for (let j = 0; j < s.ny; j += 1) for (let i = 0; i < s.nx; i += 1) {
        const x = p.origin[0] + (s.ix0 + i + 0.5) * p.pitch;
        const y = p.origin[1] + (s.iy0 + j + 0.5) * p.pitch;
        values[j * s.nx + i] = shape(x, y, layer);
      }
      return { ...s, values };
    }),
  });
  const r = (x, y) => Math.hypot(x - p.centre[0], y - p.centre[1]) / p.reach;
  return {
    a: { kind: "field_grid", quantity: "voltage_v", units: "V", grid: grid((x, y, l) => 3.3 - 0.4 * r(x, y) - 0.01 * l) },
    b: { kind: "field_grid", quantity: "voltage_v", units: "V", grid: grid((x, y, l) => 1.8 - 0.2 * r(x, y) + 0.05 * Math.sin(x * 2000)) },
  };
};
</script>
<script type="module">
  const build = new URLSearchParams(location.search).get("build");
  await import("/builds/" + encodeURIComponent(build) + ".js");
  window.__loaded = true;
</script>
</head><body></body></html>`;
}

async function capture(server, build, boardName, round) {
  const page = await openViewer(server, build, boardName);
  try {
    const out = [];
    for (const [name, code] of VIEWS) {
      const shot = JSON.parse(await page.evaluate(`(async () => {
        window.__range = undefined;
        await (0, eval)("(async () => { " + ${JSON.stringify(code)} + " })()");
        await window.__settle(6000);
        // Nothing changes now: the idle refresh draws within a second.
        const image = await Promise.race([window.__gpuMeter.capture(el.shadowRoot.getElementById("viewport")), new Promise((r) => setTimeout(() => r(null), 3000))]);
        const canvas = el.shadowRoot.getElementById("viewport").getBoundingClientRect();
        const probes = [];
        for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.55], [0.6, 0.45]]) {
          const hit = await el.analyticAt?.(canvas.left + canvas.width * fx, canvas.top + canvas.height * fy);
          probes.push(hit ? { value: hit.value ?? null, operation: hit.operationIndex ?? hit.operation ?? null } : null);
        }
        return JSON.stringify({ image, range: window.__range ?? null, probes });
      })()`));
      const file = join(outDir, boardName, `${build}-${name}-${round}.png`);
      mkdirSync(dirname(file), { recursive: true });
      if (shot.image) {
        const image = { width: shot.image.width, height: shot.image.height, data: new Uint8Array(Buffer.from(shot.image.rgba, "base64")) };
        rgbaCache.set(file, image);
        writeFileSync(file, encodePng(image));
      }
      out.push({ name, file: shot.image ? file : null, range: shot.range, probes: shot.probes });
      console.log(`${boardName}/${build}#${round} ${name}: ${shot.image ? "captured" : "NO FRAME"} range ${JSON.stringify(shot.range)} probes ${JSON.stringify(shot.probes)}`);
    }
    if (page.errors?.length) console.log(`page errors: ${[...new Set(page.errors)].slice(0, 3).join(" | ")}`);
    return out;
  } finally {
    await page.close();
  }
}

/** Every build's captures against the first build's, same board and round; and probes and ranges. */
function compareCaptures() {
  const [reference] = options.builds.keys();
  summary.diffs = [];
  const load = (file) => readFileSync(file);
  for (const result of summary.results) {
    if (result.build === reference) continue;
    const base = summary.results.find((r) => r.board === result.board && r.round === result.round && r.build === reference);
    for (const shot of result.captures) {
      const ref = base.captures.find((c) => c.name === shot.name);
      const same = ref?.file && shot.file && Buffer.compare(load(ref.file), load(shot.file)) === 0;
      const entry = { board: result.board, round: result.round, build: result.build, view: shot.name, identical: same, rangeSame: JSON.stringify(ref?.range) === JSON.stringify(shot.range), probesSame: JSON.stringify(ref?.probes) === JSON.stringify(shot.probes) };
      if (!same && ref?.file && shot.file) Object.assign(entry, pixelDiff(ref.file, shot.file, join(outDir, result.board, `diff-${reference}-vs-${result.build}-${shot.name}-${result.round}.png`)));
      summary.diffs.push(entry);
      console.log(`${result.board} ${shot.name.padEnd(18)} ${reference} vs ${result.build}#${result.round}: ${same ? "identical" : `${entry.pixels} px differ, ${entry.visible} beyond 8 levels, max ${entry.maxDelta}`}; range ${entry.rangeSame ? "same" : "DIFFERS"}, probes ${entry.probesSame ? "same" : "DIFFER"}`);
    }
  }
}

function pixelDiff(a, b, out) {
  const image = (file) => rgbaCache.get(file);
  const result = diffImages(image(a), image(b), { tolerance: 0 });
  const visible = diffImages(image(a), image(b), { tolerance: 8 });
  if (result.comparable && result.pixels) writeFileSync(out, encodePng(result.image));
  return { pixels: result.pixels, visible: visible.pixels, maxDelta: result.maxDelta };
}

function mountSource() {
  return `(async () => {
      window.__fields = window.__makeFields();
      const el = document.createElement("prism-semantic-viewer");
      el.style.cssText = "display:block;width:${options.width}px;height:${options.height}px";
      el.setAttribute("active", "true");
      el.setAttribute("hide-panel", "true");
      const started = performance.now();
      const ready = new Promise((resolve, reject) => {
        el.addEventListener("prism-semantic-viewer:ready", resolve, { once: true });
        el.addEventListener("prism-semantic-viewer:error", (e) => reject(new Error(e.detail?.message || "viewer error")), { once: true });
      });
      el.setAttribute("bundle-url", new URL("/bundle/bundle.json", location.href).toString());
      document.body.append(el);
      window.el = el;
      await ready;
      for (let i = 0; i < 600 && !el.analyticStats?.(); i += 1) await new Promise((r) => setTimeout(r, 50));
      return JSON.stringify({ readyMs: performance.now() - started, analytic: Boolean(el.analyticStats?.()) });
    })()`;
}

async function openViewer(server, build, boardName) {
  const { width, height, scale } = options;
  const page = await chrome.newPage({ width, height, deviceScaleFactor: scale });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(join(here, "gpu-meter.js"), "utf8") });
  if (options.msaa) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__prismSampleCount = ${options.msaa};` });
  await page.goto(`${server.origin}/page.html?build=${encodeURIComponent(build)}`);
  await waitFor(page, "window.__loaded === true", 60000, "element module");
  const mounted = JSON.parse(await page.evaluate(mountSource()));
  if (!mounted.analytic) throw new Error(`${boardName}: no analytic board attached`);
  await page.evaluate(pageHelpers());
  await sleep(1500);
  page.readyMs = Math.round(mounted.readyMs);
  return page;
}

async function measure(server, build, boardName) {
  const page = await openViewer(server, build, boardName);
  try {
    const out = { readyMs: page.readyMs, timestamps: await page.evaluate("window.__gpuMeter.timestamps"), cases: [], interactions: [], idle: [] };
    for (const [name, code, zoom] of CASES) {
      if (options.only && !options.only.includes(name)) continue;
      const r = JSON.parse(await page.evaluate(`window.__orbitCase(${JSON.stringify(code)}, ${JSON.stringify(zoom || null)}, ${options.orbitMs})`));
      out.cases.push({ name, ...r });
    }
    if (!options.only) {
      // Interactions on the result view (copper only, exploded, field a).
      await page.evaluate(`(async () => { el.setAnalyticRelief(null); el.setShowComponents(false); el.setShowBoard(false); el.setSeparation(1); el.setAnalyticOverlay(window.__fields.a); await window.__frames(20); })()`);
      for (let i = 0; i < 4; i += 1) {
        out.interactions.push({ name: "field switch", ...JSON.parse(await page.evaluate(`window.__timed("el.setAnalyticOverlay(window.__fields.${i % 2 ? "a" : "b"})")`)) });
      }
      for (let i = 0; i < 3; i += 1) out.interactions.push({ name: "pick", ...JSON.parse(await page.evaluate(`window.__timed("await window.__pick(0.5, 0.5)")`)) });
      await page.evaluate("el.setSeparation(0)");
      out.interactions.push({ name: "relief on", ...JSON.parse(await page.evaluate(`window.__timed("el.setAnalyticRelief({})")`)) });
      for (let i = 0; i < 2; i += 1) {
        out.interactions.push({ name: "field switch (relief)", ...JSON.parse(await page.evaluate(`window.__timed("el.setAnalyticOverlay(window.__fields.${i % 2 ? "a" : "b"})")`)) });
      }
      // Idle: the result view with nothing changing, then with a net highlighted.
      out.idle.push({ name: "relief, no highlight", ...JSON.parse(await page.evaluate("window.__idle('')")) });
      await page.evaluate("el.setAnalyticRelief(null); el.setSeparation(1)");
      out.idle.push({ name: "field, no highlight", ...JSON.parse(await page.evaluate("window.__idle('')")) });
      out.idle.push({ name: "field, net highlighted", ...JSON.parse(await page.evaluate("window.__idle('await window.__highlight(0.5, 0.5)')")) });
      await page.evaluate("el.setAnalyticOverlay(null); el.setShowBoard(true); el.setShowComponents(true); el.setSeparation(0)");
      out.idle.push({ name: "board, net highlighted", ...JSON.parse(await page.evaluate("window.__idle('await window.__highlight(0.5, 0.5)')")) });
    }
    out.attachments = JSON.parse(await page.evaluate("JSON.stringify(window.__gpuMeter.attachmentReport())"));
    out.attachmentMB = +(out.attachments.reduce((a, t) => a + t.bytes, 0) / 1048576).toFixed(1);
    out.analyticGpuMB = JSON.parse(await page.evaluate("JSON.stringify(+(el.analyticStats().gpuMemoryBytes / 1048576).toFixed(1))"));
    if (page.errors?.length) out.pageErrors = [...new Set(page.errors)].slice(0, 5);
    return out;
  } finally {
    await page.close();
  }
}

// Page-side helpers (window.__*), evaluated once per page after the viewer is up.
function pageHelpers() {
  return `(() => {
  const meter = window.__gpuMeter;
  const canvas = () => el.shadowRoot.getElementById("viewport");
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  window.__frames = async (n) => { for (let i = 0; i < n; i += 1) await raf(); };
  const q = (values, p) => {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    return +s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))].toFixed(2);
  };
  const mean = (values) => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : null;
  // The submits that drew a frame of the main view (they hold render passes).
  const frameSamples = () => meter.samples.filter((s) => s.passes > 0 && s.draws > 0);
  const stats = (samples, frames) => ({
    frames: samples.length,
    gpuP50: q(samples.map((s) => s.gpuMs).filter((v) => v !== null), 0.5),
    gpuP95: q(samples.map((s) => s.gpuMs).filter((v) => v !== null), 0.95),
    cpuP50: q(frames.filter((f) => f.submitted).map((f) => f.cpuMs), 0.5),
    cpuP95: q(frames.filter((f) => f.submitted).map((f) => f.cpuMs), 0.95),
    draws: mean(samples.map((s) => s.draws)),
    vertices: mean(samples.map((s) => s.vertices)),
    stencilRefs: mean(samples.map((s) => s.stencilRefs)),
    scissors: mean(samples.map((s) => s.scissors)),
    pipelines: mean(samples.map((s) => s.pipelines)),
    passes: mean(samples.map((s) => s.passes)),
    writeBuffers: mean(samples.map((s) => s.writeBuffers)),
    uploadKB: mean(samples.map((s) => (s.writeBufferBytes + s.writeTextureBytes) / 1024)),
    created: mean(samples.map((s) => s.createdBuffers + s.createdTextures + s.createdBindGroups + s.createdPipelines)),
  });
  window.__zoom = async (fx, fy, steps) => {
    const r = canvas().getBoundingClientRect();
    const at = { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true, cancelable: true };
    for (let i = 0; i < Math.abs(steps); i += 1) { canvas().dispatchEvent(new WheelEvent("wheel", { ...at, deltaY: steps > 0 ? -120 : 120 })); await raf(); }
  };
  window.__orbitCase = async (code, zoom, orbitMs) => {
    await (0, eval)("(async () => { " + code + " })()");
    // [fx, fy, steps]: wheel in (steps > 0) or out toward a canvas point; the next case starts from the loaded camera.
    if (zoom) await window.__zoom(zoom[0], zoom[1], zoom[2]);
    await window.__frames(30);
    await new Promise((r) => setTimeout(r, 500));
    const r = canvas().getBoundingClientRect();
    let x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const fire = (type) => canvas().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true }));
    fire("pointerdown");
    // Warm a few frames, then measure.
    for (let i = 0; i < 10; i += 1) { x += 2; fire("pointermove"); await raf(); }
    meter.reset();
    meter.enabled = true;
    const intervals = [];
    let last = await raf();
    const started = last;
    while (last - started < orbitMs) {
      x += 2;
      fire("pointermove");
      const now = await raf();
      intervals.push(now - last);
      last = now;
    }
    meter.enabled = false;
    fire("pointerup");
    await meter.drain();
    const out = { intervalP50: q(intervals, 0.5), intervalP95: q(intervals, 0.95), ...stats(frameSamples(), meter.frames) };
    // The camera eases to a stop after the drag: how long it keeps drawing.
    Object.assign(out, await window.__settle(6000));
    if (zoom) { await window.__zoom(zoom[0], zoom[1], -zoom[2]); await window.__settle(6000); }
    return JSON.stringify(out);
  };
  // Run code, then wait for the next drawn frame: the call's time, to the frame, and what it cost.
  window.__timed = async (code) => {
    await window.__settle(6000);
    meter.reset();
    meter.enabled = true;
    const tasks = [];
    const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) tasks.push(e.duration); });
    observer.observe({ type: "longtask" });
    const t0 = performance.now();
    await (0, eval)("(async () => { " + code + " })()");
    const callMs = performance.now() - t0;
    const drawnAt = meter.samples.length;
    let frameMs = null;
    for (let i = 0; i < 120; i += 1) {
      await raf();
      if (meter.samples.slice(drawnAt).some((s) => s.draws > 0)) { frameMs = performance.now() - t0; break; }
    }
    await window.__frames(5);
    meter.enabled = false;
    await meter.drain();
    observer.disconnect();
    const samples = meter.samples;
    const sum = (key) => samples.reduce((a, s) => a + s[key], 0);
    return JSON.stringify({
      callMs: +callMs.toFixed(1),
      toFrameMs: frameMs === null ? null : +frameMs.toFixed(1),
      longTasks: tasks.map((d) => Math.round(d)),
      gpuMs: +samples.reduce((a, s) => a + (s.gpuMs || 0), 0).toFixed(2),
      submits: samples.length,
      uploadKB: Math.round((sum("writeBufferBytes") + sum("writeTextureBytes")) / 1024),
      textureKB: Math.round(sum("writeTextureBytes") / 1024),
      created: sum("createdBuffers") + sum("createdTextures") + sum("createdBindGroups") + sum("createdPipelines"),
      picked: window.__picked ?? undefined,
    });
  };
  window.__pick = async (fx, fy) => {
    const r = canvas().getBoundingClientRect();
    const hit = await el.pickAt(r.left + r.width * fx, r.top + r.height * fy);
    window.__picked = hit ? hit.kind + ":" + (hit.operationIndex ?? hit.featureId) : null;
    return hit;
  };
  window.__highlight = async (fx, fy) => {
    const r = canvas().getBoundingClientRect();
    for (const [x, y] of [[fx, fy], [0.45, 0.55], [0.55, 0.45], [0.4, 0.4], [0.6, 0.6]]) {
      const hit = await el.pickAt(r.left + r.width * x, r.top + r.height * y);
      if (hit?.selection) { el.setSelection(hit.selection); return true; }
    }
    return false;
  };
  // Let the camera's damping finish: until no frame draws for 300 ms (the 1 s
  // idle refresh aside), at most \`capMs\`. Returns how long frames kept coming.
  window.__settle = async (capMs = 6000) => {
    const t0 = performance.now();
    meter.reset();
    meter.enabled = true;
    let lastDrawn = t0;
    while (performance.now() - t0 < capMs) {
      await new Promise((r) => setTimeout(r, 50));
      const drawn = frameSamples();
      if (drawn.length) lastDrawn = drawn[drawn.length - 1].at;
      if (performance.now() - lastDrawn > 300) break;
    }
    meter.enabled = false;
    await meter.drain();
    const drawn = frameSamples();
    return { settleMs: Math.round(lastDrawn - t0), settleFrames: drawn.length, settleGpuMs: +drawn.reduce((a, s) => a + (s.gpuMs || 0), 0).toFixed(1) };
  };
  // One second with nothing changing (after the camera settles): frames drawn and GPU time spent.
  window.__idle = async (code) => {
    const highlighted = code ? await (0, eval)("(async () => { " + code + " })()") : null;
    const settled = await window.__settle(highlighted ? 3000 : 6000);
    meter.reset();
    meter.enabled = true;
    await new Promise((r) => setTimeout(r, 1000));
    meter.enabled = false;
    await meter.drain();
    const drawn = frameSamples();
    el.setSelection?.(null);
    return JSON.stringify({ highlighted, ...settled, framesDrawn: drawn.length, gpuMsPerSecond: +drawn.reduce((a, s) => a + (s.gpuMs || 0), 0).toFixed(1), cpuMsPerSecond: +meter.frames.reduce((a, f) => a + f.cpuMs, 0).toFixed(1) });
  };
})()`;
}

function report(board, build, result) {
  console.log(`\n== ${board} / ${build}: ready ${result.readyMs} ms, timestamps ${result.timestamps}, analytic GPU ${result.analyticGpuMB} MB, attachments ${result.attachmentMB} MB${result.pageErrors ? `, PAGE ERRORS ${result.pageErrors.join(" | ")}` : ""}`);
  console.log("case               gpu p50/p95   cpu p50/p95   int p95  draws  stencil scissor  vertices    wBuf  upKB  new | after release: ms frames gpu-ms");
  for (const c of result.cases) {
    console.log(`${c.name.padEnd(18)} ${`${c.gpuP50}/${c.gpuP95}`.padStart(11)}   ${`${c.cpuP50}/${c.cpuP95}`.padStart(11)}   ${String(c.intervalP95).padStart(6)} ${String(c.draws).padStart(6)} ${String(c.stencilRefs).padStart(7)} ${String(c.scissors).padStart(7)} ${String(c.vertices).padStart(9)} ${String(c.writeBuffers).padStart(7)} ${String(c.uploadKB).padStart(5)} ${String(c.created).padStart(4)} | ${c.settleMs} ${c.settleFrames} ${c.settleGpuMs}`);
  }
  for (const i of result.interactions) {
    console.log(`  ${i.name.padEnd(22)} call ${String(i.callMs).padStart(7)} ms, to frame ${String(i.toFrameMs).padStart(7)} ms, long tasks ${JSON.stringify(i.longTasks)}, GPU ${i.gpuMs} ms over ${i.submits} submits, upload ${i.uploadKB} KB (tex ${i.textureKB}), created ${i.created}${i.picked !== undefined ? `, picked ${i.picked}` : ""}`);
  }
  for (const i of result.idle) {
    console.log(`  idle: ${i.name.padEnd(24)} ${String(i.framesDrawn).padStart(3)} frames/s, GPU ${i.gpuMsPerSecond} ms/s, CPU ${i.cpuMsPerSecond} ms/s (settled after ${i.settleMs} ms, ${i.settleFrames} frames)${i.highlighted === false ? " (no net found to highlight)" : ""}`);
  }
}

function serve(bundleDir, fields) {
  const roots = new Map([["builds", buildDir], ["bundle", bundleDir]]);
  const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
  const html = pageSource(fields);
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    if (path === "page.html") return void response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end(html);
    const prefix = [...roots.keys()].find((key) => path.startsWith(`${key}/`));
    if (!prefix) return void response.writeHead(404).end();
    const root = roots.get(prefix);
    const file = resolve(root, path.slice(prefix.length + 1));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

async function waitFor(page, expression, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await page.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}${page.errors?.length ? `: ${page.errors.join(" | ")}` : ""}`);
}

function parseArgs(argv) {
  const parsed = { boards: [], builds: new Map(), width: 1280, height: 800, scale: 2, orbitMs: 3000, repeat: 1, only: null, out: null, headed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--board") {
      const [name, dir] = argv[++i].split("=");
      parsed.boards.push({ name, dir: resolve(dir) });
    } else if (flag === "--build") {
      const [name, spec] = argv[++i].split("=");
      parsed.builds.set(name, spec);
    } else if (flag === "--size") [parsed.width, parsed.height] = argv[++i].split("x").map(Number);
    else if (flag === "--scale") parsed.scale = Number(argv[++i]);
    else if (flag === "--orbit-ms") parsed.orbitMs = Number(argv[++i]);
    else if (flag === "--repeat") parsed.repeat = Number(argv[++i]);
    else if (flag === "--only") parsed.only = argv[++i].split(",");
    else if (flag === "--out") parsed.out = argv[++i];
    else if (flag === "--headed") parsed.headed = true;
    else if (flag === "--capture") parsed.capture = true;
    else if (flag === "--msaa") parsed.msaa = Number(argv[++i]);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!parsed.boards.length) throw new Error("--board name=<analytic bundle dir> is required");
  if (!parsed.builds.size) parsed.builds.set("worktree", "worktree");
  return { ...parsed, builds: parsed.builds };
}
