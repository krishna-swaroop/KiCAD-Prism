#!/usr/bin/env node
// Spike (not for merge): a System Builder scene in <prism-semantic-viewer mode="system">,
// measured for occlusion. Boards: carrier, SoM stacked on it, two small cards
// stacked beside, in an enclosure tray of stand-in boxes (floor, four walls, an
// optional lid). For a few fixed views it records, per occurrence, the pixels it
// covers alone, the pixels it covers in the full scene (the full frame against
// the frame without it), and the GPU time of a static frame with every
// occurrence, with each removed, and with only the occurrences that show.
//
//   node tests/browser/perf/scene.mjs --carrier dir --som dir --card dir [--scale 2] [--msaa 4] [--out dir]
import { mkdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildElement } from "../pixel-diff/build-element.mjs";
import { launchChrome } from "../pixel-diff/chrome.mjs";
import { encodePng } from "../pixel-diff/image.mjs";
import { loadAnalyticWasm, openAnalyticPack, sliceBoundsMm } from "../../../viewer/src/analytic-pack.js";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(here, "../../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[i + 1]]] : acc), []));
const scale = Number(args.scale || 2);
const msaa = Number(args.msaa || 4);
const [width, height] = (args.size || "1280x800").split("x").map(Number);
const outDir = resolve(args.out || join(here, "out", `scene-${Date.now()}`));
mkdirSync(outDir, { recursive: true });

await loadAnalyticWasm(readFileSync(join(viewerRoot, "viewer/vendor/prism-kicad-wasm/prism_kicad_analytic_bg.wasm")));
async function boardBox(dir) {
  const pack = await openAnalyticPack(readFileSync(join(dir, "board.kmpack")));
  try {
    let all = null;
    for (const slice of pack.header.stack.slices) {
      const b = sliceBoundsMm(pack.header, slice.key);
      if (b) all = all ? [Math.min(all[0], b[0]), Math.min(all[1], b[1]), Math.max(all[2], b[2]), Math.max(all[3], b[3])] : b;
    }
    return all;
  } finally {
    pack.free();
  }
}
const dirs = { carrier: resolve(args.carrier), som: resolve(args.som), card: resolve(args.card) };
const boxes = {};
for (const [k, d] of Object.entries(dirs)) boxes[k] = await boardBox(d);

// Runtime y is KiCad y flipped (checked from the top view); centre each board on its own box.
const centreOf = (b) => [(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2];
const size = (b) => [b[2] - b[0], b[3] - b[1]];
const place = (key, [x, y, z]) => {
  const [cx, cy] = centreOf(boxes[key]);
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x - cx, y - cy, z, 1];
};
const [cw, ch] = size(boxes.carrier);
const [kw] = size(boxes.card);
const boards = [
  { path: "carrier", asset: "carrier", at: [0, 0, 0] },
  { path: "som", asset: "som", at: [0, 0, 9] },
  { path: "card-1", asset: "card", at: [cw / 2 + kw / 2 + 8, 0, 0] },
  { path: "card-2", asset: "card", at: [cw / 2 + kw / 2 + 8, 0, 12] },
];
const inner = [-cw / 2 - 6, -ch / 2 - 6, cw / 2 + kw + 16, ch / 2 + 6];
const wall = 2.5;
const [z0, z1] = [-6, 28];
const box = (path, min, max) => ({ path, min, max });
const tray = [
  box("floor", [inner[0] - wall, inner[1] - wall, z0 - wall], [inner[2] + wall, inner[3] + wall, z0]),
  box("wall-s", [inner[0] - wall, inner[1] - wall, z0], [inner[2] + wall, inner[1], z1]),
  box("wall-n", [inner[0] - wall, inner[3], z0], [inner[2] + wall, inner[3] + wall, z1]),
  box("wall-w", [inner[0] - wall, inner[1], z0], [inner[0], inner[3], z1]),
  box("wall-e", [inner[2], inner[1], z0], [inner[2] + wall, inner[3], z1]),
];
const lid = box("lid", [inner[0] - wall, inner[1] - wall, z1], [inner[2] + wall, inner[3] + wall, z1 + wall]);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const pose = { translationMm: [0, 0, 0], rotation: [0, 0, 0, 1], source: "manual" };
function descriptor(paths, withLid) {
  const occ = [];
  for (const b of boards) if (paths.includes(b.path)) occ.push({ path: b.path, label: b.path, kind: "board", assetId: b.asset, worldMatrix: place(b.asset, b.at), pose, boundsMm: null, restricted: false, movable: false, explode: null });
  for (const t of [...tray, ...(withLid ? [lid] : [])]) if (paths.includes(t.path)) occ.push({ path: t.path, label: t.path, kind: "board", assetId: null, worldMatrix: IDENTITY, pose, boundsMm: { minMm: t.min, maxMm: t.max }, restricted: false, movable: false, explode: null });
  return {
    schema: "prism.system_scene.a0",
    occurrences: occ,
    assets: ["carrier", "som", "card"].map((id) => ({ assetId: id, status: "ready", bundleUrl: `/b/${id}/bundle.json`, bundleToBoard: null })),
    harnesses: [],
    showHarnesses: false,
  };
}

const buildDir = mkdtempSync(join(tmpdir(), "scene-perf-"));
buildElement(args.build || "worktree", join(buildDir, "element.js"));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
const page = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style>
<script type="module">await import("/build/element.js"); window.__loaded = true;</script></head><body></body></html>`;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  if (path === "page.html") return void res.writeHead(200, { "content-type": "text/html" }).end(page);
  let root = null;
  let rest = null;
  if (path.startsWith("build/")) [root, rest] = [buildDir, path.slice(6)];
  else if (path.startsWith("b/")) {
    const [, id, ...tail] = path.split("/");
    [root, rest] = [dirs[id], tail.join("/")];
  }
  const file = root && resolve(root, rest);
  if (!file || !file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = await launchChrome({ headless: !args.headed, unthrottled: true });
const all = [...boards.map((b) => b.path), ...tray.map((t) => t.path), "lid"];
const results = { scale, msaa, width, height, boxes, views: [] };
try {
  const tab = await chrome.newPage({ width, height, deviceScaleFactor: scale });
  await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(join(here, "gpu-meter.js"), "utf8") });
  await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__prismSampleCount = ${msaa};` });
  await tab.goto(`${origin}/page.html`);
  for (let i = 0; i < 600 && !(await tab.evaluate("window.__loaded === true")); i += 1) await new Promise((r) => setTimeout(r, 100));
  await tab.evaluate(`(async () => {
    const el = document.createElement("prism-semantic-viewer");
    el.style.cssText = "display:block;width:${width}px;height:${height}px";
    el.setAttribute("active", "true"); el.setAttribute("hide-panel", "true"); el.setAttribute("mode", "system");
    document.body.append(el); window.el = el;
    await new Promise((r) => el.addEventListener("prism-semantic-viewer:ready", r, { once: true }));
    return true;
  })()`);
  const set = async (paths, withLid) => tab.evaluate(`(async () => { el.setSystemScene(${JSON.stringify(descriptor(paths, withLid))}); return true; })()`);
  // Load every board, then wait for them to be drawn.
  await set(all, false);
  await new Promise((r) => setTimeout(r, 15000));
  await tab.evaluate(`(async () => { el.setLabelsVisible?.(false); return true; })()`);
  const helpers = `(() => {
    const meter = window.__gpuMeter;
    const canvas = () => el.shadowRoot.getElementById("viewport");
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    window.__still = async () => { for (let i = 0; i < 90; i += 1) await raf(); await new Promise((r) => setTimeout(r, 400)); };
    // GPU ms of a static frame: re-set the scene (a redraw) n times, median of drawn submits.
    window.__frameGpu = async (desc, n = 12) => {
      el.setSystemScene(desc); await window.__still();
      meter.reset(); meter.enabled = true;
      for (let i = 0; i < n; i += 1) { el.setSystemScene(desc); await raf(); await raf(); }
      meter.enabled = false; await meter.drain();
      const g = meter.samples.filter((s) => s.passes > 0 && s.draws > 0).map((s) => s.gpuMs).filter((v) => v != null).sort((a, b) => a - b);
      const v = meter.samples.filter((s) => s.passes > 0 && s.draws > 0).map((s) => s.vertices);
      return { gpuMs: g.length ? +g[Math.floor(g.length / 2)].toFixed(3) : null, frames: g.length, vertices: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null };
    };
    window.__shot = async (desc) => {
      el.setSystemScene(desc); await window.__still();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        window.__gpuMeter.wanted = null;
        const p = window.__gpuMeter.capture(canvas());
        // A tiny explode change forces a redraw without moving anything visibly (30 mm × 1e-7).
        el.setAssemblyExplode(attempt % 2 ? 0 : 1e-7);
        const img = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 2500))]);
        if (img) { el.setAssemblyExplode(0); return img; }
      }
      window.__gpuMeter.wanted = null;
      return null;
    };
  })()`;
  await tab.evaluate(helpers);
  if (args.debug) {
    console.log(await tab.evaluate(`(async () => { const m = window.__gpuMeter; const d = ${JSON.stringify(descriptor(all, false))};
      el.setSystemScene(d); el.frameAll(); await window.__still(); const a = m.drawnFrames; await new Promise((r) => setTimeout(r, 3000)); const b = m.drawnFrames;
      el.setSystemScene(d); await new Promise((r) => setTimeout(r, 500)); const c = m.drawnFrames;
      let thrown = null; try { el.setSystemScene(${JSON.stringify(descriptor(all.filter((p) => p !== "carrier"), false))}); } catch (e) { thrown = String(e); }
      await new Promise((r) => setTimeout(r, 2000)); const e = m.drawnFrames;
      const g0 = await window.__frameGpu(d); const f0 = m.drawnFrames; await new Promise((r) => setTimeout(r, 2500)); const f1 = m.drawnFrames;
      window.__dbg = { g0, framesAfterGpu: f1 - f0 };
      const t0 = performance.now(); const s1 = await window.__shot(d); const t1 = performance.now();
      const s2 = await window.__shot(${JSON.stringify(descriptor(all.filter((p) => p !== "carrier"), false))}); const t2 = performance.now();
      return JSON.stringify({ dbg: window.__dbg, shotFull: s1 ? s1.width : null, ms1: t1 - t0, shotWithout: s2 ? s2.width : null, ms2: t2 - t1, idle3s: b - a, afterSet: c - b, withoutCarrier: e - c, thrown, err: m.captureError, wanted: Boolean(m.wanted) }); })()`));
    process.exit(0);
  }
  const decodeOr = (paths, img) => { if (!img) throw new Error(`no frame for [${paths}]; page errors: ${[...new Set(tab.errors || [])].slice(0, 3).join(" | ")}`); return decode(img); };
  const decode = (img) => ({ width: img.width, height: img.height, data: new Uint8Array(Buffer.from(img.rgba, "base64")) });
  const differs = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 6) n += 1; return n; };
  // Pixels not the clear colour (read at a corner, which no view covers).
  const covered = (a) => { const [r, g, b] = [a.data[0], a.data[1], a.data[2]]; let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - r) + Math.abs(a.data[i + 1] - g) + Math.abs(a.data[i + 2] - b) > 6) n += 1; return n; };
  const shot = async (paths, withLid) => decodeOr(paths, JSON.parse(await tab.evaluate(`window.__shot(${JSON.stringify(descriptor(paths, withLid))}).then((i) => JSON.stringify(i))`)));
  const gpu = async (paths, withLid) => args["no-gpu"] ? { gpuMs: null, vertices: null } : JSON.parse(await tab.evaluate(`window.__frameGpu(${JSON.stringify(descriptor(paths, withLid))}).then(JSON.stringify)`));
  const views = [["iso", "el.frameAll()"], ["top", "el.viewAxis('z')"]];
  for (const [view, code] of views) {
    for (const withLid of [false, true]) {
      const paths = withLid ? all : all.filter((p) => p !== "lid");
      await tab.evaluate(`(async () => { el.setSystemScene(${JSON.stringify(descriptor(paths, withLid))}); ${code}; await window.__still(); return true; })()`);
      const full = await shot(paths, withLid);
      writeFileSync(join(outDir, `${view}${withLid ? "-lid" : ""}.png`), encodePng(full));
      const fullGpu = await gpu(paths, withLid);
      const rows = [];
      for (const p of paths) {
        const without = await shot(paths.filter((q) => q !== p), withLid);
        const isBoard = boards.some((b) => b.path === p);
        // A scene of stand-in boxes alone draws no frame: only boards get an alone shot.
        const alone = isBoard ? await shot([p], withLid) : null;
        const visiblePx = differs(full, without);
        if (p.startsWith("card") || p === "lid") writeFileSync(join(outDir, `${view}${withLid ? "-lid" : ""}-without-${p}.png`), encodePng(without));
        if (alone && p.startsWith("card")) writeFileSync(join(outDir, `${view}-alone-${p}.png`), encodePng(alone));
        const alonePx = alone ? covered(alone) : null;
        const g = isBoard && !args["no-gpu"] ? await gpu(paths.filter((q) => q !== p), withLid) : null;
        rows.push({ path: p, alonePx, visiblePx, visibleShare: alonePx ? +(visiblePx / alonePx).toFixed(3) : null, gpuWithoutMs: g?.gpuMs ?? null, savedMs: g ? +(fullGpu.gpuMs - g.gpuMs).toFixed(3) : null });
      }
      // The scene with only the occurrences that show at all (what a perfect occlusion cull would draw).
      const shown = rows.filter((r) => r.visiblePx > 0).map((r) => r.path);
      const culled = await gpu(shown, withLid);
      const entry = { view, lid: withLid, fullGpuMs: fullGpu.gpuMs, fullVertices: fullGpu.vertices, shownOnlyGpuMs: culled.gpuMs, rows };
      results.views.push(entry);
      console.log(`\n${view}${withLid ? " + lid" : ""}: full ${fullGpu.gpuMs} ms (${fullGpu.vertices} direct vertices), only shown occurrences ${culled.gpuMs} ms`);
      for (const r of rows) console.log(`  ${r.path.padEnd(8)} alone ${String(r.alonePx).padStart(8)} px  visible ${String(r.visiblePx).padStart(8)} px  (${r.visibleShare})  ${r.savedMs != null ? `GPU saved if removed ${r.savedMs} ms` : ""}`);
    }
  }
  results.attachmentsMB = +(JSON.parse(await tab.evaluate("JSON.stringify(window.__gpuMeter.attachmentReport())")).reduce((a, t) => a + t.bytes, 0) / 1048576).toFixed(1);
  if (tab.errors?.length) results.pageErrors = [...new Set(tab.errors)].slice(0, 5);
  await tab.close();
} finally {
  await chrome.close();
  server.close();
  rmSync(buildDir, { recursive: true, force: true });
  writeFileSync(join(outDir, "scene.json"), `${JSON.stringify(results, null, 1)}\n`);
  console.log(`wrote ${join(outDir, "scene.json")}${results.pageErrors ? ` PAGE ERRORS ${results.pageErrors.join(" | ")}` : ""}`);
}
