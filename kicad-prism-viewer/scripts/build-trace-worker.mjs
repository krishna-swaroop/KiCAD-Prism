// Builds the Render action's worker (viewer/src/trace-worker.js) into
// dist/prism-semantic-viewer-trace.js, with MuTracer's runtime assets in
// dist/prism-trace/: its BVH worker (self-contained, WASM inlined), the
// TinyBVH WASM and the OIDN denoiser weights. MuTracer finds them with
// `new URL(<relative>, import.meta.url)`, which esbuild leaves alone, so the
// paths are rewritten to the folder beside the bundle. Licence texts go with
// them (MIT, and Apache-2.0 for the OIDN weights and Adobe's tables).
import { build } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mutracer = path.join(root, "node_modules", "@meimu", "mutracer");
const dist = path.join(root, "dist");
const assets = path.join(dist, "prism-trace");

const REWRITES = [
  ["'./bvh.worker.js'", "'./prism-trace/bvh.worker.js'"],
  ["'./tinybvh.wasm'", "'./prism-trace/tinybvh.wasm'"],
  ["'../oidn/weights/rt_hdr_alb_nrm.tza'", "'./prism-trace/oidn/rt_hdr_alb_nrm.tza'"],
  ["'../oidn/weights/rt_hdr_alb_nrm_small.tza'", "'./prism-trace/oidn/rt_hdr_alb_nrm_small.tza'"],
];

const assetUrls = {
  name: "mutracer-asset-urls",
  setup(context) {
    context.onLoad({ filter: /@meimu[\\/]mutracer[\\/]lib[\\/].*\.js$/ }, async ({ path: file }) => {
      let contents = await readFile(file, "utf8");
      for (const [from, to] of REWRITES) contents = contents.split(`new URL(${from}, import.meta.url)`).join(`new URL(${to}, import.meta.url)`);
      return { contents, loader: "js" };
    });
  },
};

await build({
  entryPoints: [path.join(root, "viewer", "src", "trace-worker.js")],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  outfile: path.join(dist, "prism-semantic-viewer-trace.js"),
  plugins: [assetUrls],
  logOverride: { "empty-import-meta": "silent" },
});

await rm(assets, { recursive: true, force: true });
await mkdir(path.join(assets, "oidn"), { recursive: true });
await cp(path.join(mutracer, "dist", "assets", "bvh.worker.js"), path.join(assets, "bvh.worker.js"));
await cp(path.join(mutracer, "lib", "tinybvh", "tinybvh.wasm"), path.join(assets, "tinybvh.wasm"));
for (const name of ["rt_hdr_alb_nrm.tza", "rt_hdr_alb_nrm_small.tza", "LICENSE.txt"]) {
  await cp(path.join(mutracer, "oidn", "weights", name), path.join(assets, "oidn", name));
}
await cp(path.join(mutracer, "LICENSE"), path.join(assets, "LICENSE"));
await cp(path.join(mutracer, "THIRD_PARTY_NOTICES.md"), path.join(assets, "THIRD_PARTY_NOTICES.md"));
await cp(path.join(mutracer, "LICENSES"), path.join(assets, "LICENSES"), { recursive: true });
console.log("Built the trace worker and its assets");
