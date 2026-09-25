# kicad_monkey Rust PCB integration report

Date: 2026-09-21
Branch: `feat/kicad-monkey-rust-pcb`
Baseline: `origin/dev` at `6e0a0ae52f196bede8660ea426d60cf65d69442c`

## Outcome

The experimental Rust PCB geometry path is implemented behind
`PRISM_PCB_GEOMETRY_BACKEND=rust`. The production default remains `legacy`, and
an explicitly selected Rust backend fails closed instead of silently falling
back.

The Linux worker builds a small Prism-owned Rust helper directly against the
portable public `kicad-monkey-core` crate. The helper parsed real two-, six-,
and ten-layer boards, preserved semantic identity, and fed the existing Prism
scene compiler. A three-run Linux/amd64 Cynthion benchmark reduced median total
wall time by 23.6%, CPU time by 26.3%, peak RSS by 13.2%, and the geometry
intermediate by 40.9%. A three-run macOS JTY OBC benchmark reduced median total
wall time by 35.6% and CPU time by 24.1%.

This is ready for broader opt-in testing. It is not ready to replace the
default until interaction tests are exercised in a browser on a wider board
corpus and upstream publishes the planned analytic materializer.

## Repository isolation

The feature worktree was created from the fetched `origin/dev` SHA above. The
pre-existing primary checkout was on `feature/multi-net-highlight` with the
untracked user file `.claude/launch.json`; it was not reset, cleaned, or
modified. This branch has not been merged or pushed.

Before this change Prism used Python `kicad-monkey==2026.9.7` and the full
`KiCadPcb`/Plotter-IR path for scene copper. That Python dependency remains for
the rest of Prism's design, netlist, and Release Studio features.

## Upstream state

| Item | Result |
| --- | --- |
| Fetched upstream | `wavenumber-eng/kicad_monkey` `main` |
| Tested/pinned SHA | `bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d` |
| Upstream engine version | `2026.9.7` |
| Rust toolchain | `1.95.0` |
| Public analytic PCB materializer | No |
| Public API used | `PcbView::parse_selected`, typed PCB source records, board/layer/stackup facts, resolved nets, `resolve_pad_copper_layer`, and narrowly scoped board-plot flash facts |
| API status | Public source-model API; Prism materialization adapter is explicitly temporary |
| Official Windows native provider | Promoted packaged application/provider path |
| Linux direct Rust library | Supported as an external source-built consumer; built and tested here |
| Linux packaged native provider | Not promoted as Prism's production boundary |

The upstream refresh on 2026-09-21 found no commit after the pinned SHA and no
new merged PR. Issue #20 received a maintainer update: Linux/macOS are expected
to work, the first Rust Toon command is close, and the materializer is being
structured first in Altium Monkey before being copied here. No public frozen
analytic PCB materialization contract exists on `main` yet.

New issue #92 proposes Geometer clipping and physical-overhang composition for
Rust Toon. It concerns the 3D/Toon path rather than Prism's copper source-model
contract and therefore does not justify changing the pin.

## Architecture implemented

```text
.kicad_pcb
    |
    v
kicad-monkey-core public Rust source model
    |  selective PCB indexing and KiCad semantics
    v
prism-kicad-native
    |  disposable Prism materializer
    |  prism.pcb_geometry.v1 JSON
    v
existing Python orchestration and SemanticGltfBuilder
    |  Clipper2, tiling, triangulation, Meshopt
    v
semantic manifest + GLB tiles + WebGPU viewer
```

Prism directly links `kicad-monkey-core` into a Prism-owned command-line
sidecar. It does not consume the Windows-oriented packaged provider or the
development-only non-Windows Cruncher switch. The helper contains no KiCad or
S-expression parser.

The upstream dependency is isolated inside
`kicad-prism-viewer/native/prism-kicad-native`. `Cargo.toml` pins the exact Git
SHA, `Cargo.lock` freezes transitive dependencies, and `rust-toolchain.toml`
pins Rust. The frozen DTO schema is
`prism.pcb_geometry.v1.schema.json`.

The Docker build uses a Rust builder stage and `cargo build --release --locked`.
Only the 3.76 MB release binary enters the runtime image; Cargo caches, source,
compiler, and toolchain do not. The built runtime image reports
`amd64/linux` and `x86_64`.

## Ownership split

| Operation | Owner after this change |
| --- | --- |
| PCB source scan and selected structural index | Rust / `kicad-monkey-core` |
| KiCad 9 ordinal and KiCad 10 name net resolution | Rust / `kicad-monkey-core` |
| Track and routing-arc extraction | Rust |
| Via extraction, drill/barrel span | Rust |
| Pad extraction and per-layer padstack resolution | Rust |
| Zone filled polygons and islands | Rust |
| Hole/slot extraction and plating metadata | Rust |
| Footprint transforms and component/pad identity | Rust |
| Conditional effective copper flash facts | Upstream Rust board-plot facts, used only when required |
| Primitive-to-Prism geometry lowering | Temporary Prism Rust adapter |
| Design/schematic netlist topology | Existing Python path |
| DTO validation and scene orchestration | Python |
| KiCad board/component GLB export | `kicad-cli` |
| Clipping, tiling, triangulation, Meshopt | Existing Prism native/JS scene compiler |
| Component/STEP rendering | Existing path; unchanged |

