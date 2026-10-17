# Divergences: semantic-index

- Member: `projections/semantic-index.json`, schema `prism.semantic_index.a2` (root `SemanticIndexA2`)
- Producer: P1 (`native/src/rs/prism-projections/src/semantic_index.rs`)
- Field map: [`native/contracts/prism/field-maps/semantic-index.md`](../../contracts/prism/field-maps/semantic-index.md) ("Expected divergences" holds the full text; maintainer decisions in [`decisions.md`](../../contracts/prism/decisions.md), "Semantic index")
- Golden: `capture/semantic_index.py` (dev's builder with the a1 additions patched in memory, then the a0 → a1 envelope), on the prepared, KiCad-upgraded sources.

One runner entry, D1's a2 envelope, applies to every case: the goldens hold the a1 envelope until they are recaptured. Every other item below is either already in the golden transform, removed by the comparison, or absent from the fixtures.

## D1. Envelope

- Today: `schema: prism.semantic_index_a0`, plus `commit`, `generator` and `generatedAt`.
- Bundle: `schema: prism.semantic_index.a2`, with no `commit`, `generator` or `generatedAt` (decisions, Semantic index 1), and `designKey` in place of a1's `sourceRevisionKey` (bundle-format.md §2.3).
- Why: a member is keyed by revision key, not by commit. The generator is recorded in `bundle.json`. A wall-clock time would break determinism.
- Consumer: C1 (`frontend/src/types/prism-selection.ts` literal type, ETag); K (job details).
- Fixtures: all 32 goldens.
- Runner: rule `semantic-index/envelope-a2` (`divergences.py`), cases `["*"]`. The golden transform writes the a1 envelope, so the rule sets the golden's `schema` to a2 until the goldens are recaptured; `sourceRevisionKey` and `designKey` are non-semantic in `members.py`.

## D2. Revision key

- Today: 32 hex over the semantic sources.
- Bundle: the 64-hex design revision key (ADR §5).
- Consumer: C1 comment anchors (decisions, Semantic index 2).
- Fixtures: all. The golden stores a stand-in, `sha256("prism.revision_key.a1\0stand-in\0" + today's key)`. Today's key is recorded in `capture.json` notes.
- Runner: ignored. `/sourceRevisionKey` is non-semantic in `members.py`.

## D3. Key order (maps in code point order, structs in declared order)

- Consumer: C1 inspector `fields` order.
- Fixtures: all, in bytes only.
- Runner: nothing to do. The comparison treats objects as key sets.

## D4. KiCad ≤ 7 boards (`tstamp`, `fp_text reference`)

- Superseded by the source upgrade (decisions, Occurrences 1 and Semantic index 8). The golden is built on the upgraded copy, so today's kicad_monkey reads `(uuid …)` and `(property "Reference" …)` from the same bytes the bundle parses.
- Measured against W0, whose output was built on the un-upgraded sources:
  - `rs-cynthion`: 348/348 footprint ids (was 0), 5723 `netByPcbUuid` entries (was 0), 1343/1343 terminals with `pcbPadUuid` (was 0/1342), 348 components with `pcbRefs` (was 0).
  - Board-net reconciliation now folds 52 schematic nets into 26 board nets, giving 427 nets (was 375).
  - `rs-synthetic`: 3/3 footprint ids, 10 `netByPcbUuid` entries.
- The field map's D4 row predicted something different: ids present but references still empty, so `components[].pcbRefs` and `pcbPadUuid` unchanged. That prediction no longer holds, because the upgrade also writes `Reference` properties.
- Runner: nothing to do.

## D5. Serialization (escapes, float text, trailing LF)

- Runner: nothing to do. Values are compared, not bytes.

## D6. Graphical-pin-only terminals (`pinName`/`pinType` absent, not `""`)

- The golden patch adds both fields only when `"pin_type" in raw_terminal` (decisions, Semantic index 7).
- Fixtures: no committed fixture has such a terminal.
- Runner: nothing to do.

## D7. Design Comparison input / D8. Release Studio digests

- These are consumer-side migrations (C2, C3). They do not affect the member's comparison.

## D9. Repository-relative paths

- Today: `sheetInstances[].page`, `parentPage`, `buses[].page`, `nets[].schematicRefs[].page` and diagnostic `path` are relative to the project directory.
- Bundle: each is a `RepoPath`, and `sheetInstanceUid` (which hashes `page`) is computed from that `RepoPath`.
- Golden: the patched module's `_relative_schematic_page` resolves against the repository root (`ctx.src`), so `page`, `parentPage`, the placements behind `schematicRefs` and `sheetInstanceUid` all derive from the `RepoPath`. Diagnostic `path` values go through `ctx.repo_path`.
- Fixtures: every committed fixture has `project_dir == ""`, so this is the identity (28 goldens equal W0's value for value; see the capture report).
- Checked on a copy of `design_variants/oracle` placed under `hw/`: 5 `page`, 4 `parentPage` and 5 `sheetInstanceUid` values change, and nothing else does.
- Runner: nothing to do.

## D10. Field scan over the reached schematics

- Today: every `.kicad_sch` under the project directory, later files overwriting earlier ones by symbol UUID.
- Bundle: the root schematic and the sheets it reaches.
- Why: an unreached copy of a sheet (backup, old revision) is not the design.
- Consumer: component fields in the semantic index and the BOM.
- Fixtures: no committed fixture has an unreached schematic copy (`board-objects.md` D11: 0 documents outside the closure on all 33), so every golden is unchanged. The 21 C2r bundle-gate trees build byte-identical archives with and without this change.
- Runner: nothing to do.
