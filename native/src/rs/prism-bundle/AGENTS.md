# prism-bundle — the `.prism` design bundle (WP-B)

The archive of `native/contracts/prism/bundle-format.md`, manifest `prism.bundle.manifest.a2`. Moved from prism-sim-studio's `prism-bundle` (a1); the mapping is `A1-TO-A2.md`.

- **Reader part** (always built; feature `reader`, no parser dependency): `src/zip.rs` (canonical zip subset), `src/manifest.rs` (generated contract types, member paths and roles), `src/schema.rs` (JSON Schema validation against `schema/`, a byte copy of the committed Prism schemas), `src/reader.rs` and `src/verify.rs` (reader validation, invariants I1–I12), `src/extract.rs`, `src/generator.rs` (generator bytes, bundle key), `src/revision_key.rs` (the pure revision-key layer), `src/temp.rs` (the process-exit temp registry), `src/limits.rs`, `src/paths.rs`, `src/finding.rs`.
- **Feature `build`**: `src/stages/` — `parse.rs`, `board.rs`, `models.rs` (the GLB and, with `--geometer`, the assembly HLR member), chained through `chain.rs`; `sources.rs` selects the source set; `design.rs`, `materialize.rs`, `stackup.rs` and `crosscheck.rs` are a1's, moved.
- **Tests**: `tests/zip.rs` (the canonical subset, its streaming digest check and the copied-entry rewrite), `tests/revision_key_vectors.rs` (every vector of `native/contracts/prism/revision-key-vectors.json`), `tests/hostile.rs` (cli-spec.md §11 item 5), `tests/crosscheck.rs` (a1's cases, on `tests/fixtures/demo/`).
- After a change to the Prism schemas, copy them into `schema/`; a test fails until they match.
