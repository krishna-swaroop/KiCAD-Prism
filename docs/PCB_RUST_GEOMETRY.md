# Rust PCB geometry backend

Prism has an opt-in Linux source-build path for PCB copper geometry. The
default remains `legacy`; set `PRISM_PCB_GEOMETRY_BACKEND=rust` to use it. An
explicit Rust selection fails closed if the helper is missing, the schema or
source digest is wrong, the pinned upstream revision differs, or the helper
reports an error diagnostic.

## Upstream boundary

The dependency is pinned to `wavenumber-eng/kicad_monkey` revision
`bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d`, engine version `2026.9.7`, with
Rust `1.95.0`. At that revision the analytic copper materializer discussed in
upstream issue 20 is not a public stable API. Prism therefore uses the public
source-backed `PcbView`, selected PCB families, resolved net references, and
`resolve_pad_copper_layer`. Conditional remove-unused-layer policy is the only
narrow exception: the public board plot document is used as a layer-presence
fact oracle, and the contract emits a diagnostic when that path is exercised.

This is distinct from upstream's packaged native provider. Windows has the
promoted packaged native application/provider path. Prism's Linux deployment
does not consume that package; it directly compiles the portable Rust library
inside its controlled worker image. Upstream's Linux/macOS packaged provider
switches remain development/test surfaces and are not production dependencies.

## Pipeline and ownership

```text
.kicad_pcb
    │
    ▼
kicad-monkey-core public source model (Rust)
    │  source scan, selected indexing, typed semantics, nets, padstacks
    ▼
prism-kicad-native (Rust, Prism-owned adapter)
    │  prism.pcb_analytic_geometry.v2 operations in memory
    ▼
tile-aware native lowering + Geometer + Rust triangulation
    │  prism.semantic_mesh_pack.v1 packed tile buffers
    ▼
thin Node GLB/Meshopt packager
    ▼
WebGPU scene manifest and GLB tiles
```

`kicad-monkey-core` owns KiCad interpretation. Prism owns the contract,
polygonal approximation tolerance, subprocess lifecycle, strict validation,
scene ingestion, and rendering. The adapter does not contain an S-expression
or KiCad parser.

Rust handles board source scanning/indexing; resolved name-based and ordinal net
references; analytic tracks, routed arcs, vias, drills and standard pads;
footprint transforms; filled-zone polygons and custom regions; tile
classification; terminal clipping; triangulation; and packed tile output. The
Rust backend does not build the former global polygon JSON or hydrate a Python
geometry graph. Node only authors GLBs, applies Meshopt and writes the existing
scene manifest. Python still loads design/netlist topology and coordinates the
independent semantic, board and component lanes.

Rust mode also builds the board body, holes and silkscreen directly through the
Geometer SDK. Component-model export remains on KiCad CLI until native STEP
resolution has equivalent coverage. This limitation does not affect the legacy
backend.

PCB geometry emission and semantic tile compilation now run concurrently with
KiCad board/component GLB export. Semantic Z placement uses the PCB stackup's
canonical board frame rather than inspecting `base_board.glb`; component
node/mesh bindings are patched atomically into the scene manifest when export
finishes, without rebuilding copper tiles.

## Contract and identity

The producer contract is
`kicad-prism-viewer/native/prism-kicad-native/schema/prism.pcb_analytic_geometry.v2.schema.json`;
the terminal output is `prism.semantic_mesh_pack.v1`. Coordinates remain integer
nanometres in KiCad board axes until terminal lowering. Layer and net indexes
are dense. Every operation and drill retains its source UID, semantic ID, net,
physical layer set, footprint UID, reference and pad number. Feature IDs remain
attached through clipping and tile boundaries, feeding selection and net
highlighting without semantic rebinding. The v1 polygon schema remains only as
a compatibility interface for legacy tooling.

## Build and operation

Docker uses a reproducible Rust builder stage and requires formatting, release
tests, Clippy and `cargo build --release --locked` to pass. Only
`/usr/local/bin/prism-kicad-native` enters the runtime image; the Python runtime
does not need a Rust toolchain.

Useful settings:

```text
PRISM_PCB_GEOMETRY_BACKEND=legacy|rust|python-copper
PRISM_KICAD_NATIVE_PATH=/usr/local/bin/prism-kicad-native
PRISM_KICAD_NATIVE_TIMEOUT_SECONDS=300
```

`python-copper` is retained only as an experimental compatibility surface. It
is not selected automatically. Rollback is immediate: set the backend to
`legacy` and restart workers. There is no silent fallback from an explicitly
selected Rust backend.

## Verification and benchmarking

The committed benchmark runner measures `legacy`, `python-copper`, and `rust`
in interleaved cold scene builds, records
wall and CPU time, peak RSS, input/intermediate/final bytes, feature/net/layer
counts, mesh size, and stage timings, then compares final semantic manifests:

```bash
backend/venv/bin/python kicad-prism-viewer/scripts/pcb_backend_benchmark.py \
  fixtures/release-studio/cynthion/cynthion.kicad_pro \
  --helper kicad-prism-viewer/native/prism-kicad-native/target/release/prism-kicad-native \
  --output /tmp/prism-pcb-benchmark
```

The default qualification shape is one warm-up followed by five measured
trials per backend, with backend order rotated between rounds. The first
JTYU-OBC report is
`docs/plans/kicad-monkey-analytic-semantic-pipeline-benchmark.md`.

The Rust contract emits warnings for unsupported primitives instead of dropping
them silently. A non-zero `unsupported_features` count, any error diagnostic,
or a contract/revision/digest mismatch blocks the Rust path.

Known intentional difference: NPTH mechanical pads do not flash copper on the
Rust path even when old source files serialize `*.Cu`; they remain explicit
non-plated drills. The legacy plotter path can retain a zero-area copper record
for such a pad. Bounds for shared USB-PD semantic objects were within the 0.005
mm curve tolerance during implementation validation.
