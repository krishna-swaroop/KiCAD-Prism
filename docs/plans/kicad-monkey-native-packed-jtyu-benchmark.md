# JTYU-OBC native analytic packed-pipeline benchmark

Date: 2026-09-21

This is the first three-backend benchmark after switching Prism's `rust`
backend off `prism.pcb_geometry.v1` and onto the native analytic mesh-pack
runtime. It supersedes the Rust measurements in the earlier
`kicad-monkey-analytic-semantic-pipeline-benchmark.md` checkpoint.

## Result

On the final benchmark run, Rust reached semantic copper readiness in **7.32 s**
median from process start and full artifact readiness in **29.35 s** median.
The full result is still governed by the independent KiCad GLB lane, which took
28.69 s median. The native semantic path therefore meets the 8.5 s semantic
compiler-plus-packaging gate and the 30 s full-readiness gate even on this
thermally slower run.

| Measurement | `legacy` | `python-copper` | native `rust` |
| --- | ---: | ---: | ---: |
| Full artifact wall time | 39.09 s | 32.60 s | **29.35 s** |
| Semantic copper ready from process start | 38.28 s | 26.38 s | **7.32 s** |
| Board/backend compilation | 18.30 s | 10.11 s | **5.28 s** |
| Terminal tile/GLB packaging | 14.73 s | 9.18 s | **1.27 s** |
| KiCad GLB lane | 31.60 s | 31.92 s | 28.69 s |
| Peak RSS | 2.02 GiB | 1.76 GiB | **1.46 GiB** |
| Global polygon JSON / packed metadata | 114.58 MB | 62.94 MB | **7.13 MB** |
| Packed native tile buffers | n/a | n/a | 39.96 MB |
| Final semantic mesh bytes | 11.22 MB | 7.07 MB | **5.25 MB** |
| Triangles | 2,790,820 | 1,688,582 | **1,219,082** |

Rust is 24.91% faster than legacy for full readiness in this run. A preceding
run before the time-zero scheduling change measured 30.59 s legacy, 24.46 s
Python-copper, and 23.16 s Rust. Its Rust native compiler and packer medians
were 3.04 s and 1.02 s. The large absolute-time shift between runs affected all
backends; the final run above is retained as the authoritative result.

## What changed

`PRISM_PCB_GEOMETRY_BACKEND=rust` now executes:

```text
kicad_monkey typed PCB facts
  -> Prism analytic v2 operations in Rust
  -> analytic tile classification
  -> terminal tessellation and Earcut triangulation in Rust
  -> prism.semantic_mesh_pack.v1 binary tiles
  -> thin Node GLB + Meshopt packaging
  -> existing WebGPU renderer
```

The Rust route no longer constructs v1 polygon dataclasses, hydrates geometry
JSON in Python, writes `semantic-gltf-input.json`, invokes Python native-preclip,
or runs Node clipping/Earcut. Node reports `earcut_ms=0` and `js_clip_ms=0` in
packed mode. The native lane starts alongside `KiCadDesign` hydration and KiCad
export, and does not open `base_board.glb`.

JTYU produces 20,919 semantic features, 969 nets, 29 layers, 1,974 barrels,
12 tile GLBs, 1,266,304 vertices, and 1,219,082 triangles. The mesh counts are
identical to the preceding Rust polygon path after native drill records are
applied as terminal pad/via holes.

## Method and identities

The benchmark runner performed one warm-up followed by five measured cold
trials per backend. Backend order rotated each round. Every trial used a fresh
compiler cache, a fresh semantic-scene cache, and a forced artifact rebuild.

| Input | Identity |
| --- | --- |
| Branch | `feat/kicad-monkey-rust-pcb` |
| Native packed implementation | `39d0a8ff` |
| JTYU-OBC revision | `3eb17ac3e09d09ae6dbbc4133c9d331beeeca6c2` |
| `OBC.kicad_pcb` SHA-256 | `49ec6bfab364f73e428d34980b6cbfe29880e82004bc527ec63448d359ab83b6` |
| Native helper | `prism-kicad-native 0.1.0`, Monkey `bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d` |
| Benchmark helper SHA-256 | `64c9e88e2c5deeb115494ac09fc1d6b153483debf4aafe27ca95a7be9a17770a` |
| Post-benchmark verified helper SHA-256 | `7a9fe2ba6448773ae75bbaeb44311e278ce5a875d31817db41f9e85d2dc0ac84` |
| Python-copper oracle | Monkey `5abce7e672a97a77bc7b28cbd02c3e14934706bb` |
| KiCad CLI | 10.0.6 |
| Host | macOS 27.0 arm64, Python 3.12.13 |

Raw final benchmark report:
`/private/tmp/prism-jtyu-native-packed-three-path-final/pcb-backend-benchmark.json`
(SHA-256 `e453793c5a020f6889cb7e9c8439834bc525b35d63944e304359bcceeaa3686a`).

Measured full wall times:

| Trial | `legacy` | `python-copper` | native `rust` | Rust semantic ready |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 43.62 s | 40.96 s | 27.43 s | 7.32 s |
| 2 | 39.04 s | 32.60 s | 27.15 s | 6.31 s |
| 3 | 33.13 s | 27.11 s | 29.35 s | 6.82 s |
| 4 | 39.09 s | 36.39 s | 29.40 s | 7.58 s |
| 5 | 40.62 s | 25.05 s | 33.62 s | 7.59 s |
| **Median** | **39.09 s** | **32.60 s** | **29.35 s** | **7.32 s** |

## Correctness status

- All three paths expose 20,919 semantic source identities with no missing or
  extra identities. Native net names, layers, barrel bindings, component/pad
  metadata, and feature IDs remain stable semantically; numeric net IDs are
  document-local and intentionally need not share table order with legacy.
- Native tracks, arcs, standard pads, vias, zones, drill holes, layer surfaces,
  picking IDs, and mesh counts pass the current checks. The largest ordinary
  native bounds delta is 0.004995 mm, inside the 0.005 mm tolerance.
- Two JP3 custom pads differ from the current Plotter-IR and Python-copper
  bounds by 0.5 mm. Inspection shows both oracles currently drop the filled
  `gr_circle` primitives and keep only `gr_poly`; the native analytic producer
  preserves both circles and the polygon from the `.kicad_pcb`. This is a
  documented oracle deficiency, not a reason to truncate the native result.
  It still needs an explicit custom-pad rendered-coverage fixture before the
  overall correctness gate can be called complete.
- Python-copper itself remains outside the 0.005 mm gate for sampled routed
  arcs (0.02409 mm maximum), as recorded by the same runner.

## Remaining work

- Route multi-tile, subtractive, and custom-pad Boolean jobs through Geometer's
  terminal boolean/triangulation ABI. JTYU classifies all 28,800 operations to
  the direct single-tile path, so it does not exercise this boundary.
- Union overlapping custom-pad add primitives before triangulation and add
  subtract-polarity coverage. The current JTYU output preserves their complete
  coverage but can contain coplanar overlap between additive primitives.
- Add independent copper/base-board/component/topology cache identities.
- Run Cynthion, USB, Linux-worker, renderer interaction, and custom-pad visual
  acceptance suites. Legacy and Python-copper remain unchanged and available.