The Rust backend avoids Python `KiCadPcb` hydration and Plotter IR for PCB
geometry. The surrounding compiler still loads the existing Python design
object for schematic/netlist topology; therefore the precise claim is “no
Python PCB parser or Plotter IR in the Rust geometry lane,” not “no Python in
the whole compilation.”

## Contract and semantics

The DTO uses integer nanometres, dense layer/net tables, open rings, explicit
outer/hole roles, source SHA-256, the pinned upstream revision, structured
diagnostics, and stage metrics. Every drawable and drill carries:

- a stable semantic object ID and KiCad source UID;
- net and layer indexes;
- physical layer span where applicable;
- footprint UID/reference and pad number where applicable.

These fields enter the existing object-feature manifest. Geometry batching
therefore retains the same feature-ID indirection used by click selection,
single-net highlighting, simultaneous multi-net highlighting, component
visibility, and layer visibility.

Explicit Rust selection rejects a missing helper, non-zero helper exit, timeout,
source digest mismatch, schema mismatch, revision mismatch, invalid dense
indexes, malformed geometry, and error diagnostics. Unsupported primitives
increment `unsupported_features` and block ingestion rather than disappearing
silently. The semantic bundle build fingerprint also hashes the selected helper
binary, so changing Rust materialization code cannot reuse a stale scene cache.

## Correctness evidence

| Area | Evidence | Result |
| --- | --- | --- |
| Layers and stackup | USB-PD, six-layer Cynthion, ten-layer JTY | Names/order and copper-layer sets retained |
| Nets | Final semantic manifests | Net names match for all compared boards |
| Tracks/arcs | Contract counts and final identities | USB-PD 222/0; Cynthion 3,484/138; JTY 18,789/2,356 |
| Vias | Contract counts, barrels, layer spans | USB-PD 21; Cynthion 651; JTY 2,908; JTY barrel identities match legacy |
| Pads | Contract counts, component/pad keys, per-layer shapes | USB-PD 139; Cynthion 1,472; JTY 7,382 |
| Zones | Filled geometry by net/layer/source | USB-PD 13; Cynthion 276; JTY 1,173 |
| Holes | Explicit plated/NPTH drill records | USB-PD 41; Cynthion 765; JTY 3,483 |
| Source identity | Final object-feature tables | No blank Rust source IDs on Cynthion or JTY |
| Component identity | Feature records retain footprint UID/reference/pad | Preserved through existing manifest path |
| Click/single/multi-net behavior | Existing viewer/semantic tests against unchanged feature/net indirection | 54 viewer tests and 60 backend semantic tests pass |
| Layer visibility | Existing layer table and feature layer IDs | Preserved; exact layer-name parity on compared boards |

USB-PD has 380 shared final drawable identities with no Rust-only entries. Its
two legacy-only records are zero-area copper flashes for one NPTH mechanical
oval; Rust correctly emits only the NPTH drill. Shared bounds differ by at most
0.004754 mm, below the 0.005 mm curve tolerance.

JTY has 31,590 shared final identities, no Rust-only identities, matching nets,
layers, and barrels. Its 20 legacy-only entries are two NPTH mechanical slots
incorrectly flashed by legacy on all ten copper layers. Four custom pads differ
by up to 0.5 mm because legacy drops half of their authored circle/polygon
primitive union; the Rust 1.0 x 1.5 mm bounds match the KiCad source. Other
shared differences are approximately the 0.005 mm curve tolerance.

Cynthion's legacy manifest has blank source UIDs and collapses multiple older
tstamp objects into 1,777 feature-table entries, so exact per-source identity
parity cannot be computed against it. Rust retains 5,732 deterministic feature
identities for 10,108 source polygons. Net and layer names match. This is an
improvement in source identity, but it is recorded as “not comparable,” not as
an exact parity pass.

No unsupported geometry diagnostics were emitted on USB-PD, Cynthion, or JTY.

## Performance

Method: three interleaved trials per backend, a cold semantic scene cache per
trial, identical KiCad export-cache policy, and medians reported. Wall time
includes the whole `from-project --scope 3d` pipeline rather than only the
helper. The Linux run used the production `linux/amd64` image under Docker
Desktop's x86_64 emulation on an ARM64 Mac, so absolute times are not native
server numbers; relative results use the same image and conditions.

### Linux/amd64 Cynthion, six copper layers, 6.26 MB source

| Backend | Rust/source stage | Board compilation | Semantic mesh | Total wall | CPU | Peak RSS | Intermediate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Legacy | n/a | 9,157 ms | 10,903 ms | 22,448 ms | 58,502 ms | 906 MB | 21.96 MB |
| Rust | 405 ms internal / 1,927 ms subprocess lane | 2,022 ms | 7,409 ms | 17,150 ms | 43,106 ms | 786 MB | 12.97 MB |

