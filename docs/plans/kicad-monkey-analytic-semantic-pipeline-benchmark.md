# JTYU-OBC three-backend PCB benchmark

Date: 2026-09-21

This report records the first JTYU-OBC benchmark of all three Prism PCB
geometry backends after making semantic copper compilation independent of the
KiCad board/component GLB export. It is an implementation checkpoint for the
[native analytic pipeline plan](kicad-monkey-analytic-semantic-pipeline.md),
not acceptance of the complete native packed-mesh pipeline.

## Result

The Rust backend reaches a 25.96 second median semantic-ready time on the
five-trial macOS run. The Python copper backend reaches 26.93 seconds and the
legacy backend reaches 32.79 seconds. Relative to legacy, Rust is 20.84% faster
and Python copper is 17.87% faster.

Parallelizing semantic copper work with KiCad export removed 7.50 seconds from
the Rust median, 8.27 seconds from Python copper, and 9.27 seconds from legacy
when compared with the immediately preceding serialized baseline on the same
machine and project revision.

| Backend | Serialized baseline | Parallel result | Scheduling reduction | Improvement vs current legacy |
| --- | ---: | ---: | ---: | ---: |
| `legacy` | 42.06 s | 32.79 s | 9.27 s (22.05%) | reference |
| `python-copper` | 35.20 s | 26.93 s | 8.27 s (23.50%) | 17.87% |
| `rust` | 33.46 s | 25.96 s | 7.50 s (22.41%) | 20.84% |

The critical path is now the approximately 25 second KiCad board/component
GLB export. Rust copper generation and the existing semantic tile build overlap
that export instead of beginning after it.

## Revisions and inputs

| Input | Identity |
| --- | --- |
| Prism base | `origin/dev` at `6e0a0ae5` |
| Prism feature branch | `feat/kicad-monkey-rust-pcb` |
| Prism implementation revision | `f9056b7a2d4fb8f1e21e6c92acbbd0e98533d8b8` |
| JTYU-OBC source revision | `3eb17ac3e09d09ae6dbbc4133c9d331beeeca6c2` |
| `OBC.kicad_pcb` SHA-256 | `49ec6bfab364f73e428d34980b6cbfe29880e82004bc527ec63448d359ab83b6` |
| Rust helper identity | `prism-kicad-native 0.1.0 kicad-monkey bc6796c1b8ce55bfbcb8b1771f3ecbc70658d34d` |
| Rust helper binary SHA-256 | `b399fd08e0bdce124f90b7e8a9b5896f46ae8e9e3d8bee6787524b8be131d78e` |
| Python Monkey revision | `5abce7e672a97a77bc7b28cbd02c3e14934706bb` |
| KiCad CLI | `10.0.6` |
| Host | macOS 27.0, arm64 |
| Python | 3.12.13 |

The JTYU-OBC input was a clean archive of the stated source revision, not the
dirty working tree in the source checkout.

## Method

The committed `pcb_backend_benchmark.py` runner performed one warm-up followed
by five measured cold trials for each backend. Backends were interleaved and
their order rotated each round. Each measured run used a fresh compiler cache,
a fresh semantic scene cache, and a forced artifact rebuild.

Equivalent invocation:

```bash
backend/venv/bin/python kicad-prism-viewer/scripts/pcb_backend_benchmark.py \
  data/projects/type1/JTYU-OBC/OBC.kicad_pro \
  --helper kicad-prism-viewer/native/prism-kicad-native/target/release/prism-kicad-native \
  --project-revision 3eb17ac3e09d09ae6dbbc4133c9d331beeeca6c2 \
  --output /tmp/prism-jtyu-three-path-parallel \
  --warmups 1 \
  --trials 5
```

The raw report was written to
`/tmp/prism-jtyu-three-path-parallel/pcb-backend-benchmark.json` with SHA-256
`bb7167623e485cbfb666ab75cdece3e02fcdb6df006bb0ee1bd34c2cff6663e3`.
The serialized comparison report was written to
`/tmp/prism-jtyu-three-path-baseline/pcb-backend-benchmark.json` with SHA-256
`498c4268b89fd3d9d728bd1961836dff9397d03cb4eae557abac32d6e3accf81`.

## Measured trials

Wall time in seconds:

| Trial | `legacy` | `python-copper` | `rust` |
| ---: | ---: | ---: | ---: |
| 1 | 32.79 | 27.44 | 25.28 |
| 2 | 33.66 | 26.93 | 25.48 |
| 3 | 36.32 | 28.74 | 27.33 |
| 4 | 30.87 | 25.71 | 25.96 |
| 5 | 30.84 | 24.74 | 27.03 |
| **Median** | **32.79** | **26.93** | **25.96** |

Median stage and resource measurements:

| Measurement | `legacy` | `python-copper` | `rust` |
| --- | ---: | ---: | ---: |
| Board compilation | 15.07 s | 8.76 s | 3.19 s |
| Backend copper emission | n/a | 8.69 s | 3.15 s |
| Semantic tile build | 13.14 s | 8.46 s | 7.25 s |
| KiCad GLB export | 26.65 s | 25.35 s | 24.91 s |
| Process CPU time | 90.08 s | 77.24 s | 73.89 s |
| Peak RSS | 1.95 GiB | 2.00 GiB | 1.75 GiB |
| Intermediate bytes | 114.58 MB | 62.94 MB | 47.22 MB |
| Final asset bytes | 61.02 MB | 56.92 MB | 54.35 MB |
| Mesh bytes | 11.22 MB | 7.07 MB | 5.16 MB |
| Source polygons | 49,748 | 43,271 | 32,824 |
| Triangles | 2,790,820 | 1,688,582 | 1,219,082 |

All three manifests contain 20,919 semantic features, 969 nets, and 29 layers.

## Scheduling implementation validated

The project compiler now starts three independent lanes without waiting for the
KiCad export result:

1. KiCad board and component GLB export.
2. PCB geometry emission and semantic tile compilation.
3. Design/topology compilation.

Semantic tiles use a canonical board coordinate frame derived from the stackup
instead of opening `base_board.glb`. When component export completes, component
node/mesh bindings are patched into the scene manifest atomically without
rebuilding copper tiles. The compiler emits a `semantic-copper-ready` milestone
before joining the exported assets.

On JTYU-OBC, the old GLB-derived and new stackup-derived coordinate ranges are
equal within floating-point noise. Sample tile GLBs are byte-identical, layer Z
values match, and the component-patched manifest contains 981 components, 855
of them bound to exported nodes.

## Correctness status

The benchmark is valid for performance comparison, but the branch has not yet
passed the plan's 0.005 mm parity acceptance gate.

- Identity parity is exact for both candidates: 20,919 shared identities and no
  missing or extra identities. Net names, layer names, and barrel identities
  match legacy.
- Python copper reports a maximum sampled bounds delta of 0.02409 mm, dominated
  by routed arcs. This appears to be a sampling/oracle difference and still
  requires a mesh-level or visual adjudication.
- Rust reports two custom pads on JP3 with bounds deltas of 0.50000 mm and
  0.49534 mm (`048b1187-04d0-43cb-a990-dd13df82131b` and
  `188beb77-482e-4b6d-8fde-52f32011b7f4`). Rust includes the full custom
  primitive union while the legacy manifest bounds appear to describe only the
  final half-rectangle primitive. This must be resolved against rendered mesh
  coverage before acceptance. The next-largest Rust differences are vias at
  0.004995 mm, inside the configured tolerance.

The JTYU run also exposed and fixed an adapter error where BoardPlot mask/paste
layers were copied into copper flash overrides. The corrected adapter filters
plot-layer overrides to copper layers; JTYU then emits 32,824 features and
1,986 drills with zero unsupported features.

## Remaining native-pipeline work

This checkpoint meets the full semantic-ready timing target, but it does not
yet meet the architectural acceptance gates for the final analytic pipeline:

- `rust` still feeds the v1 global polygon contract into Python and Node.
- The measured 47.22 MB intermediate exceeds the 15 MB metadata target.
- Python still hydrates the geometry object graph and serializes the semantic
  compiler input.
- Node still performs terminal clipping/triangulation/GLB packaging rather than
  consuming native packed tile buffers.
- The new v2 analytic producer, tile classifier, and Geometer packet codecs are
  scaffolding; they are not yet the runtime `rust` backend.
- Cynthion, USB, and Linux worker-image performance runs remain outstanding.

The result changes the optimization priority. Parallel scheduling has already
put JTYU below 30 seconds, and KiCad component GLB export now defines its wall
clock. The next native milestone should therefore be judged primarily on
memory/intermediate elimination, deterministic analytic preservation, and
semantic correctness—not on an expectation of another large JTYU wall-time
drop unless component export is also optimized or independently cached.
