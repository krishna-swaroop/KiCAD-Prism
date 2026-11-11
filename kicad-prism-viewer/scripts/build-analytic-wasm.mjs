// Rebuild the viewer's analytic WASM from this repository's `prism-kicad-wasm`
// crate (ADR amendment V2 §8, V2a), reproducibly, and record its provenance.
//
//   node scripts/build-analytic-wasm.mjs
//
// It reads materialization packs (`kicad_monkey.materialization.a1` and a0, the
// bundle's `materialization/board.kmpack`) and lowers their slices for the
// analytic renderer. The native workspace must have no local changes; the
// provenance records its tree. Needs the toolchain `native/rust-toolchain.toml`
// pins, with the wasm32-unknown-unknown target, and wasm-bindgen-cli at the
// version `native/Cargo.lock` pins.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const viewerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const native = resolve(viewerRoot, "../native");
const vendor = join(viewerRoot, "viewer/vendor/prism-kicad-wasm");
const NAME = "prism_kicad_analytic";
const FEATURES = ["materialization"];

const run = (command, args, extra = {}) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...extra }).trim();

if (run("git", ["status", "--porcelain", "--", "src/rs", "Cargo.toml", "Cargo.lock"], { cwd: native })) {
  throw new Error("native/ has local changes under src/rs, Cargo.toml or Cargo.lock");
}
const tree = run("git", ["rev-parse", "HEAD:native/src/rs"], { cwd: native });
const lock = readFileSync(join(native, "Cargo.lock"), "utf8");
const pinned = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1];
const bindgen = run("wasm-bindgen", ["--version"]).split(" ").pop();
if (bindgen !== pinned) throw new Error(`wasm-bindgen ${bindgen}, Cargo.lock pins ${pinned}`);
const rustc = run("rustc", ["--version"], { cwd: native });

const target = mkdtempSync(join(tmpdir(), "analytic-wasm-"));
try {
  const remap = [
    `--remap-path-prefix=${native}=/native`,
    `--remap-path-prefix=${join(homedir(), ".cargo")}=/cargo`,
    `--remap-path-prefix=${join(homedir(), ".rustup")}=/rustup`,
  ].join(" ");
  run("cargo", [
    "build", "--locked", "--release",
    "-p", "prism-kicad-wasm",
    "--target", "wasm32-unknown-unknown",
    "--no-default-features", "--features", FEATURES.join(","),
    "--target-dir", target,
  ], { cwd: native, env: { ...process.env, RUSTFLAGS: remap } });
  const wasm = join(target, "wasm32-unknown-unknown/release/prism_kicad_wasm.wasm");
  run("wasm-bindgen", [wasm, "--target", "web", "--out-dir", target, "--out-name", NAME, "--no-typescript"]);
  mkdirSync(vendor, { recursive: true });
  copyFileSync(join(target, `${NAME}.js`), join(vendor, `${NAME}.js`));
  copyFileSync(join(target, `${NAME}_bg.wasm`), join(vendor, `${NAME}_bg.wasm`));
} finally {
  rmSync(target, { recursive: true, force: true });
}

const sha = (file) => createHash("sha256").update(readFileSync(join(vendor, file))).digest("hex");
const provenance = {
  schema: "prism.vendored_wasm.a0",
  purpose: "Reads materialization packs (kicad_monkey.materialization.a1 and a0) in the browser and lowers their slices for the analytic renderer.",
  source: { repository: "this repository", crate: "prism-kicad-wasm", native_src_rs_tree: tree, license: "MIT" },
  build: {
    target: "wasm32-unknown-unknown",
    profile: "release",
    features: FEATURES,
    wasm_bindgen: bindgen,
    rustc,
    command: "node scripts/build-analytic-wasm.mjs",
  },
  files: { [`${NAME}.js`]: sha(`${NAME}.js`), [`${NAME}_bg.wasm`]: sha(`${NAME}_bg.wasm`) },
};
writeFileSync(join(vendor, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`analytic wasm ${provenance.files[`${NAME}_bg.wasm`]} from native/src/rs tree ${tree}`);
