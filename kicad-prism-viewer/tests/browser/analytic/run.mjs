#!/usr/bin/env node
// Analytic spike evidence run: one board's copper drawn from its kicad_monkey
// materialization pack, then a per-operation overlay and a field-tile overlay
// from a synthetic result, captured in headless Chrome on a real WebGPU device.
//
//   node tests/browser/analytic/run.mjs --board name=<bundle dir> --pack <board.kmpack>
//     [--size 1280x800] [--scale 1] [--zoom 0.5,0.42] [--zoom-steps 8] [--out dir] [--headed]
//     [--close-view default|top|bottom] [--live [port]]   serve an interactive page (default port 5199) instead of capturing
//
// It reuses the pixel-diff harness (probe, Chrome driver, PNG encoder) and
// writes PNGs and summary.json. Mesh and analytic copper are compared for
// information only; the mesh path's baselines are the pixel-diff runner's job.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildElement } from "../pixel-diff/build-element.mjs";
import { launchChrome } from "../pixel-diff/chrome.mjs";
import { diffImages, encodePng } from "../pixel-diff/image.mjs";
import { loadAnalyticWasm, openAnalyticPack } from "../../../viewer/src/analytic-pack.js";

const here = dirname(fileURLToPath(import.meta.url));
const harness = resolve(here, "../pixel-diff");
const viewerRoot = resolve(here, "../../..");
const wasmFile = join(viewerRoot, "viewer/vendor/kicad-monkey-analytic/kicad_monkey_analytic_bg.wasm");

const options = parseArgs(process.argv.slice(2));
const outDir = resolve(options.out || join(here, "out", new Date().toISOString().replace(/[:.]/g, "-")));
mkdirSync(outDir, { recursive: true });
const buildDir = mkdtempSync(join(tmpdir(), "analytic-builds-"));
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const summary = { startedAt: new Date().toISOString(), board: options.board, pack: options.pack, captures: [], comparisons: [], failures: [] };

