# Design-variant oracle fixtures (VAR-01)

Shared evidence for every design-variant resolver in Prism and ecad-viewer. The rules the expectations encode are frozen in the contract packet (`audit-reports/design-variants-2026-09-17/CONTRACT_PACKET_v1.md`, version 1.0); nothing here is derived from a Prism or ecad-viewer implementation.

## Layout

| Path | What |
| --- | --- |
| `<fixture>/` | Redistributable KiCad sources, written by hand in the exact KiCad 10.0.6 grammar (schematic `version 20260306`, board `version 20260206`). UUIDs are uuid5 of stable labels so the files are byte-reproducible. |
| `expected/<fixture>.json` | Effective default state, per-variant differential state, physical classification and diagnostics computed by hand from the packet (sections 2 and 4). Schema `prism.variant_fixture_expectations_a0`. |
| `evidence/<fixture>/` | Native outputs of `kicad-cli` 10.0.6 for the same files: XML netlists (`<variants>` block), BOM CSVs, position files with and without `--exclude-dnp`, IPC-2581 exports and the node names of `pcb export glb --no-dnp`. Refusals (KiCad 11 tokens, malformed input) are recorded as commands with a non-zero exit code. |
| `manifest.json` | KiCad executable/version string, SHA-256 of every fixture, expected and evidence file, every command line with cwd, exit code and stderr excerpt. |

3D models referenced by the boards are KiCad's own bundled STEP models (`${KICAD10_3DMODEL_DIR}`); they are not copied here. The GLB evidence lists node names only.

## Fixture matrix (packet section 5)

| ID | Directory | Packet cases |
| --- | --- | --- |
| F0 | `no_variants/` | empty catalog |
| F1 | `oracle/` | E1–E9, E11–E14: explicit true/false vs omitted, no-op record, empty field, escaped quotes, sheet/nested/repeated-sheet inheritance, path-specific record, multi-unit agreement and conflict, alternate footprints, footprint-only name, non-ASCII name, registry-only and header-only names, schematic-only symbol, board-only footprint |
| F2 | `legacy_in_bom/` | E10 — `(version 20260101)` inverted `in_bom` |
| F3 | `pcb_only/` | board + header + footprint records, no schematic or project |
| F4 | `sch_only/` | schematic + project, no board |
| F5 | `kicad11_tokens/` | E18 — `symbol_override`, `pin_map_override`, footprint `exclude_from_sim` (native refusal recorded) |
| F6 | `rule_area/` | E19 — rule-area DNP, documented divergence (D2) |
| F7 | `malformed/` | unbalanced variant record; `variants` not an array in the project file |
| F8 | `oracle_rev2/` | F1 at a later revision: `Pro` renamed to `Pro2`, `Lite` dropped from the registry and board header while its records remain |
| F9 | `case_fold/` | E15 — exact schematic names vs case-insensitive board names |

## How to read `expected/*.json`

- `catalog` — ordered as the packet's 2.1 rule (project, then pcb-only, then schematic-only, then footprint-only names; first-seen order).
- `default` — maps are differential against the neutral (all-false) state: an occurrence/component/footprint appears only when at least one flag is `true`.
- `variants[]` — maps are differential against the effective default; explicit booleans; `fields` lists only fields whose effective text differs (`""` is a value).
- `components` are keyed by **reference**. The semantic index keys them by `componentUid`; tests translate through `indexes.componentByReference`. `occurrences` are keyed by `<sheetInstancePath>/<symbolUuid>`, `footprints` by footprint UUID; `identity` lists the reference behind every key and the representative occurrence for multi-unit references.
- `physical` — packet 2.6 classification per reference (`visible | hidden | ambiguous | absent`).
- `evidence` — which values native exports confirm and which are source-derived (no 10.0.6 export observes them).

## What native evidence proves, and what it cannot

- Schematic effective flags and field overrides per variant: `evidence/<fixture>/netlist_default.xml` (`<comp><variants><variant name=…>`), which KiCad emits for **every** variant name, differential against the symbol's own base; for multi-unit references it reports the representative unit (smallest UUID on the first sheet that holds the reference, packet N13). Per-variant BOM CSVs show the same through `${DNP}` / `${EXCLUDE_FROM_BOM}` columns including sheet inheritance (10.0.5+).
- Footprint DNP per variant: a reference present in `pos_<v>.csv` but absent from `pos_<v>_populated.csv`. Exclude-from-position-files: absent from both. Effective `Value`: the `Val` column. Exclude-from-BOM and populate: `ipc2581_<v>.xml`. 3D model presence: `glb_nodes_<v>.json`.
- Not observable natively: per-variant exclude-from-board for symbols, the non-representative unit of a conflicting multi-unit symbol, and Prism's physical classification. These are labelled `source-derived` in the expectations.
- Unknown names (`Nope`, `lite` on the schematic side) produce **default** output natively without any error; the packet turns that into the `missing` state.

## Regenerating

The sources are static files; edit them by hand and re-run `kicad-cli` with the commands recorded in `manifest.json`, then update the hashes. `tests/test_design_variant_fixtures.py` fails when a file no longer matches its manifest hash or when an expectation contradicts the committed native evidence.
