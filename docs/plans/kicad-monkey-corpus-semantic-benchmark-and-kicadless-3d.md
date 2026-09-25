# kicad_monkey corpus semantic benchmark and KiCad-less 3D study

Date: 2026-09-22
Branch: `feat/kicad-monkey-rust-pcb`
kicad_monkey revision: `bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d`

## Outcome

All 19 PCB-backed projects in the packaged kicad_monkey test corpus completed
three measured semantic-copper builds on all three Prism backends with no
runtime failures. The corpus also contains schematic-only sibling projects;
those are outside a PCB/copper benchmark because they have no same-stem
`.kicad_pcb`.

Summing each board's three-run median, semantic-copper-ready time was **130.02 s
legacy**, **68.81 s Python-copper**, and **23.86 s native Rust**. Native Rust
therefore reduced aggregate readiness time by **81.7% versus legacy** and
**65.3% versus Python-copper**. It won all 19 per-board comparisons. The median
per-board speedup was **3.20x versus legacy** and **2.33x versus
Python-copper**; aggregate speedups were 5.45x and 2.88x respectively.

| PCB-backed project | Legacy | Python-copper | Native Rust | Rust vs legacy | Rust vs Python |
| --- | ---: | ---: | ---: | ---: | ---: |
| EDA-04903-V1-0 | 56.618 s | 29.894 s | **12.427 s** | 4.56x | 2.41x |
| JumperlessV5r7 | 16.621 s | 8.768 s | **1.889 s** | 8.80x | 4.64x |
| 11-10084 speedy processing module B | 16.190 s | 6.450 s | **1.670 s** | 9.70x | 3.86x |
| 4-ch-backplane | 13.914 s | 7.047 s | **1.295 s** | 10.74x | 5.44x |
| cm0 | 6.861 s | 3.451 s | **0.954 s** | 7.19x | 3.62x |
| EEZ DIB DCP405plus | 4.421 s | 2.643 s | **0.786 s** | 5.62x | 3.36x |
| CM5_MINIMA_2 | 2.934 s | 1.889 s | **0.666 s** | 4.41x | 2.84x |
| icepi-zero | 2.746 s | 1.695 s | **0.551 s** | 4.98x | 3.08x |
| nRF9151_Feather | 2.187 s | 1.492 s | **0.545 s** | 4.01x | 2.74x |
| 11-10043 charge indicator C | 1.449 s | 1.068 s | **0.458 s** | 3.17x | 2.33x |
| CANBOB | 1.321 s | 0.945 s | **0.413 s** | 3.20x | 2.29x |
| 11-10045 taillight C | 1.110 s | 0.825 s | **0.407 s** | 2.73x | 2.03x |
| 11-10080 yoshi mainboard A | 1.029 s | 0.745 s | **0.411 s** | 2.51x | 1.81x |
| EEZ DIB DCP405plus front mask | 0.627 s | 0.529 s | **0.336 s** | 1.86x | 1.57x |
| celebration LED daisy chain A | 0.585 s | 0.252 s | **0.188 s** | 3.11x | 1.34x |
| led_component | 0.403 s | 0.365 s | **0.288 s** | 1.40x | 1.27x |
| 12-10005 charge-indicator assembly | 0.372 s | 0.255 s | **0.202 s** | 1.84x | 1.26x |
| 12-10004 taillight assembly | 0.357 s | 0.245 s | **0.186 s** | 1.92x | 1.32x |
| kibuzzard | 0.279 s | 0.249 s | **0.184 s** | 1.52x | 1.35x |

The two assembly/celebration stubs contain valid project files but effectively
empty PCB documents. The native producer now emits an empty semantic scene
with a synthetic copper pair instead of rejecting them.

## Method

The runner used three measured trials and no discarded warm-up. Backend order
rotated each round. Every trial received a fresh compiler directory and a fresh
semantic scene cache. Timing begins inside the `semantic-copper` command and
stops at the `semantic-copper-ready` milestone; it deliberately excludes
`kicad-cli` board/component GLB export and schematic/netlist hydration.

Raw report:
`/private/tmp/prism-kicad-monkey-corpus-semantic-final2-20260922/pcb-backend-benchmark.json`
(SHA-256 `b8974f4f5979fedfb4461e7381d499ee29eb0bcd90a9899d90e2cee2ce3d36fe`).

The measured helper was `prism-kicad-native 0.1.0` pinned to the revision above
and statically linked to the macOS arm64 Geometer SDK dated 2026-09-19. Its
SHA-256 was `20e60938fa4fb1cb77e612243cb89d7b81e9d4e57a5878d80b36218669c504b6`.

## Corpus findings and correctness caveats

- The upstream zone reader genuinely rejects analytic `arc` children in valid
  zone polygons. `cern_wren_eda_04903` contains such an `F.SilkS` keepout. A
  standalone reproducer against `kicad-monkey-core 2026.9.7` fails before any
  Prism code runs; the upstream issue draft is in
  `docs/reviews/kicad-monkey-zone-arc-parser-issue-draft.md`.
- Prism needs only copper zones. The native materializer now blanks unrelated
  non-copper zones while preserving byte offsets, then parses copper zones from
  the filtered view. The flash-presence oracle receives an even narrower view
  without zones or presentation graphics because its authority is only
  conditional pad/via layer flashing.
- The strict legacy parity flag passes only two boards. This does not mean 17
  native builds failed. Most strict failures are a 0.00511-0.00532 mm sampled
  curve-bound delta just over the runner's 0.005 mm cutoff, legacy-only NPTH
  copper flashes, or non-copper zones that the semantic copper path now omits.
  Net-name and barrel identities match on the non-empty boards. Jumperless has
  a larger known custom-pad/oracle bounds difference and still needs the
  rendered custom-pad coverage gate already recorded in the JTY benchmark.