try {
  summary.build = buildElement("worktree", join(buildDir, "candidate.js"));
  copyFileSync(wasmFile, join(buildDir, "kicad-monkey-analytic.wasm"));
  const synthetic = await syntheticResults(readFileSync(options.pack));
  summary.synthetic = synthetic.describe;
  if (options.live) {
    await live(buildDir, synthetic);
    await new Promise(() => {});
  }
  const server = await serve(buildDir);
  const chrome = await launchChrome({ headless: !options.headed });
  try {
    await runBoard(chrome, server, synthetic);
  } finally {
    await chrome.close();
    server.close();
  }
} catch (error) {
  summary.failures.push(`error: ${error.message}`);
  console.error(error);
} finally {
  rmSync(buildDir, { recursive: true, force: true });
  summary.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n${summary.failures.length ? "FAIL" : "PASS"} — ${outDir}`);
  for (const failure of summary.failures) console.log(`  ${failure}`);
  process.exitCode = summary.failures.length ? 1 : 0;
}

/**
 * Synthetic results on the pack's own identity and tile grid:
 * - per operation, a "current" per net (deterministic, 0–2 A), none off-net;
 * - a "voltage" field on the outer copper, falling with distance from the
 *   board's centre, on every tile of those slices at 0.2 mm pitch.
 */
async function syntheticResults(bytes) {
  await loadAnalyticWasm(readFileSync(wasmFile));
  const pack = await openAnalyticPack(bytes);
  try {
    const header = pack.header;
    const count = header.chunks.reduce((sum, chunk) => sum + chunk.operation_count, 0);
    const values = new Array(count).fill(null);
    const perNet = new Map();
    for (let index = 0; index < count; index += 1) {
      const net = pack.binding(index)?.net_key;
      if (!net) continue;
      if (!perNet.has(net)) perNet.set(net, (hash(net) % 2000) / 1000);
      values[index] = perNet.get(net);
    }
    const tile = Number(header.scope.tile_size_nm);
    const pitch = 200_000;
    const cells = Math.round(tile / pitch);
    const bounds = header.chunks.reduce((b, c) => [Math.min(b[0], c.bounds.min_x_nm), Math.min(b[1], c.bounds.min_y_nm), Math.max(b[2], c.bounds.max_x_nm), Math.max(b[3], c.bounds.max_y_nm)], [Infinity, Infinity, -Infinity, -Infinity]);
    const centre = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    const reach = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2;
    const outer = header.stack.slices.filter((slice) => slice.role === "conductor");
    const slices = new Set([outer[0]?.key, outer[outer.length - 1]?.key]);
    // Every tile of the grid the board's extent touches, on each outer slice.
    const tiles = [];
    const span = (low, high) => [Math.floor(low / tile), Math.floor(high / tile)];
    const [x0, x1] = span(bounds[0], bounds[2]);
    const [y0, y1] = span(bounds[1], bounds[3]);
    const grid = [];
    for (let ty = y0; ty <= y1; ty += 1) for (let tx = x0; tx <= x1; tx += 1) grid.push([tx, ty]);
    for (const [sliceKey, [tileX, tileY]] of [...slices].flatMap((key) => grid.map((cell) => [key, cell]))) {
      const chunk = { slice_key: sliceKey, tile_x: tileX, tile_y: tileY };
      const origin = [chunk.tile_x * tile, chunk.tile_y * tile];
      const field = new Array(cells * cells);
      for (let row = 0; row < cells; row += 1) {
        for (let col = 0; col < cells; col += 1) {
          const x = origin[0] + (col + 0.5) * pitch;
          const y = origin[1] + (row + 0.5) * pitch;
          field[row * cells + col] = +(3.3 - 0.4 * Math.hypot(x - centre[0], y - centre[1]) / reach).toFixed(5);
        }
      }
      tiles.push({ slice_key: chunk.slice_key, origin_nm: origin, pitch_nm: pitch, width: cells, height: cells, values: field });
    }
    return {
      operations: { kind: "operation_values", quantity: "synthetic_current", units: "A", values },
      field: { kind: "field_tiles", quantity: "synthetic_voltage", units: "V", tiles },
      describe: { operations: count, nets: perNet.size, fieldTiles: tiles.length, fieldPitchNm: pitch, slices: [...slices] },
    };
  } finally {
    pack.free();
  }
}

function hash(text) {
  let value = 0x811c9dc5;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 0x01000193) >>> 0;
  return value;
}

async function runBoard(chrome, server, synthetic) {
  const { width, height, scale } = options;
  const page = await chrome.newPage({ width, height, deviceScaleFactor: scale });
  const captures = new Map();
  try {
    await page.goto(`${server.origin}/harness/harness.html?build=candidate`);
    await waitFor(page, "window.__vtElementLoaded === true", 30000, "element module");
    await page.evaluate(`window.__vtProbe.mount("/bundle/bundle.json", ${JSON.stringify({ width, height })})`);
    const capture = async (name, view) => {
      await page.evaluate(`window.__vtProbe.applyView(${JSON.stringify(view)})`);
      await settle(page, name);
      const frame = await page.evaluate("window.__vtProbe.capture()");
      if (!frame) throw new Error(`${name}: no rendered frame`);
      const image = { width: frame.width, height: frame.height, data: new Uint8Array(Buffer.from(frame.rgba, "base64")) };
      captures.set(name, image);
      const file = join(outDir, `${name}.png`);
      writeFileSync(file, encodePng(image));
      const stats = await page.evaluate("JSON.stringify(window.__vtProbe.stats())");
      summary.captures.push({ name, view, file, hash: frame.hash, stats: JSON.parse(stats || "null") });
      log(`${name}: ${frame.hash}`);
    };
    await capture("mesh-exploded", "exploded");
    const loaded = await page.evaluate(`(async () => {
      const bytes = await (await fetch("/pack/board.kmpack")).arrayBuffer();
      const stats = await window.__vtProbe.element.loadAnalyticPack(bytes, { wasm: "/builds/kicad-monkey-analytic.wasm" });
      return JSON.stringify(stats);
    })()`);
    summary.analytic = JSON.parse(loaded);
    log(`analytic: ${summary.analytic.slices.length} slices, lowered in ${summary.analytic.lowerMs.toFixed(0)} ms, degraded ${summary.analytic.degraded}`);
    await capture("analytic-exploded", "exploded");
    await page.evaluate(`window.__vtProbe.element.setAnalyticOverlay(${JSON.stringify(synthetic.operations)})`);
    await capture("overlay-operations-exploded", "exploded");
    summary.pick = JSON.parse(await page.evaluate(`(async () => {
      const canvas = window.__vtProbe.element.shadowRoot.getElementById("viewport");
      const rect = canvas.getBoundingClientRect();
      const hits = [];
      for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.5], [0.6, 0.45], [0.5, 0.6]]) {
        hits.push(await window.__vtProbe.element.analyticAt(rect.left + rect.width * fx, rect.top + rect.height * fy));
      }
      return JSON.stringify(hits);
    })()`));
    await page.evaluate(`window.__vtProbe.element.setAnalyticOverlay(${JSON.stringify(synthetic.field)})`);
    await capture("overlay-field-exploded", "exploded");
    await capture("overlay-field-top", "top");
    await page.evaluate("window.__vtProbe.element.setAnalyticOverlay(null)");
    await capture("analytic-top", "top");
    await capture("analytic-bottom", "bottom");
    await page.evaluate("window.__vtProbe.element.unloadAnalyticPack()");
    await capture("mesh-top", "top");
    await capture("mesh-bottom", "bottom");
    // A close-up at the same camera, mesh then analytic: the analytic edges
    // stay exact at any zoom, the mesh shows its tessellation.
    if (options.closeView !== "default") await page.evaluate(`window.__vtProbe.applyView(${JSON.stringify(options.closeView)})`);
    await zoomIn(page, options.zoom, options.zoomSteps);
    await capture("mesh-close", "default");
    await page.evaluate(`(async () => {
      const bytes = await (await fetch("/pack/board.kmpack")).arrayBuffer();
      await window.__vtProbe.element.loadAnalyticPack(bytes, { wasm: "/builds/kicad-monkey-analytic.wasm" });
    })()`);
    await capture("analytic-close", "default");
    compare(captures, "mesh-exploded", "analytic-exploded");
    compare(captures, "mesh-top", "analytic-top");
    compare(captures, "mesh-bottom", "analytic-bottom");
    compare(captures, "mesh-close", "analytic-close");
    compare(captures, "analytic-exploded", "overlay-operations-exploded");
    compare(captures, "analytic-exploded", "overlay-field-exploded");
    check(summary.pick.some((hit) => hit && Number.isInteger(hit.operationIndex)), "an analytic pick names an operation");
    check(!summary.analytic.degraded, "the device has the stencil feature, so subtracts and regions draw");
    if (page.errors.length) summary.failures.push(`page errors: ${[...new Set(page.errors)].slice(0, 5).join(" | ")}`);
  } finally {
    await page.close();
  }
}

/** Wheel-zoom towards a point given as fractions of the canvas. */
async function zoomIn(page, [fx, fy], steps) {
  await page.evaluate(`(async () => {
    const canvas = window.__vtProbe.element.shadowRoot.getElementById("viewport");
    const rect = canvas.getBoundingClientRect();
    const at = { clientX: rect.left + rect.width * ${fx}, clientY: rect.top + rect.height * ${fy}, bubbles: true, cancelable: true };
    for (let i = 0; i < ${steps}; i += 1) {
      canvas.dispatchEvent(new WheelEvent("wheel", { ...at, deltaY: -120 }));
      await new Promise((done) => requestAnimationFrame(done));
    }
  })()`);
}

function compare(captures, a, b) {
  const result = diffImages(captures.get(a), captures.get(b), { tolerance: 0 });
  // Fidelity: the share of pixels that differ visibly (beyond 8 levels), so
  // shading drift shows apart from edge pixels the exact shapes move.
  const visible = diffImages(captures.get(a), captures.get(b), { tolerance: 8 });
  const total = captures.get(a)?.width * captures.get(a)?.height || 0;
  summary.comparisons.push({
    a, b,
    pixels: result.pixels ?? null,
    maxDelta: result.maxDelta ?? null,
    visiblePixels: visible.pixels ?? null,
    visibleShare: total && visible.pixels != null ? visible.pixels / total : null,
  });
  if (result.comparable && result.pixels) writeFileSync(join(outDir, `diff-${a}-vs-${b}.png`), encodePng(result.image));
  // Overlays must change the picture; the analytic copper must draw something.
  if (b.startsWith("overlay") || b.startsWith("analytic")) check(result.pixels > 0, `${b} differs from ${a}`);
}

function check(condition, message) {
  if (!condition) summary.failures.push(message);
}

async function settle(page, label) {
  const started = Date.now();
  for (;;) {
    const status = await page.evaluate("window.__vtProbe.frameStatus()");
    if (page.networkIdle(1000) && status.stable >= 3 && status.stableMs >= 1000) return;
    if (Date.now() - started > 240000) throw new Error(`${label}: did not settle`);
    await new Promise((done) => setTimeout(done, 250));
  }
}

async function waitFor(page, expression, timeoutMs, label) {
  const started = Date.now();
  while (!(await page.evaluate(expression))) {
    if (Date.now() - started > timeoutMs) throw new Error(`${label}: timed out; ${page.errors.join(" | ")}`);
    await new Promise((done) => setTimeout(done, 200));
  }
}

/**
 * Serve an interactive page instead of capturing: the viewer fills the window
 * and a toolbar switches between mesh copper, analytic copper, and the two
 * synthetic overlays. Runs until interrupted.
 */
async function live(buildDir, synthetic) {
  writeFileSync(join(buildDir, "synthetic.json"), JSON.stringify({ operations: synthetic.operations, field: synthetic.field }));
  writeFileSync(join(buildDir, "live.html"), livePage());
  const server = await serve(buildDir, options.live);
  log(`live view: ${server.origin}/builds/live.html`);
}

// A function, not a constant: the top-level run reaches it before this line.
function livePage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Analytic copper live view</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0d10; color: #e6e8eb; font: 13px system-ui, sans-serif; overflow: hidden; }
    prism-semantic-viewer { display: block; position: absolute; inset: 40px 0 0 0; }
    nav { position: absolute; inset: 0 0 auto 0; height: 40px; display: flex; gap: 6px; align-items: center; padding: 0 10px; background: #15181d; border-bottom: 1px solid #2a2f37; white-space: nowrap; overflow-x: auto; }
    nav label { display: inline-flex; gap: 4px; align-items: center; margin-left: 6px; }
    nav .sep { width: 1px; height: 22px; background: #2a2f37; margin: 0 4px; }
    button { background: #232830; color: inherit; border: 1px solid #343a44; border-radius: 4px; padding: 5px 10px; font: inherit; cursor: pointer; }
    button[aria-pressed="true"] { background: #2f6fd0; border-color: #2f6fd0; }
    #status { margin-left: auto; opacity: 0.75; font-variant-numeric: tabular-nums; }
  </style>
  <script type="module">
    await import("/builds/candidate.js");
    const viewer = document.createElement("prism-semantic-viewer");
    viewer.setAttribute("active", "true");
    // As the app hosts it: the app draws its own controls (semantic-3d-controls.tsx).
    viewer.setAttribute("hide-panel", "true");
    const ready = new Promise((done, fail) => {
      viewer.addEventListener("prism-semantic-viewer:ready", done, { once: true });
      viewer.addEventListener("prism-semantic-viewer:error", (event) => fail(new Error(event.detail?.message)), { once: true });
    });
    viewer.setAttribute("bundle-url", new URL("/bundle/bundle.json", location.href).toString());
    document.body.append(viewer);
    const status = document.getElementById("status");
    const synthetic = await (await fetch("/builds/synthetic.json")).json();
    const pack = await (await fetch("/pack/board.kmpack")).arrayBuffer();
    await ready;
    let loaded = false;
    const modes = {
      async mesh() { if (loaded) viewer.unloadAnalyticPack(); loaded = false; return "mesh copper"; },
      async analytic() {
        if (!loaded) await viewer.loadAnalyticPack(pack.slice(0), { wasm: "/builds/kicad-monkey-analytic.wasm" });
        loaded = true;
        viewer.setAnalyticOverlay(null);
        const stats = viewer.analyticStats();
        return \`analytic copper · \${stats.slices.length} slices\`;
      },
      async current() { await modes.analytic(); viewer.setAnalyticOverlay(synthetic.operations); return "overlay: synthetic per-net current"; },
      async field() { await modes.analytic(); viewer.setAnalyticOverlay(synthetic.field); return "overlay: synthetic voltage field"; },
    };
    const buttons = [...document.querySelectorAll("nav button")];
    for (const button of buttons) {
      button.addEventListener("click", async () => {
        buttons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
        status.textContent = "…";
        try { status.textContent = await modes[button.dataset.mode](); } catch (error) { status.textContent = error.message; }
      });
    }
    viewer.addEventListener("click", async (event) => {
      if (!loaded) return;
      const hit = await viewer.analyticAt(event.clientX, event.clientY);
      if (hit) status.textContent = \`op \${hit.operationIndex} · \${hit.binding?.net_key ?? "no net"} · \${hit.binding?.kind ?? ""}\${hit.value != null ? " · " + hit.value + " " + hit.units : ""}\`;
    });
    // The app's 3D controls this page needs, through the same element members.
    const bind = (id, apply) => document.getElementById(id).addEventListener("input", (event) => {
      const input = event.target;
      apply(input.type === "checkbox" ? input.checked : Number(input.value));
    });
    bind("substrate", (on) => viewer.setShowBoard(on));
    bind("components", (on) => viewer.setShowComponents(on));
    bind("realistic", (on) => viewer.setRealisticColors(on));
    bind("separation", (value) => viewer.setSeparation(value));
    buttons[1].click();
  </script>
</head>
<body>
  <nav>
    <button data-mode="mesh">Mesh</button>
    <button data-mode="analytic">Analytic</button>
    <button data-mode="current">Current overlay</button>
    <button data-mode="field">Field overlay</button>
    <span class="sep"></span>
    <label><input type="checkbox" id="substrate" checked> Board substrate</label>
    <label><input type="checkbox" id="components" checked> Components</label>
    <label><input type="checkbox" id="realistic" checked> Realistic colours</label>
    <label>Separation <input type="range" id="separation" min="0" max="1" step="0.01" value="0"></label>
    <span id="status">loading…</span>
  </nav>
</body>
</html>
`;
}

