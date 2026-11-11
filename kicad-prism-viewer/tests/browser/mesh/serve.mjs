// What the mesh check and the mesh host page serve over http://localhost:
// the element built from this worktree, a board, and mesh packs.
//
// A board is a Prism design bundle (`.prism`, a zip of members, manifest
// a3), an analytic bundle directory (`bundle.json` of schema
// prism.viewer_3d.analytic.a0 beside the members it names), or `demo` (the
// analytic fixture board with a synthetic mesh, tests/browser/mesh/fixture.mjs).
// For a design bundle the server answers the viewer's bundle document itself,
// naming the members the backend would (viewer_3d_bundle.py), and serves them
// out of the archive.
//
// Files are read when asked for, not at start: another tool rewrites packs
// and bundles in place, so a read that sees the file change under it (or an
// archive or pack that does not open) waits and reads again. With `live`, the
// element is rebuilt when its sources change, and `/state` tells the page.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync, inflateSync } from "node:zlib";
import { buildElement } from "../pixel-diff/build-element.mjs";
import { deflateMeshPack, demoMeshPack, demoQuadtreePacks } from "./fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(here, "../../..");
const VIEWER_MEMBERS = { analytic_pack: "materialization/board.kmpack", stackup: "projections/stackup.json", components_glb: "viewer/models/components.glb" };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };

/** The entries of a zip archive (stored or deflated), by name: `() => Buffer`. */
export function readZip(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip archive");
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let k = 0; k < count; k += 1) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw new Error("bad zip central directory");
    const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30);
    const comment = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    entries.set(name, () => {
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip method ${method} for ${name}`);
    });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * A file's bytes once it holds still: the same size and time before and
 * after the read, and `whole(bytes)` true. Retries for about 6 s.
 */
export async function readStable(file, whole = () => true) {
  let last = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const before = statSync(file);
      const bytes = readFileSync(file);
      const after = statSync(file);
      if (before.size === after.size && before.mtimeMs === after.mtimeMs && bytes.length === after.size && whole(bytes)) return { bytes, mtimeMs: after.mtimeMs };
    } catch (error) {
      last = error;
    }
    await sleep(150);
  }
  throw new Error(`${basename(file)} did not hold still${last ? `: ${last.message}` : ""}`);
}

/** Whether bytes are a whole mesh pack: inflated, or deflated and inflating. */
function wholePack(bytes) {
  if (bytes.subarray(0, 8).toString("latin1") === "PRSMSH01") return true;
  try {
    return inflateSync(bytes).subarray(0, 8).toString("latin1") === "PRSMSH01";
  } catch {
    return false;
  }
}

function wholeZip(bytes) {
  try {
    return readZip(bytes).has("bundle.json");
  } catch {
    return false;
  }
}

/**
 * A board to serve: `{ name, sha256, mtimeMs, refresh(), document(), member(path) }`.
 * `spec` is a `.prism` file, an analytic bundle directory or "demo". A
 * `.prism` file is opened again when it changes on disk (`refresh`).
 */
export async function openBoard(spec) {
  if (spec === "demo") {
    const pack = readFileSync(join(viewerRoot, "tests/fixtures/analytic/demo.kmpack"));
    return {
      name: "demo",
      sha256: "",
      mtimeMs: 0,
      refresh: async () => {},
      document: () => viewerDocument("demo", { analytic_pack: VIEWER_MEMBERS.analytic_pack }),
      member: (path) => (path === VIEWER_MEMBERS.analytic_pack ? pack : null),
    };
  }
  const path = resolve(spec);
  if (statSync(path).isDirectory()) {
    return {
      name: basename(path),
      sha256: "",
      mtimeMs: statSync(join(path, "bundle.json")).mtimeMs,
      refresh: async () => {},
      document: () => JSON.parse(readFileSync(join(path, "bundle.json"), "utf8")),
      member: (name) => {
        const file = resolve(path, name);
        return file.startsWith(path + sep) && existsSync(file) ? readFileSync(file) : null;
      },
    };
  }
  const board = { name: basename(path), sha256: "", mtimeMs: -1, size: -1 };
  board.refresh = async () => {
    const stat = statSync(path);
    if (stat.mtimeMs === board.mtimeMs && stat.size === board.size) return;
    const { bytes, mtimeMs } = await readStable(path, wholeZip);
    const zip = readZip(bytes);
    const manifest = JSON.parse(zip.get("bundle.json")().toString("utf8"));
    const assets = Object.fromEntries(Object.entries(VIEWER_MEMBERS).filter(([, member]) => zip.has(member)));
    if (!assets.analytic_pack) throw new Error(`${spec}: no ${VIEWER_MEMBERS.analytic_pack} (is the board stage built?)`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    Object.assign(board, {
      sha256,
      mtimeMs,
      size: bytes.length,
      schema: manifest.schema,
      document: () => viewerDocument(manifest.bundle_key || sha256, assets),
      member: (name) => (zip.has(name) ? zip.get(name)() : null),
    });
  };
  await board.refresh();
  return board;
}

function viewerDocument(cacheKey, assets) {
  return { schema: "prism.viewer_3d.analytic.a0", cache_key: cacheKey, readiness: { stage: "semantic-ready", progress: 100 }, asset_base: "./", assets };
}

/**
 * Mesh packs to serve, looked up when asked: files, directories of
 * `*.meshpack` (listed afresh each time), or "demo" (the fixture's: plain,
 * fine, and a quadtree group, made once). `list()` gives
 * `[{ name, bytes, mtimeMs }]`; `read(name)` the bytes, whole.
 */
export function openPacks(specs) {
  const made = new Map();
  if (specs.includes("demo")) {
    made.set("demo-2mm.meshpack", deflateMeshPack(demoMeshPack()));
    made.set("demo-1mm.meshpack", deflateMeshPack(demoMeshPack({ pitchMm: 1, label: "demo background, finer", pass: 2 })));
    demoQuadtreePacks().forEach((bytes, k) => made.set(`demo-dc-${k ? "back" : "front"}.meshpack`, deflateMeshPack(bytes)));
  }
  const files = () => {
    const out = new Map();
    for (const spec of specs.filter((item) => item !== "demo")) {
      const path = resolve(spec);
      if (!existsSync(path)) continue;
      const list = statSync(path).isDirectory() ? readdirSync(path).filter((name) => name.endsWith(".meshpack")).sort().map((name) => join(path, name)) : [path];
      for (const file of list) out.set(basename(file), file);
    }
    return out;
  };
  return {
    list() {
      const out = [...made].map(([name, bytes]) => ({ name, bytes: bytes.length, mtimeMs: 0 }));
      for (const [name, file] of files()) {
        try {
          const stat = statSync(file);
          out.push({ name, bytes: stat.size, mtimeMs: stat.mtimeMs });
        } catch {
          // Gone between the listing and the stat: left out.
        }
      }
      return out;
    },
    async read(name) {
      if (made.has(name)) return made.get(name);
      const file = files().get(name);
      return file ? (await readStable(file, wholePack)).bytes : null;
    },
  };
}

/**
 * Build the element into `buildDir` and serve:
 *   /builds/candidate.js (+ worker, WASM)   the element from this worktree
 *   /harness/…                              the pixel-diff probe page
 *   /mesh/…                                 this directory (the host page)
 *   /bundle/bundle.json, /bundle/<member>   the board
 *   /packs/index.json, /packs/<name>        the mesh packs, as they are on disk now
 *   /state                                  the build id and stamp, a build error, the packs' digest, the board's sha
 * With `live`, a change to the viewer's sources rebuilds the element
 * (debounced; a failed build keeps the last good one and reports its error)
 * and a change to this directory's page bumps the build id.
 */
export async function serveMesh({ board, packs, buildDir, port = 0, live = false }) {
  const stage = join(buildDir, "stage");
  mkdirSync(stage, { recursive: true });
  const wasm = join(viewerRoot, "viewer/vendor/prism-kicad-wasm/prism_kicad_analytic_bg.wasm");
  const state = { buildId: 0, stamp: "", buildError: null, build: null };
  const rebuild = () => {
    try {
      // Into a staging folder, then moved over the served files: never half a build.
      const build = buildElement("worktree", join(stage, "candidate.js"));
      if (existsSync(wasm)) copyFileSync(wasm, join(stage, "prism-kicad-analytic.wasm"));
      for (const name of ["candidate.js", "prism-semantic-viewer-lower.js", "prism-kicad-analytic.wasm"]) {
        if (existsSync(join(stage, name))) renameSync(join(stage, name), join(buildDir, name));
      }
      state.build = build;
      state.buildError = null;
      state.buildId += 1;
      state.stamp = `${build.commit || ""}${build.dirty ? "+" : ""} ${new Date().toISOString().slice(11, 19)}`;
    } catch (error) {
      state.buildError = String(error.message || error).slice(0, 2000);
      if (!state.buildId) throw error;
    }
  };
  rebuild();
  const watchers = [];
  if (live) {
    let timer = null;
    const soon = (what) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (what === "page") state.buildId += 1;
        else rebuild();
      }, 300);
    };
    watchers.push(watch(join(viewerRoot, "viewer"), { recursive: true }, (event, name) => {
      if (name && /\.(js|css|wasm)$/.test(name)) soon("element");
    }));
    watchers.push(watch(here, (event, name) => {
      if (name && /\.(html|mjs)$/.test(name) && !name.startsWith("out")) soon(name === "host.html" ? "page" : "element");
    }));
  }
  const roots = new Map([["harness", resolve(here, "../pixel-diff")], ["builds", buildDir], ["mesh", here]]);
  const packIndex = () => ({ board: { name: board.name, sha256: board.sha256, mtimeMs: board.mtimeMs }, packs: packs.list() });
  const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    const send = (body, type = "application/octet-stream") => {
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    };
    try {
      if (path === "") return void response.writeHead(302, { location: "/mesh/host.html" }).end();
      if (path === "state") {
        await board.refresh();
        const index = packIndex();
        return void send(JSON.stringify({ buildId: state.buildId, stamp: state.stamp, buildError: state.buildError, packs: digest(index.packs), board: index.board }), "application/json");
      }
      if (path === "bundle/bundle.json") {
        await board.refresh();
        return void send(JSON.stringify(board.document()), "application/json");
      }
      if (path.startsWith("bundle/")) {
        const bytes = board.member(path.slice("bundle/".length));
        return void (bytes ? send(bytes, TYPES[extname(path)]) : response.writeHead(404).end());
      }
      if (path === "packs/index.json") return void send(JSON.stringify(packIndex()), "application/json");
      if (path.startsWith("packs/")) {
        const bytes = await packs.read(path.slice("packs/".length));
        return void (bytes ? send(bytes) : response.writeHead(404).end());
      }
      const prefix = [...roots.keys()].find((key) => path.startsWith(`${key}/`));
      if (!prefix) return void response.writeHead(404).end();
      const root = roots.get(prefix);
      const file = resolve(root, path.slice(prefix.length + 1));
      if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void response.writeHead(404).end();
      send(readFileSync(file), TYPES[extname(file)]);
    } catch (error) {
      response.writeHead(503, { "content-type": "text/plain" }).end(String(error.message || error));
    }
  });
  await new Promise((done) => server.listen(port, "127.0.0.1", done));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    build: state.build,
    close: () => {
      for (const watcher of watchers) watcher.close();
      server.close();
    },
  };
}
