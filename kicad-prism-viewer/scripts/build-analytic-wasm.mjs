// Rebuild the vendored analytic-pack WASM from a kicad_monkey checkout at the
// pinned revision, reproducibly, and record its provenance.
//
//   node scripts/build-analytic-wasm.mjs --monkey /path/to/kicad_monkey [--rev <sha>]
//
// The checkout must sit at the revision (default: the one already pinned in
// provenance.json). Local paths are remapped so the binary does not depend on
// where the checkout or the Cargo registry live. Needs the toolchain the
// checkout pins (with the wasm32-unknown-unknown target) and wasm-bindgen-cli
// at the version recorded below.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const viewerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(viewerRoot, "viewer/vendor/kicad-monkey-analytic");
const provenancePath = join(vendor, "provenance.json");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const monkey = option("--monkey");
if (!monkey) throw new Error("usage: build-analytic-wasm.mjs --monkey <kicad_monkey checkout> [--rev <sha>]");
const rev = option("--rev") || provenance.source.revision;

const run = (command, commandArgs, extra = {}) =>
  execFileSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...extra }).trim();

const head = run("git", ["-C", monkey, "rev-parse", "HEAD"]);
if (!head.startsWith(rev) && !rev.startsWith(head)) {
  throw new Error(`checkout is at ${head}, expected ${rev}`);
}
if (run("git", ["-C", monkey, "status", "--porcelain", "src/rs"]) !== "") {
  throw new Error("checkout has local changes under src/rs");
}
const bindgen = run("wasm-bindgen", ["--version"]).split(" ").pop();
if (bindgen !== provenance.build.wasm_bindgen) {
  throw new Error(`wasm-bindgen ${bindgen}, expected ${provenance.build.wasm_bindgen}`);
}
const rustc = run("rustc", ["--version"], { cwd: monkey });

const target = mkdtempSync(join(tmpdir(), "analytic-wasm-"));
try {
  const remap = [
    `--remap-path-prefix=${resolve(monkey)}=/kicad_monkey`,
    `--remap-path-prefix=${join(homedir(), ".cargo")}=/cargo`,
    `--remap-path-prefix=${join(homedir(), ".rustup")}=/rustup`,
  ].join(" ");
  run("cargo", [
    "build", "--locked", "--release",
    "-p", "kicad-monkey-wasm",
    "--target", "wasm32-unknown-unknown",
    "--no-default-features", "--features", provenance.build.features.join(","),
    "--target-dir", target,
  ], { cwd: monkey, env: { ...process.env, RUSTFLAGS: remap } });
  const wasm = join(target, "wasm32-unknown-unknown/release/kicad_monkey_wasm.wasm");
  run("wasm-bindgen", [wasm, "--target", "web", "--out-dir", target, "--out-name", "kicad_monkey_analytic", "--no-typescript"]);
  copyFileSync(join(target, "kicad_monkey_analytic.js"), join(vendor, "kicad_monkey_analytic.js"));
  copyFileSync(join(target, "kicad_monkey_analytic_bg.wasm"), join(vendor, "kicad_monkey_analytic_bg.wasm"));
} finally {
  rmSync(target, { recursive: true, force: true });
}

const sha = (file) => createHash("sha256").update(readFileSync(join(vendor, file))).digest("hex");
provenance.source.revision = head;
provenance.build.rustc = rustc;
provenance.files = {
  "kicad_monkey_analytic.js": sha("kicad_monkey_analytic.js"),
  "kicad_monkey_analytic_bg.wasm": sha("kicad_monkey_analytic_bg.wasm"),
};
writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`analytic wasm ${provenance.files["kicad_monkey_analytic_bg.wasm"]} from ${head}`);