Rust change: **23.6% lower wall time**, **26.3% lower CPU**, **13.2% lower
peak RSS**, and **40.9% lower intermediate bytes**. Final asset size increased
1.3%, consistent with Rust retaining source identities that legacy collapses;
mesh bytes decreased 35.6%.

Rust internal median breakdown: source read 11.5 ms, parse/index 38.2 ms,
extraction 283.2 ms, JSON serialization 37.9 ms, total 404.7 ms. The gap to the
1,927 ms end-to-end helper lane is process startup, transport/decode, and host
emulation overhead.

### macOS host JTY OBC, ten copper layers, 43.78 MB source

| Backend | Board compilation | Semantic mesh | Total wall | CPU | Peak RSS | Intermediate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Legacy | 30,031 ms | 25,355 ms | 64,066 ms | 137,334 ms | 2.470 GB | 166.85 MB |
| Rust | 4,179 ms | 17,169 ms | 41,269 ms | 104,244 ms | 2.495 GB | 94.95 MB |

Rust change: **35.6% lower wall time**, **24.1% lower CPU**, and **43.1% lower
intermediate bytes**. Peak RSS was 1.0% higher, effectively flat at this scale.
The Rust helper's internal median was 979 ms, including 150 ms parse/index,
731 ms extraction, and 64 ms serialization.

The smaller USB-PD board improved total wall time by 2.9%; the fixed KiCad GLB
export floor dominates that workload even though board compilation itself fell
from 363 ms to 62 ms.

## Linux validation

- Clean multi-stage backend build succeeded with Rust 1.95.0 and
  `cargo build --release --locked`.
- `kicad-monkey-core` compiled from the exact Git SHA for Linux x86_64.
- The image helper reported the exact pin and ran as `x86_64`.
- The helper parsed real Cynthion PCB source inside the production image and
  emitted 10,108 features, 765 drills, 375 nets, 25 declared layers, and zero
  unsupported features.
- A complete Rust-backed USB-PD build ran inside the image through KiCad GLB
  export, native Clipper2, eight semantic tiles, and the final artifact
  inventory.
- The Rust geometry lane used no Python PCB parser and no Plotter IR. Existing
  Python design/netlist topology remains outside that lane.
- A three-iteration legacy/Rust Cynthion benchmark completed inside the same
  Linux/amd64 image.
- ARM64 Linux was not tested.

The absence of an official packaged Linux `kicad-monkey-native` release did not
block this use case. Directly compiling the portable core in Prism's controlled
worker image is sufficient.

## Verification gates

- Rust 1.95.0 `cargo fmt --check`: pass
- Rust `cargo clippy --locked --all-targets -- -D warnings`: pass
- Rust unit tests: 6 pass
- Python topology-compiler tests: 47 pass
- Backend semantic-index regression tests in Linux image: 60 pass
- Viewer tests on Node 22.23.2: 54 pass
- Semantic-GLTF tests on Node 22.23.2: 8 pass
- Viewer production build on Node 22.23.2: pass
- Docker Compose default and local-monkey configurations: pass
- Production backend image build: pass
- Python syntax and `git diff --check`: pass

## Known gaps

1. The default remains `legacy`; Rust is an explicit experiment.
2. The Prism materializer is temporary because upstream's public analytic
   materializer has not landed.
3. Conditional remove-unused/keep-end-layer copper flashing uses upstream board
   plot facts as a flash-presence oracle. It does not make Plotter IR the Prism
   DTO boundary, and use is reported in diagnostics.
4. Python still supplies schematic/netlist topology and pipeline orchestration.
5. JSON is the V1 transport. Serialization is measured but not yet large enough
   to justify a binary or streaming contract.
6. Component STEP/model rendering and KiCad GLB export are unchanged.
7. Browser interaction was covered by existing semantic/viewer tests, not a
   manual end-to-end click session in this pass.
8. The benchmark covers cold semantic builds; a separate warm-cache study was
   not run.
9. Linux ARM64 and native, non-emulated Linux x86_64 performance remain to be
   measured.
10. Cynthion cannot provide exact legacy source-identity parity because its
    legacy manifest loses/collapses old tstamp identities.

## Recommendation

Keep the backend opt-in and begin broader Prism testing on native Linux x86_64,
especially interactive selection, multi-net highlighting, layer toggling,
remove-unused-layer boards, backside footprints, microvias, and additional
custom-pad/zone corpora. The measured speedups, lower intermediates, strict
identity preservation, clean Linux source build, and small 3.76 MB runtime
addition justify continuing the experiment.

Do not make Rust the default until the browser interaction matrix and a broader
native-Linux corpus pass. When upstream publishes a stable analytic
materializer, replace `materialize.rs` behind the frozen Prism contract rather
than changing downstream scene/compiler code.
