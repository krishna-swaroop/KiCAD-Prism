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
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { buildElement } from "../pixel-diff/build-element.mjs";
import { deflateMeshPack, demoMeshPack } from "./fixture.mjs";

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

/**
 * A board to serve: `{ name, sha256, document(), member(path) }`. `spec` is
 * a `.prism` file, an analytic bundle directory or "demo".
 */
export function openBoard(spec) {
  if (spec === "demo") {
    const pack = readFileSync(join(viewerRoot, "tests/fixtures/analytic/demo.kmpack"));
    return {
      name: "demo",
      sha256: "",
      document: () => viewerDocument("demo", { analytic_pack: VIEWER_MEMBERS.analytic_pack }),
      member: (path) => (path === VIEWER_MEMBERS.analytic_pack ? pack : null),
    };
  }
  const path = resolve(spec);
  if (statSync(path).isDirectory()) {
    return {
      name: basename(path),
      sha256: "",
      document: () => JSON.parse(readFileSync(join(path, "bundle.json"), "utf8")),
      member: (name) => {
        const file = resolve(path, name);
        return file.startsWith(path + sep) && existsSync(file) ? readFileSync(file) : null;
      },
    };
  }
  const bytes = readFileSync(path);
  const zip = readZip(bytes);
  const manifest = JSON.parse(zip.get("bundle.json")().toString("utf8"));
  const assets = Object.fromEntries(Object.entries(VIEWER_MEMBERS).filter(([, member]) => zip.has(member)));
  if (!assets.analytic_pack) throw new Error(`${spec}: no ${VIEWER_MEMBERS.analytic_pack} (is the board stage built?)`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    name: basename(path),
    sha256,
    schema: manifest.schema,
    document: () => viewerDocument(manifest.bundle_key || sha256, assets),
    member: (name) => (zip.has(name) ? zip.get(name)() : null),
  };
}

function viewerDocument(cacheKey, assets) {
  return { schema: "prism.viewer_3d.analytic.a0", cache_key: cacheKey, readiness: { stage: "semantic-ready", progress: 100 }, asset_base: "./", assets };
}

/** Mesh packs to serve: files, directories of `*.meshpack`, or "demo" (the fixture's, plain and fine). */
export function openPacks(specs) {
  const packs = [];
  for (const spec of specs) {
    if (spec === "demo") {
      packs.push({ name: "demo-2mm.meshpack", bytes: deflateMeshPack(demoMeshPack()) });
      packs.push({ name: "demo-1mm.meshpack", bytes: deflateMeshPack(demoMeshPack({ pitchMm: 1, label: "demo background, finer", pass: 2 })) });
      continue;
    }
    const path = resolve(spec);
    const files = statSync(path).isDirectory() ? readdirSync(path).filter((name) => name.endsWith(".meshpack")).sort().map((name) => join(path, name)) : [path];
    for (const file of files) packs.push({ name: basename(file), bytes: readFileSync(file) });
  }
  return packs;
}

/**
 * Build the element into `buildDir` and serve:
 *   /builds/candidate.js (+ worker, WASM)   the element from this worktree
 *   /harness/…                              the pixel-diff probe page
 *   /mesh/…                                 this directory (the host page)
 *   /bundle/bundle.json, /bundle/<member>   the board
 *   /packs/index.json, /packs/<name>        the mesh packs
 */
export async function serveMesh({ board, packs, buildDir, port = 0 }) {
  const build = buildElement("worktree", join(buildDir, "candidate.js"));
  const wasm = join(viewerRoot, "viewer/vendor/prism-kicad-wasm/prism_kicad_analytic_bg.wasm");
  if (existsSync(wasm)) copyFileSync(wasm, join(buildDir, "prism-kicad-analytic.wasm"));
  const roots = new Map([["harness", resolve(here, "../pixel-diff")], ["builds", buildDir], ["mesh", here]]);
  const index = { board: { name: board.name, sha256: board.sha256 }, packs: packs.map((pack) => ({ name: pack.name, bytes: pack.bytes.length })) };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    const send = (body, type = "application/octet-stream") => {
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    };
    if (path === "") return void response.writeHead(302, { location: "/mesh/host.html" }).end();
    if (path === "bundle/bundle.json") return void send(JSON.stringify(board.document()), "application/json");
    if (path.startsWith("bundle/")) {
      const bytes = board.member(path.slice("bundle/".length));
      return void (bytes ? send(bytes, TYPES[extname(path)]) : response.writeHead(404).end());
    }
    if (path === "packs/index.json") return void send(JSON.stringify(index), "application/json");
    if (path.startsWith("packs/")) {
      const pack = packs.find((item) => item.name === path.slice("packs/".length));
      return void (pack ? send(pack.bytes) : response.writeHead(404).end());
    }
    const prefix = [...roots.keys()].find((key) => path.startsWith(`${key}/`));
    if (!prefix) return void response.writeHead(404).end();
    const root = roots.get(prefix);
    const file = resolve(root, path.slice(prefix.length + 1));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void response.writeHead(404).end();
    send(readFileSync(file), TYPES[extname(file)]);
  });
  await new Promise((done) => server.listen(port, "127.0.0.1", done));
  return { origin: `http://127.0.0.1:${server.address().port}`, build, close: () => server.close() };
}
