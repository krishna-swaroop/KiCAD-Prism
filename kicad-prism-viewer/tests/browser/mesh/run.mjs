#!/usr/bin/env node
// The mesh overlay (power-integrity spec 11): its engineering host page, or a
// browser check of it in headless Chrome on a real WebGPU device.
//
//   node tests/browser/mesh/run.mjs [--board <bundle.prism | analytic dir | demo>] [--pack <file | dir | demo>]...
//     [--live [port]]                      serve the host page (default port 5281) instead of checking
//     [--size WxH] [--scale s] [--out dir] [--shots dir] [--perf] [--orbit-ms n] [--headed]
//
// See README.md beside this file.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome } from "../pixel-diff/chrome.mjs";
import { diffImages, encodePng } from "../pixel-diff/image.mjs";
import { openBoard, openPacks, serveMesh } from "./serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const options = parseArgs(process.argv.slice(2));
const buildDir = mkdtempSync(join(tmpdir(), "mesh-builds-"));
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const board = openBoard(options.board);
const packs = openPacks(options.packs);

if (options.live) {
  const server = await serveMesh({ board, packs, buildDir, port: options.live });
  log(`board ${board.name}, ${packs.length} pack(s)`);
  log(`mesh host: ${server.origin}/mesh/host.html`);
  const stop = () => {
    rmSync(buildDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else {
  const outDir = resolve(options.out || join(here, "out", new Date().toISOString().replace(/[:.]/g, "-")));
  mkdirSync(outDir, { recursive: true });
  const summary = { startedAt: new Date().toISOString(), board: board.name, boardSha256: board.sha256, packs: packs.map((pack) => pack.name), checks: [], captures: [], perf: [], failures: [] };
  try {
    const server = await serveMesh({ board, packs, buildDir });
    summary.build = server.build;
    const chrome = await launchChrome({ headless: !options.headed });
    try {
      await check(chrome, server, outDir, summary);
      if (options.perf) await perf(chrome, server, summary);
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
    for (const item of summary.checks) console.log(`${item.ok ? "ok  " : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
    console.log(`\n${summary.failures.length ? "FAIL" : "PASS"} — ${outDir}`);
    for (const failure of summary.failures) console.log(`  ${failure}`);
    process.exitCode = summary.failures.length ? 1 : 0;
  }
}

async function mount(chrome, server) {
  const { width, height, scale } = options;
  const page = await chrome.newPage({ width, height, deviceScaleFactor: scale });
  await page.goto(`${server.origin}/harness/harness.html?build=candidate`);
  await waitFor(page, "window.__vtElementLoaded === true", 30000, "element module");
  await page.evaluate(`window.__vtProbe.mount("/bundle/bundle.json", ${JSON.stringify({ width, height })})`);
  // Copper alone, as a run is shown: the board and parts would hide inner layers.
  await page.evaluate(`(async () => {
    const element = window.__vtProbe.element;
    element.setClickSelect(false);
    element.setShowBoard(false);
    element.setShowComponents(false);
    const index = await (await fetch("/packs/index.json")).json();
    window.__mesh = { index, summaries: [] };
    for (const pack of index.packs) {
      const bytes = new Uint8Array(await (await fetch("/packs/" + encodeURIComponent(pack.name))).arrayBuffer());
      window.__mesh.summaries.push(await element.loadMeshPack(bytes, { key: pack.name }));
    }
  })()`);
  return page;
}

/**
 * Loads the board and the first pack, and asserts the overlay drew: the
 * picture changes, pieces and edges each change it, colouring changes it,
 * a framed element is the one picked at the centre, the selection shows.
 * Captures whole board, a close-up on the worst cut, colour-by and the
 * picked element (to --shots when given).
 */
async function check(chrome, server, outDir, summary) {
  const page = await mount(chrome, server);
  const captures = new Map();
  const ok = (name, condition, detail = "") => {
    summary.checks.push({ name, ok: Boolean(condition), detail });
    if (!condition) summary.failures.push(name);
  };
  const evaluate = async (code) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (async () => { const element = window.__vtProbe.element; ${code} })()))()`));
  const capture = async (name, { shot = null } = {}) => {
    await settle(page, name);
    const frame = await page.evaluate("window.__vtProbe.capture()");
    if (!frame) throw new Error(`${name}: no rendered frame`);
    const image = { width: frame.width, height: frame.height, data: new Uint8Array(Buffer.from(frame.rgba, "base64")) };
    captures.set(name, image);
    const png = encodePng(image);
    writeFileSync(join(outDir, `${name}.png`), png);
    if (shot && options.shots) {
      mkdirSync(options.shots, { recursive: true });
      writeFileSync(join(options.shots, `${shot}.png`), png);
    }
    summary.captures.push({ name, hash: frame.hash, stats: JSON.parse(await page.evaluate("JSON.stringify(window.__vtProbe.stats())")) });
    log(`${name}: ${frame.hash}`);
    return image;
  };
  const differs = (a, b) => diffImages(captures.get(a), captures.get(b), { tolerance: 0 }).pixels || 0;
  try {
    const packsLoaded = await evaluate("return window.__mesh.summaries;");
    summary.loaded = packsLoaded;
    const pack = packsLoaded[0];
    ok("a pack loaded", pack?.elements > 0, `${pack?.key}: ${pack?.elements} elements, ${pack?.pieceTriangles} piece triangles`);
    await page.evaluate("window.__vtProbe.applyView('top')");
    await capture("board");
    const shown = await evaluate(`return element.setMeshPack(${JSON.stringify(pack.key)});`);
    summary.shown = shown;
    ok("every slice of the pack is on the board", shown?.unmatchedSlices?.length === 0, `unmatched ${JSON.stringify(shown?.unmatchedSlices)}`);
    if (board.sha256 && pack.bundleSha256 !== board.sha256) summary.warnings = [`bundle_sha256 ${pack.bundleSha256 || "(empty)"} is not the board's ${board.sha256}: matched by frame`];
    await capture("mesh", { shot: "whole-board" });
    ok("the mesh changes the picture", differs("board", "mesh") > 1000, `${differs("board", "mesh")} px`);
    await evaluate("element.setMeshStyle({ edges: false }); return true;");
    await capture("pieces-only");
    ok("pieces draw", differs("board", "pieces-only") > 1000, `${differs("board", "pieces-only")} px`);
    ok("edges draw over the pieces", differs("pieces-only", "mesh") > 1000, `${differs("pieces-only", "mesh")} px`);
    await evaluate("element.setMeshStyle({ edges: true, pieces: 'none' }); return true;");
    await capture("edges-only");
    ok("edges draw alone", differs("board", "edges-only") > 1000, `${differs("board", "edges-only")} px`);
    await evaluate("element.setMeshStyle({ pieces: 'layers' }); return true;");
    const field = pack.fields.find((item) => item.name === "min_angle")?.name || pack.fields[0]?.name;
    if (field) {
      await evaluate(`element.setMeshStyle({ colorBy: ${JSON.stringify(field)} }); return true;`);
      await capture("color-by", { shot: "color-by" });
      ok(`colouring by ${field} changes the picture`, differs("mesh", "color-by") > 1000, `${differs("mesh", "color-by")} px`);
      await evaluate(`element.setMeshStyle({ threshold: { value: ${JSON.stringify(pack.fields.find((item) => item.name === field).range?.[1] ?? 0)}, hide: "below" } }); return true;`);
      await capture("threshold");
      ok("a threshold at the top of the range hides most elements", differs("color-by", "threshold") > 1000, `${differs("color-by", "threshold")} px`);
      await evaluate("element.setMeshStyle({ colorBy: null, threshold: null }); return true;");
    }
    // Pick: frame an element, then pick the canvas centre; it must be that element.
    const worstField = pack.fields.find((item) => item.name === "cut_fraction" && item.range)?.name || field;
    const target = worstField ? (await evaluate(`return element.meshWorst({ field: ${JSON.stringify(worstField)}, count: 1 });`))[0] : { index: Math.floor(pack.elements / 2) };
    summary.target = { field: worstField, ...target };
    // Close up, the outer copper would hide an inner layer's antipad: show the pack's layers alone.
    summary.hiddenLayers = await evaluate(`
      const layers = element.getViewState()?.layers || [];
      const outer = layers.length > 2 ? [layers[0], layers[layers.length - 1]] : [];
      for (const layer of outer) element.setLayerVisible(layer.id, false);
      return outer.map((layer) => layer.name);`);
    await evaluate(`return element.frameMeshElement(${target.index}, { spanMm: 2 });`);
    await settleCamera(page);
    await capture("close-up", { shot: "antipad-close-up" });
    const picked = await evaluate(`
      const canvas = element.shadowRoot.getElementById("viewport");
      const rect = canvas.getBoundingClientRect();
      return element.meshElementAt(rect.left + rect.width / 2, rect.top + rect.height / 2);`);
    summary.picked = picked;
    ok("the element picked at the centre is the one framed", picked?.index === target.index, `framed ${target.index}, picked ${picked?.index} on ${picked?.sliceKey}`);
    ok("a pick returns the element's fields", picked && Object.keys(picked.fields).length === pack.fields.length, JSON.stringify(picked?.fields));
    await evaluate(`element.frameMeshElement(${target.index}, { context: 6 }); return true;`);
    await settleCamera(page);
    await capture("picked", { shot: "picked-element" });
    await evaluate("element.setMeshSelection(null); return true;");
    await capture("unpicked");
    ok("the selected element is highlighted", differs("unpicked", "picked") > 50, `${differs("unpicked", "picked")} px`);
    await evaluate("element.setMeshPack(null); return true;");
    await capture("mesh-off");
    summary.meshStats = await evaluate("return element.meshStats();");
    ok("hiding the mesh frees its GPU memory", summary.meshStats.gpuMemoryBytes === 0, `${summary.meshStats.gpuMemoryBytes} B`);
    if (page.errors.length) summary.failures.push(`page errors: ${[...new Set(page.errors)].slice(0, 5).join(" | ")}`);
  } finally {
    await page.close();
  }
}

/** Frame times by the pixel-diff harness's orbit: mesh off, then each pack shown, plain. */
async function perf(chrome, server, summary) {
  const cases = [null, ...packs.map((pack) => pack.name)];
  for (const key of cases) {
    const page = await mount(chrome, server);
    try {
      await page.evaluate("window.__vtProbe.applyView('default')");
      await page.evaluate(`window.__vtProbe.element.setMeshPack(${JSON.stringify(key)})`);
      await settle(page, `perf ${key}`);
      const result = await page.evaluate(`window.__vtProbe.orbit(${JSON.stringify({ orbitMs: options.orbitMs })})`);
      const mesh = JSON.parse(await page.evaluate("JSON.stringify(window.__vtProbe.element.meshStats())"));
      summary.perf.push({ pack: key, meshGpuMB: +(mesh.gpuMemoryBytes / 1048576).toFixed(1), ...result });
      log(`${key ?? "no mesh"}: interval p50 ${result.intervalP50Ms} / p95 ${result.intervalP95Ms} ms, cpu p95 ${result.cpuP95Ms} ms, gpu submit p50 ${result.gpuSubmitP50Ms} / p95 ${result.gpuSubmitP95Ms} ms, ${result.triangles} tris, mesh ${(mesh.gpuMemoryBytes / 1048576).toFixed(1)} MB`);
    } finally {
      await page.close();
    }
  }
}

async function settle(page, label) {
  const started = Date.now();
  await page.evaluate("window.__vtProbe.resetFrames()");
  for (;;) {
    const status = await page.evaluate("window.__vtProbe.frameStatus()");
    if (page.networkIdle(1000) && status.stable >= 3 && status.stableMs >= 1000) return;
    if (Date.now() - started > 240000) throw new Error(`${label}: did not settle`);
    await new Promise((done) => setTimeout(done, 250));
  }
}

/** The camera eases onto a framed element: wait for it to stop. */
async function settleCamera(page) {
  await new Promise((done) => setTimeout(done, 1500));
}

async function waitFor(page, expression, timeoutMs, label) {
  const started = Date.now();
  while (!(await page.evaluate(expression))) {
    if (Date.now() - started > timeoutMs) throw new Error(`${label}: timed out; ${page.errors.join(" | ")}`);
    await new Promise((done) => setTimeout(done, 200));
  }
}

function parseArgs(argv) {
  const parsed = { board: "demo", packs: [], live: 0, width: 1280, height: 800, scale: 1, out: null, shots: null, perf: false, orbitMs: 4000, headed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--board") parsed.board = argv[++i];
    else if (flag === "--pack") parsed.packs.push(argv[++i]);
    else if (flag === "--live") parsed.live = /^\d+$/.test(argv[i + 1] || "") ? Number(argv[++i]) : 5281;
    else if (flag === "--size") [parsed.width, parsed.height] = argv[++i].split("x").map(Number);
    else if (flag === "--scale") parsed.scale = Number(argv[++i]);
    else if (flag === "--out") parsed.out = argv[++i];
    else if (flag === "--shots") parsed.shots = resolve(argv[++i]);
    else if (flag === "--perf") parsed.perf = true;
    else if (flag === "--orbit-ms") parsed.orbitMs = Number(argv[++i]);
    else if (flag === "--headed") parsed.headed = true;
    else throw new Error(`unknown option ${flag}`);
  }
  if (!parsed.packs.length) parsed.packs.push("demo");
  return parsed;
}