function serve(builds, port = 0) {
  const roots = new Map([["harness", harness], ["builds", builds], ["bundle", options.board.dir]]);
  const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    if (path === "pack/board.kmpack") {
      response.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
      return void response.end(readFileSync(options.pack));
    }
    const prefix = [...roots.keys()].find((key) => path.startsWith(`${key}/`));
    if (!prefix) return void response.writeHead(404).end();
    const root = roots.get(prefix);
    const file = resolve(root, path.slice(prefix.length + 1));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

function parseArgs(argv) {
  const parsed = { board: null, pack: null, out: null, headed: false, width: 1280, height: 800, scale: 1, zoom: [0.5, 0.42], zoomSteps: 8, closeView: "default" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--board") {
      const [name, dir] = argv[++i].split(/=(.*)/s);
      const root = resolve(dir);
      const found = existsSync(join(root, "bundle.json")) ? root : join(root, readdirSync(root).find((child) => existsSync(join(root, child, "bundle.json"))) || "");
      parsed.board = { name, dir: found };
    } else if (flag === "--pack") parsed.pack = resolve(argv[++i]);
    else if (flag === "--out") parsed.out = argv[++i];
    else if (flag === "--size") [parsed.width, parsed.height] = argv[++i].split("x").map(Number);
    else if (flag === "--scale") parsed.scale = Number(argv[++i]);
    else if (flag === "--zoom") parsed.zoom = argv[++i].split(",").map(Number);
    else if (flag === "--zoom-steps") parsed.zoomSteps = Number(argv[++i]);
    else if (flag === "--close-view") parsed.closeView = argv[++i];
    else if (flag === "--headed") parsed.headed = true;
    else if (flag === "--live") parsed.live = /^\d+$/.test(argv[i + 1] || "") ? Number(argv[++i]) : 5199;
    else throw new Error(`unknown option ${flag}`);
  }
  if (!parsed.board || !parsed.pack) throw new Error("usage: run.mjs --board name=<bundle dir> --pack <board.kmpack> [--out dir] [--headed]");
  return parsed;
}
