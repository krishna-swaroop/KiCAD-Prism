# Native Analytic PCB-to-WebGPU Pipeline

This feature branch replaces the eager polygon boundary used by the experimental
Rust PCB backend with a native analytic pipeline. `kicad-monkey-core` remains
authoritative for KiCad parsing and physical semantics. Prism preserves analytic
operations until tile-aware terminal lowering, then emits packed semantic meshes
for the existing WebGPU renderer.

The implementation keeps the `legacy` and `python-copper` backends intact. The
`rust` backend is fail-closed and runs independently from KiCad GLB export and
design-topology compilation. Its cache identity is based on the PCB source,
Monkey revision, analytic contract, compiler settings, and mesh packing level.

Acceptance requires semantic and selection parity, no global polygon JSON or
Python geometry graph in Rust mode, native compilation starting before
`board-ready`, Linux-container verification, and alternating cold benchmarks on
JTYU-OBC, Cynthion, and USB. JTYU-OBC targets are an 8.5 second maximum median
semantic compile/pack stage and a 30 second maximum median semantic-ready time.

The temporary Prism producer consumes the public typed PCB source model. When
the upstream public analytic materializer lands, only that producer is replaced;
the native terminal compiler and WebGPU asset contract remain unchanged.

## Geometer ownership decision (2026-09-21)

Geometer does not replace the Prism semantic compiler. At upstream revision
`daf8eaf2a56622bf3394989566abcc6e1bf69017`, its supported packed Clipper2
Boolean/offset and planar-triangulation operations are the terminal geometry
kernel for this work. Prism must not implement competing Boolean or
triangulation algorithms.

Geometer deliberately excludes PCB/domain policy, application object IDs, and
renderer packaging from its indexed-mesh contract. Its analytic line/arc
Boolean operation is also explicitly experimental and is not the dependable
whole-board copper-union path. Prism therefore continues to own:

- the `kicad_monkey` analytic producer boundary;
- layer/net/component/pad/source identities and drill/barrel policy;
- analytic bounds, tiling, and deciding which operations require a Boolean;
- copper layer Z placement and terminal tolerance;
- feature-ID buffers, cache identities, GLB/Meshopt packaging, and manifests.

Geometer owns terminal polygon offset, clipping, Boolean resolution, and
triangulation through packed native interfaces. Upgrade the runtime/client pin
from `2026.9.7` to the qualified `2026.9.19` generation before wiring that
stage. Do not route geometry through Geometer's Python object API.

The released static SDK is the intended native boundary. Its Linux x64 archive
is `geometer-sdk-2026.9.19-linux-x64.zip` with SHA-256
`ff2ef8615c5868de346b5e695bdea207fa5e379bb63e3f95148896ccdd0d8faa`;
the Linux ARM64 archive SHA-256 is
`c0f92e5f11c254940d2e1bcce44af777db21bf6c46bd17a724aa3df5413684d1`.
The release provenance binds those assets to Geometer source revision
`6d659f1811123fdbe665b3cfe1fc00cfaec32084`.

One upstream API gap remains: the SDK exports the focused packed C functions,
but the reviewed `geometer-sys` Rust crate does not wrap them and the generic
operation catalog does not advertise the Clipper2/triangulation families. The
branch now contains strict safe packet codecs. Native dispatch must either use
a narrowly isolated FFI adapter for those existing functions or wait for
Geometer to expose them through `geometer-sys`; it must not copy their C++
algorithms into Prism.

## Landed first slice

`prism-kicad-native emit-analytic` now emits
`prism.pcb_analytic_geometry.v2` through `TemporaryPrismProducer`. The existing
no-subcommand v1 output remains temporarily available so the current opt-in
Rust backend keeps working while the packed compiler is connected. The v2
producer preserves track capsules, true routing arcs, via flashes, standard pad
shapes, affine transforms, zones/custom regions, semantic identity, and
separate drill records.

The first release-mode Cynthion probe emitted 9,703 operations (including 138
true circular sweeps) and 765 drill records with zero unsupported features. The
producer reported approximately 130 ms total wall time and emitted 7.94 MB of
JSON. This is producer-only evidence, not the semantic compiler/GLB benchmark;
the packed tile buffers and Geometer calls are still to be integrated before
the performance acceptance gate can be evaluated.