- The empty-board stubs expose different synthetic layer labels (`Board` in
  legacy versus `F.Cu`/`B.Cu` in the packed contract) but both produce zero
  semantic tiles and zero features.

## Can kicad-cli GLB export be removed?

### Board body: yes, as the first replacement slice

Monkey already supplies board metadata, stackup and source geometry; Geometer
supplies Clipper2 Boolean operations, planar construction, tessellation and
GLB-capable geometry entrypoints. Prism can construct the substrate from
`Edge.Cuts`, subtract cutouts and drills, extrude by board thickness, and place
mask/silk/copper at stackup-derived heights. This should produce a Prism-owned
board-body asset without round-tripping through KiCad.

The current native analytic contract does not yet carry the complete
`Edge.Cuts`/board-graphic slice, so removing `base_board.glb` requires that
contract extension plus visual comparison against KiCad on castellations,
internal cutouts, plated edges and malformed/open outlines. Geometer remains a
generic geometry kernel; Prism must continue to own PCB policy and material
roles.

### Components: yes for an explicit subset, not yet universally

Monkey exposes component model references and KiCad transforms. Geometer can
tessellate STEP and preserve colored STEP materials, so Prism can cache one mesh
per model-content digest and instance it with each footprint/model transform.
The WebGPU viewer already loads component primitives separately from board and
copper geometry, so it does not require a monolithic `components.glb`.

The blocker is model resolution, not tessellation. Native Cruncher Toon
currently accepts embedded STEP/STP only. It deliberately omits project-relative
paths, `${KIPRJMOD}`, absolute paths, KiCad 3D-model environment variables, and
non-STEP embedded models. Until the source-preserving embedding workflow or an
equivalent shared resolver lands, KiCad CLI remains the compatibility fallback
for external libraries and VRML/material cases.

Recommended rollout:

1. Emit a native board-body asset and keep KiCad component export.
2. Add a component capability manifest (`embedded-step`, `resolved-step`,
   `external-unresolved`, `unsupported-format`) and use native Geometer meshes
   only for complete projects.
3. Cache model geometry by content digest and instance transforms separately.
4. Retain per-project KiCad fallback until corpus and production telemetry show
   no unresolved/unsupported component models.
5. Remove the KiCad lane only after board-body visual parity and component
   coverage gates pass on Linux, macOS and Windows.

## Toon styling reuse in the interactive 3D tab

The reusable parts are the presentation contract, not the final SVG:

- substrate/mask/silk palette and opacity policy;
- board-domain/cutout semantics and model transform handling;
- component content/pose caching;
- outline/detail width presets for static orthographic exports.

Cruncher Toon composes a 2D SVG from physical board layers and Geometer HLR.
That SVG cannot be dropped into Prism's freely orbiting WebGPU scene. Prism's
current shader is continuous PBR-like diffuse/specular shading with selection,
visibility and net-emphasis logic. A 3D Toon option should preserve those data
paths while adding quantized diffuse bands, controlled highlights, and a
screen-space or back-face outline pass. Geometer HLR remains useful for an
export/snapshot mode, not for every interactive camera frame.

## Native optimization priorities

1. **Parallelize terminal tessellation by deterministic tile/layer work unit.**
   On EDA-04903 the native median spent 6.39 s of 11.01 s in triangulation and
   1.31 s in Geometer clipping for 2.32 million triangles. A Rayon-style
   parallel prepare/triangulate phase followed by source-order merge targets
   the dominant cost without changing the contract.
2. **Upstream a narrow pad/via flash-layer resolver.** The current public
   authority is reached through `board_plot_document`, requiring a second board
   scan. Prism now strips presentation-only forms first, but a public
   `BoardLayerFlashResolver`-class API would remove that workaround and reduce
   the 3.06 s parse/materialize median on EDA-04903.
3. **Cache native packs independently.** Key the analytic/materialized pack and
   terminal tile buffers by PCB digest, Monkey/helper identity, tolerance and
   tile policy. Board-body and component model caches should have separate
   identities so copper edits do not invalidate unchanged STEP geometry.
4. **Keep the Node packer thin unless measurement justifies removal.** Packed
   mode already reports zero JS clipping and zero Earcut time; Node currently
   authors GLB and runs Meshopt. Moving that final step into Rust is lower value
   than parallel triangulation and the flash-resolver API.
5. **Package the Geometer SDK in the production builder.** This benchmark proves
   the static Clipper2 boundary locally for multi-tile operations. The normal
   worker image still needs a pinned SDK acquisition/build stage before the
   Rust backend can be promoted beyond opt-in use.

## Decision

Promote the native analytic path to broader opt-in testing, but keep `legacy`
as the default. Start the KiCad-export retirement with the board body, then add
capability-gated native STEP components. Do not remove the KiCad fallback until
external model resolution, VRML/material coverage, production SDK packaging,
custom-pad visual acceptance and cross-platform corpus gates are complete.

## Upstream references

- [Geometer public entrypoints](https://github.com/wavenumber-eng/geometer/blob/daf8eaf2a56622bf3394989566abcc6e1bf69017/docs/contracts/public-entrypoints.md)
- [Geometer analytic planar Boolean status](https://github.com/wavenumber-eng/geometer/blob/daf8eaf2a56622bf3394989566abcc6e1bf69017/docs/design/analytic-planar-boolean-a0.md)
- [kicad_cruncher Toon and model-resolution contract](https://github.com/wavenumber-eng/kicad_monkey/blob/bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d/packages/kicad_cruncher/README.md)
- [Planned source-preserving model embedding](https://github.com/wavenumber-eng/kicad_monkey/issues/90)
