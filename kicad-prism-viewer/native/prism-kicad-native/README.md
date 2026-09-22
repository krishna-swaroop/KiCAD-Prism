# prism-kicad-native

Prism-owned Linux-friendly PCB geometry helper. It links the public
`kicad-monkey-core` source model at the exact revision in `Cargo.toml`. The
compatibility invocation still emits `prism.pcb_geometry.v1`; `emit-analytic`
emits the new `prism.pcb_analytic_geometry.v2` producer contract without
polygonizing standard KiCad copper primitives. Errors and diagnostics go to
stderr; non-zero exit status is fatal to an explicitly selected Rust backend.

The helper owns no KiCad parser. Source scanning, typed family decoding, net
resolution, padstack resolution, and board/footprint semantics come from
`kicad-monkey-core`. Prism owns only geometry realization and the adapter DTO.

```bash
cargo test --locked
cargo build --release --locked
target/release/prism-kicad-native board.kicad_pcb > geometry-v1.json
target/release/prism-kicad-native emit-analytic board.kicad_pcb > analytics-v2.json
target/release/prism-kicad-native compile-semantic \
  --pcb board.kicad_pcb --output semantic-pack --tile-size auto
```

The retained compatibility schema is
[`schema/prism.pcb_geometry.v1.schema.json`](schema/prism.pcb_geometry.v1.schema.json).
The new producer schema is
[`schema/prism.pcb_analytic_geometry.v2.schema.json`](schema/prism.pcb_analytic_geometry.v2.schema.json).
It keeps tracks, routing arcs, vias, standard pads, transforms, polarity,
bounds, and drill/barrel facts analytic. Filled zones and irreducible custom-pad
regions are the only ordinary polygon carriers.
`compile-semantic` keeps that contract in memory, performs tile-aware terminal
lowering and writes `prism.semantic_mesh_pack.v1` metadata plus packed vertex,
index and feature-ID buffers. It does not emit a global polygon document.
The Docker build compiles the helper in a Rust builder stage and copies only the
release binary into the Python worker image.
