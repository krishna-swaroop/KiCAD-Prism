# Field map: `projections/occurrences.json` (`prism.occurrences.a0`)

Root model `OccurrencesA0` in `tsp/prism/occurrences-a0.tsp`. Example `examples/OccurrencesA0.example.json`.
Written by: WP-P2, `native/src/rs/prism-projections/src/occurrences.rs`. Stage: parse.

The occurrences member is the assembly view of one revision in its default (no variant) state:

- every placed symbol at every sheet instance it occurs at, with its designator, its properties as written, its DNP / BOM / board / sim / position-file state after the sheet fold, and its canonical BOM fields;
- every board footprint with its designator and assembly attributes;
- the join between the two by reference designator (ADR §6, "footprints by refdes");
- every variant record and variant registry entry the files hold, unresolved.

It replaces four readers of the same facts:

- Design Comparison's component occurrences (`backend/app/services/design_compare_occurrences.py`, fed by the Node parser's `componentObjects`);
- the occurrence identity and DNP of System Builder's interface extractor (`backend/app/services/systems/interface_extractor.py:95-125`, `:386-444`);
- the catalog usage scanner (`backend/app/services/catalog/placement_stamp.py:75-102`);
- Release Studio's variant declarations (`backend/app/release_studio/projections.py:651-699`).

What it does not hold, and where that is:

| Fact | Member |
|---|---|
| Per-component (per-reference) view, `componentUid`, nets, terminals, pins | `prism.semantic_index.a2` |
| Resolved per-variant state (effective flags and fields under a variant) | `prism.semantic_index.a2` `assembly.variants` |
| A symbol's or footprint's own `dnp` / `in_bom` / `on_board` attributes, positions, library link, kiid paths of every object | `prism.board_objects.a0` |
| Footprint side, position, rotation, courtyard, pads, models | `prism.placements.a0` |
| Sheet names, human sheet paths, pages | `prism.semantic_index.a2` `sheetInstances`, `prism.project.a0` |

Citations follow `conventions.md`: a bare path is in this repository, `fork:` is kicad_monkey at `b6316117` (`src/rs/kicad-monkey-core/src/…`), `ref:` is the reference branch.

## Fields

Pointers are RFC 6901 with two extensions: `*` is every element of an array,
`{key}` is every key of a map. One row per leaf and per array/map.

Abbreviations in the table: `dco` = `backend/app/services/design_compare_occurrences.py`, `siv` = `backend/app/services/semantic_index_variants.py`, `sis` = `backend/app/services/semantic_index_service.py`, `ie` = `backend/app/services/systems/interface_extractor.py`, `ps` = `backend/app/services/catalog/placement_stamp.py`, `rsp` = `backend/app/release_studio/projections.py`, `ecad` = `backend/design-compare-parser/ecad-parse.mjs`.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers (path:line) | Parity note |
|---|---|---|---|---|---|---|
| `/schema` | const `"prism.occurrences.a0"` | — | required | new | `backend/app/services/design_bundle/` reader (K) | — |
| `/sheets` | `OccurrencesSheet[]` | — | required; hierarchy order: depth-first pre-order from the root, child sheets in `(sheet …)` file order; empty without a schematic | `siv:236-259` (`graph.instances` = kicad_monkey `schematic_instances()`); fork `schematic_bundle.rs:991-1073` (`realize_occurrences`, same pre-order) | `dco:166-170` (C2: sheet fold); P1 assembly fold cross-check | today's instance order on every fixture (verified: oracle, cynthion 20 sheets) |
| `/sheets/*/sheetPath` | `KiidPath` (schematic form) | — | required; unique | `siv:236-259` (`sheet_instance_path`); `sis:593-598`; fork `schematic_bundle.rs:95` (`occurrence_address`) | join key to `prism.semantic_index.a2` `/sheetInstances/*/sheetInstancePath` | equal to the index's set on every fixture |
| `/sheets/*/dnp` | boolean | — | required; root `false` | own flag: `dco:51-94` (`(dnp yes)` on the sheet form), `siv:176-213`; fold: `siv:216-234`, `:261-283`; fork `schematic_bundle.rs:1064` | `dco:166-167` (C2); `siv:216-234` (P1) | KiCad 10.0.6 netlist agrees (x-sheetflags) |
| `/sheets/*/excludeFromBom` | boolean | — | required; root `false` | `dco:91` (`in_bom no`), `siv:176-213`, `:216-234`; fork `schematic_bundle.rs:1062` | `dco:168-170` (C2); P1 | as above |
| `/sheets/*/excludeFromBoard` | boolean | — | required; root `false` | `siv:176-213` (`on_board`), `:216-234`; fork `schematic_bundle.rs:1063` | P1; C5 (board visibility) through the index | as above |
| `/sheets/*/excludeFromSim` | boolean | — | required; root `false` | `siv:176-213`, `:216-234`; fork `schematic_bundle.rs:1065-1066` | P1; C6 through the index | KiCad 10.0.6 BOM `${EXCLUDE_FROM_SIM}` agrees |
| `/sheets/*/variants` | `OccurrencesVariantRecord[]` | — | required; file order; empty for the root | `siv:163-174` (`_select_sheet_variant`, record on the instance whose path is the parent's); kicad_monkey `VariantCatalog.from_overrides` (sheet names) | `rsp:689-699` (schematic declaration names); P1 | fork does not parse these records (see divergences) |
| `/sheets/*/variants/*/name` | string, min 1 | — | required | sheet record `(name …)` | `rsp:689-699` (names) | exact |
| `/sheets/*/variants/*/dnp` | boolean | — | optional; absent = not overridden | sheet record `(dnp …)`; `siv:176-213` | P1 | — |
| `/sheets/*/variants/*/excludeFromBom` | boolean | — | optional | sheet record `(in_bom …)` read by the version of the file holding the sheet symbol (`siv:198-203`) | P1 | — |
| `/sheets/*/variants/*/excludeFromBoard` | boolean | — | optional | sheet record `(on_board …)` | P1 | — |
| `/sheets/*/variants/*/excludeFromSim` | boolean | — | optional | sheet record `(exclude_from_sim …)` | P1 | — |
| `/sheets/*/variants/*/excludeFromPosFiles` | boolean | — | never present on sheets (packet N6) | — | — | — |
| `/sheets/*/variants/*/fields` | `Record<string>` | — | required, empty unless the record has `(field …)` overrides; code point order | sheet record `(field …)` | P1 | KiCad 10 writes none on sheets |
| `/sheets/*/variants/*/fields/{key}` | string | — | as written | as above | as above | — |
| `/symbols` | `OccurrencesSymbol[]` | — | required; hierarchy order (sheets in `/sheets` order, then `(symbol …)` file order) | `siv:309-352` (`_occurrence_states`: instances × symbols); `ie:95-125`; Design Comparison today enumerates instance records instead (`ecad:893-912`, `dco:146-194`) | C2, C3, C4/P5, C7 (see reading rules) | includes `#` and `?` references and power symbols; each consumer filters as today |
| `/symbols/*/kiidPath` | `KiidPath` (schematic form) | — | required; unique | `siv:329` (`f"{sheet_path}/{symbol.uuid}"`); `ie:122`; `ecad:899-902` | `ie:396`, `:437` (portKey, memberKeys; P5/C4); semantic index `assembly` keys (P1) | identical strings today (all fixtures) |
| `/symbols/*/sheetPath` | `KiidPath` (schematic form) | — | required | `dco:160-165`; `siv:318` | `dco:182` (`schematicRefs[].sheetInstancePath`, C2); join to `/sheets` | — |
| `/symbols/*/symbolUuid` | `KiCadUuid` | — | required | `ecad` symbol `uuid`; `dco:184`; `ps:91-95` | `backend/app/services/design_compare_semantics.py:47-50` (C2 visual targets); `backend/app/services/project_component_asset_extractor.py:350-356` (C7); `ps:95` (C7) | — |
| `/symbols/*/documentPath` | `RepoPath` | — | required | `ecad:1689` (`documentPath`), `dco:183` (`page`); `ps:94` (`schematic`) | `backend/app/services/design_compare_semantics.py:53-61` (C2 `page`); `backend/app/services/project_catalog_usage_service.py:48-52` (C7) | repository-relative (conventions §8); today relative to the snapshot root, which `design_compare_service.py:77-88` flattens to the project directory: equal for a project at the repository root |
| `/symbols/*/libId` | `LibId` | — | required | `ecad` `libId: symbol.lib_id`; `ie:398`; `ps:84-96` | `dco:35-41` (power filter, C2); `backend/app/services/design_compare_nodes.py:246`; `ie:439` (P5); `ps:48-54`, `:70-72`, `backend/app/services/catalog/project_placements.py:116-118` (C7) | — |
| `/symbols/*/reference` | `Refdes` | — | optional; absent = no instance record and empty `Reference` property | `ecad:893-912` (instance `reference`); `siv:285-307` (`resolve_symbol(…, sheet_path)`); `ie:109-121` | `dco:157-159`, `:175-176`, `:219` (C2); `ie:391-444` (P5); `ps:88-90` (C7); `rsp:499-507` | never `""`; today's empty reference is the same as absent (every consumer skips it) |
| `/symbols/*/instanceMatched` | boolean | — | required | `siv:138-143` (`_has_symbol_instance`), `:330-340` (`occurrence-instance-missing`); `ie:109-121` (no record → skipped) | P5 (only matched occurrences are ports, `ie:118-120`); P1 diagnostic | `true` on every committed fixture |
| `/symbols/*/unit` | int32 ≥ 1 | — | required | `ie:121` (record unit, else form unit, else 1); `ecad` `reviewFields.Unit` | `ie:392`, `:396` (unit order picks the port key, P5) | — |
| `/symbols/*/dnp` | boolean | — | required | `siv:145-161` (`_symbol_flags`), `:216-234` (fold); `dco:167`; fork `schematic_effective.rs:101`, `:122` | `dco:117`, `:214` via `DNP` column (C2); `ie:444` via the component rule (P5); P1 `default.occurrences` | equals today's assembly default on all fixtures and KiCad 10.0.6 on x-sheetflags |
| `/symbols/*/excludeFromBom` | boolean | — | required | `siv:145-161`, `:216-234`; `dco:168-170`; fork `schematic_effective.rs:105-107`, `:124` | `dco:118`, `:214` (`In BOM` column and BOM row filter, C2); P1 | as above |
| `/symbols/*/excludeFromBoard` | boolean | — | required | `siv:145-161` (`on_board`), `:216-234`; fork `schematic_effective.rs:108-110`, `:125` | P1; C5/C6 through the index | KiCad 10.0.6 netlist `exclude_from_board` agrees |
| `/symbols/*/excludeFromSim` | boolean | — | required | `siv:145-161`, `:216-234`; fork `schematic_effective.rs:102-104`, `:123` | P1; C6 through the index | KiCad 10.0.6 BOM agrees |
| `/symbols/*/excludeFromPosFiles` | boolean | — | required; never folded from sheets | `siv:145-161` (`not in_pos_files`); fork `schematic_effective.rs:111-113` | P1 | KiCad 7 files have no token: `false` |
| `/symbols/*/properties` | `Record<string>` | — | required; keys = property names in code point order; last duplicate wins | `ecad:914-928`, `dco:150-154`; `ps:87` (`kicad_library_reader.symbol_properties`, `backend/app/services/kicad_library_reader.py:208-215`); fork `schematic_effective.rs:75-79` (BTreeMap) | `dco:111-126` (BOM extras), `:177-178` (C2); `ps:57-67` (stamp), `backend/app/services/catalog/project_placements.py:98-125` (C7); `ie:400`, `:443` (mpn, P5) | equal to the catalog scanner's map on every fixture |
| `/symbols/*/properties/{key}` | string | — | text as written, unescaped; may be `""` | as above | as above | — |
| `/symbols/*/bomFields` | `OccurrencesBomFields` | — | required | `sis:467-513` (`_canonical_fields`) called as `dco:111-126` | `dco:197-226` → `backend/app/services/bom_diff_service.py:63-160` (C2); frontend `design-comparison/bom-panel.tsx:139` | label ↔ field table below |
| `/symbols/*/bomFields/value` | string | — | optional; absent = no non-empty value | `sis:494` | C2 BOM `Value` | — |
| `/symbols/*/bomFields/description` | string | — | optional | `sis:497` (`pick("Description")`; `dco` passes no library description) | C2 BOM `Description` | the semantic index falls back to the library description; see "Relation" |
| `/symbols/*/bomFields/datasheet` | string | — | optional | `sis:498` | C2 | — |
| `/symbols/*/bomFields/manufacturer` | string | — | optional | `sis:499` | C2; frontend `bom-panel.tsx:139` | — |
| `/symbols/*/bomFields/manufacturerPartNumber` | string | — | optional | `sis:500` | C2; `bom-panel.tsx:139` | — |
| `/symbols/*/bomFields/vendor` | string | — | optional | `sis:501` | C2 | — |
| `/symbols/*/bomFields/vendorPartNumber` | string | — | optional | `sis:502` | C2 | — |
| `/symbols/*/bomFields/footprint` | string | — | optional | `sis:503` | C2; `bom-panel.tsx:139` | — |
| `/symbols/*/bomFields/mass` | string | — (text as written) | optional | `sis:504` | C2 | — |
| `/symbols/*/bomFields/rqjc` | string | — (text) | optional | `sis:505` | C2 | — |
| `/symbols/*/bomFields/rqjcTop` | string | — (text) | optional | `sis:506` | C2 | — |
| `/symbols/*/bomFields/tempMax` | string | — (text) | optional | `sis:507` | C2 | — |
| `/symbols/*/bomFields/tempMin` | string | — (text) | optional | `sis:508` | C2 | — |
| `/symbols/*/bomFields/powerDissipation` | string | — (text) | optional | `sis:509` | C2 | — |
| `/symbols/*/bomFields/rate` | string | — | optional | `sis:510` | C2 | — |
| `/symbols/*/variants` | `OccurrencesVariantRecord[]` | — | required; file order; empty when `instanceMatched` is false | kicad_monkey `collect_symbol_overrides` (via `rsp:689-699`); `siv:125-136` (`_select_symbol_variant`); fork `schematic_source/symbol_instances.rs:9-35` | `rsp:499-507`, `:689-699` (C3 schematic declarations); P1 | — |
| `/symbols/*/variants/*/name` | string, min 1 | — | required | record `(name …)` | `rsp:501` | exact, case preserved |
| `/symbols/*/variants/*/dnp` | boolean | — | optional; absent = not overridden | record `(dnp …)`; `siv:145-161` | `rsp:503-506` (C3 assignments) | — |
| `/symbols/*/variants/*/excludeFromBom` | boolean | — | optional | record `(in_bom …)` read by file version (`siv:55`, `:111-113`, `:145-153`) | P1 | `legacy_in_bom` fixture: R10 `in_bom yes` → `true` (expected/legacy_in_bom.json agrees) |
| `/symbols/*/variants/*/excludeFromBoard` | boolean | — | optional | record `(on_board …)` | P1 | — |
| `/symbols/*/variants/*/excludeFromSim` | boolean | — | optional | record `(exclude_from_sim …)` | P1 | — |
| `/symbols/*/variants/*/excludeFromPosFiles` | boolean | — | optional | record `(in_pos_files …)` | P1 | — |
| `/symbols/*/variants/*/fields` | `Record<string>` | — | required (may be empty); keys in code point order; last duplicate wins | record `(field (name …) (value …))`; kicad_monkey `_override_from_sch_instance_variant` | P1 | `""` is an override value |
| `/symbols/*/variants/*/fields/{key}` | string | — | as written | as above | as above | — |
| `/footprints` | `OccurrencesFootprint[]` | — | required; board file order; empty without a board | `siv:470-498` (`pcb.footprints` order); `rsp:651-674`; `ecad:1384-1408` | `dco:140-144` (C2); `sis:1068-1078` (P1 `pcbRefs`); `rsp:651-674` (C3); `backend/app/services/project_component_asset_extractor.py:300-309` (C7) | — |
| `/footprints/*/uuid` | `KiCadUuid` | — | required; unique | `ecad:1350` (`uuid \|\| tstamp`); fork `pcb/decode.rs:191` (`uuid` or `tstamp`) | `dco:188` (`pcbRefs[].footprintUuid`, C2); `project_component_asset_extractor.py:306` (C7) | the semantic index (`siv:483`) reads `(uuid …)` only and writes `""` for KiCad 7 boards; see divergences |
| `/footprints/*/documentPath` | `RepoPath` | — | required | `ecad:1689` | `project_component_asset_extractor.py:300-309` (C7 source file); ObjectRef join to board-objects | repository-relative, as above |
| `/footprints/*/reference` | `Refdes` | — | optional; absent = empty | `rsp:639-648` (`Reference` property, else `fp_text reference`); `ecad` footprint `Reference` property | `dco:140-144` (C2 refdes join); `rsp:666-673` (C3); `sis:1070` (P1) | the semantic index reads the property only (`""` on KiCad 7 boards) |
| `/footprints/*/dnp` | boolean | — | required | `(attr … dnp)`: `siv:486`; `rsp:577` (`is_dnp`) | P1 `default.footprints`; placements (P3) holds the same token | — |
| `/footprints/*/excludeFromBom` | boolean | — | required | `(attr … exclude_from_bom)`: `siv:487`; `ecad:1403` | P1 | — |
| `/footprints/*/excludeFromPosFiles` | boolean | — | required | `(attr … exclude_from_pos_files)`: `siv:488`; `rsp:581` | P1; placements (P3) holds the same token | — |
| `/footprints/*/variants` | `OccurrencesVariantRecord[]` | — | required; file order | `rsp:651-674` (`footprint.variants`); `siv:460-468` | `rsp:665-673` (C3 board assignments, including explicit records equal to the base) | fork does not parse these records |
| `/footprints/*/variants/*/name` | string, min 1 | — | required; matched ignoring case by readers (`siv:460-468`) | record `(name …)` | `rsp:669` | — |
| `/footprints/*/variants/*/dnp` | boolean | — | optional | record `(dnp …)` | `rsp:670-673` (C3) | — |
| `/footprints/*/variants/*/excludeFromBom` | boolean | — | optional | record `(exclude_from_bom …)` | P1 | — |
| `/footprints/*/variants/*/excludeFromPosFiles` | boolean | — | optional | record `(exclude_from_pos_files …)` | P1 | — |
| `/footprints/*/variants/*/excludeFromBoard` | boolean | — | never present on footprints | — | — | — |
| `/footprints/*/variants/*/excludeFromSim` | boolean | — | never present in a0: footprint `exclude_from_sim` is a KiCad 11 token (`siv:58-61`) | — | — | a later version adds it |
| `/footprints/*/variants/*/fields` | `Record<string>` | — | required (may be empty); code point order | record `(field …)` | P1 | — |
| `/footprints/*/variants/*/fields/{key}` | string | — | as written | as above | as above | — |
| `/references` | `OccurrencesReference[]` | — | required; sorted by `reference`, code point order | `dco:140-144` (refdes → footprint); `sis:1068-1078` (refdes → footprints); `siv:809-811` (footprints by reference) | C2 `pcbRefs`; C7 `footprints_by_reference` (`project_component_asset_extractor.py:309`); P5 geometry by reference | — |
| `/references/*/reference` | `Refdes` | — | required; unique | as above | as above | — |
| `/references/*/symbols` | `KiidPath[]` | — | required; order of `/symbols` (hierarchy order) | `siv:391-393` (grouping by reference) | P5 `memberKeys` (`ie:437`); multi-unit grouping (P1, C2) | — |
| `/references/*/symbols/*` | `KiidPath` | — | — | as above | as above | — |
| `/references/*/footprints` | `KiCadUuid[]` | — | required; order of `/footprints` (board file order) | `sis:1068-1078` | C2 (`dco:140-144` keeps the last), P1 `pcbRefs` (keeps all) | — |
| `/references/*/footprints/*` | `KiCadUuid` | — | — | as above | as above | — |
| `/variantDeclarations` | `OccurrencesVariantDeclaration[]` | — | required; project registry in file order, then board header in file order | `rsp:677-686` (project), `rsp:651-664` (board header via kicad_monkey `VariantCatalog.from_pcb`); `backend/app/services/variant_catalog_service.py:177-211`, `:270-306` | `rsp:753-871` (C3 `declarations`, `ordering`, `divergence_reasons`) | — |
| `/variantDeclarations/*/source` | enum `project` \| `pcb` | — | required | `variant_catalog_service.py:45-46` (same spellings) | `rsp:28` (`board` ↔ `pcb`) | same values as `prism.semantic_index.a2` `SemanticIndexVariantSource` |
| `/variantDeclarations/*/name` | string, min 1 | — | required | `.kicad_pro` `$.schematic.variants[*].name`; board `(variant (name …))` | `rsp:465-479` | `< Default >` kept (`rsp` keeps it; `variant_catalog_service.py:202` drops it) |
| `/variantDeclarations/*/description` | string | — | optional; absent = none or empty | kicad_monkey `ProjectVariant.from_json_dict`, `BoardVariant.from_sexp` | `rsp:465-479` (`None` when absent) | project registry `""` becomes absent (today `""`) |

### Canonical BOM labels

`OccurrencesBomFields` is the fixed column set of `_canonical_fields` (`sis:493-511`) without `DNP` and `In BOM`, which are the effective flags. Readers render a BOM row with these labels:

| Field | Label | Names tried, in order |
|---|---|---|
| `value` | `Value` | the property named exactly `Value` if non-empty, then `Value` |
| — | `DNP` | `"Yes"` if `dnp`, else `"No"` |
| — | `In BOM` | `"No"` if `excludeFromBom`, else `"Yes"` |
| `description` | `Description` | `Description` |
| `datasheet` | `Datasheet` | `Datasheet`, `Data Sheet`, `Datasheet URL`, `Datasheet Link` |
| `manufacturer` | `Manufacturer` | `Manufacturer`, `MFR`, `Mfr` |
| `manufacturerPartNumber` | `Manufacturer Part Number` | `Manufacturer Part Number`, `MPN`, `Mfr Part`, `Mfr Part Number` |
| `vendor` | `Vendor` | `Vendor`, `Supplier` |
| `vendorPartNumber` | `Vendor Part Number` | `Vendor Part Number`, `VPN`, `Supplier Part Number`, `Supplier PN` |
| `footprint` | `Footprint` | the property named exactly `Footprint` if non-empty, then `Footprint` |
| `mass` | `Mass (g)` | `Mass (g)`, `Mass`, `Weight (g)` |
| `rqjc` | `RQjC (C/W)` | `RQjC (C/W)`, `RθJC (C/W)`, `RthJC` |
| `rqjcTop` | `RQjC_top (C/W)` | `RQjC_top (C/W)`, `RθJC_top (C/W)`, `RthJC Top` |
| `tempMax` | `Temp_max (C)` | `Temp_max (C)`, `Max Temperature`, `Tj Max` |
| `tempMin` | `Temp_min (C)` | `Temp_min (C)`, `Min Temperature`, `Tj Min` |
| `powerDissipation` | `Power Dissipation (W)` | `Power Dissipation (W)`, `Power Dissipation`, `Pd (W)` |
| `rate` | `Rate` | `Rate`, `Rating` |

- **Name matching** (`sis:472-487`): a property name is normalized with Unicode full case folding (Python `str.casefold`, Unicode `CaseFolding.txt` status C and F), then every character outside `a-z0-9` is deleted. A field is the first non-empty value among its names in order; when two properties normalize alike, the one later in file order is used. The Rust producer needs full case folding, not `to_lowercase`, for parity on names such as `ß` or `ﬁ`.
- **Extras:** every property whose name is not exactly one of the 17 labels above (case-sensitive), `Reference` included, is an extra BOM column with its raw value (`sis:512`). Readers compute extras from `properties`; they are not repeated in `bomFields`.

### Producer rules not visible in the schema

- **Which symbols.** Every `(symbol …)` form with a non-empty `lib_id`, outside `lib_symbols`, in every sheet instance reached from the root sheet through `(sheet …)` forms. Files no sheet reaches (orphans, autosaves, backups) contribute nothing.
- **Instance record.** The `(instances (project "<name>" (path "<p>" (reference …) (unit …) (variant …)…)))` record with `p == sheetPath`. When more than one matches, the one under the project named after the `.kicad_pro` stem wins, else the first in file order. No suffix matching and no first-instance fallback: the fork's `resolve_modern_instance` (fork `schematic_effective.rs:133-152`) has both and P2 must not use them for `instanceMatched`, `reference` or `unit`.
- **Absent tokens** take KiCad's defaults: `dnp` no, `in_bom` yes, `on_board` yes, `exclude_from_sim` no, `in_pos_files` yes. KiCad 7 files have no `dnp` or `in_pos_files` tokens on symbols.
- **The fold:** `dnp`, `excludeFromBom`, `excludeFromBoard` and `excludeFromSim` of a symbol are its own attribute OR'd with every sheet symbol on its path. This is KiCad's `SCH_SHEET_PATH` rule (`GetDNP`, `GetExcludedFromBOM`, `GetExcludedFromBoard`, `GetExcludedFromSim`), the fork's (`schematic_bundle.rs:1062-1066`, `schematic_effective.rs:122-125`) and `siv:216-234`. Position files are never folded (packet N6).
- **Skipped objects:** none is invented. A placed symbol whose `uuid` is not a canonical `KiCadUuid`, a footprint with neither a canonical `(uuid …)` nor `(tstamp …)`, and an occurrence whose unit is below 1 are left out and reported once each as a manifest warning (codes proposed to the manifest owner: `occurrences-symbol-without-uuid`, `occurrences-footprint-without-uuid`, `occurrences-unit-invalid`). None occurs in the committed fixtures.
- **Determinism:** arrays in the documented orders; maps in code point key order (`BTreeMap`); no provenance.

### Relation to `semantic-index` (`prism.semantic_index.a2`)

The two members split one domain by grain. The index is per **component** (one entry per reference, multi-unit merged) and owns the **resolved** variant state. Occurrences is per **occurrence** and per **footprint**, in the **default** state, with variant records **unresolved**. P1 and P2 both read the core model, not each other's member. Facts that appear in both:

| Fact | `semantic-index` a1 | `occurrences` a0 | Why both | Agreement |
|---|---|---|---|---|
| Default effective flags of one occurrence | `/assembly/default/occurrences/{kiidPath}` (sparse: true flags only, valid references only) | `/symbols/*` `dnp` … `excludeFromPosFiles` (every occurrence, every flag) | The index keeps today's sparse parity shape; BOM, System Builder and catalog need every occurrence without the index | Identical by construction (same fold). Verified equal on every fixture. G's parity runner should assert it. |
| Default flags of one component | `/assembly/default/components/{uid}` | derived: group `/symbols` by `reference`; equal values agree, otherwise the representative (first sheet in `/sheets` order, then smallest `symbolUuid`) | Per-component view belongs to the index | Recomputed equal on every fixture |
| Footprint attributes | `/assembly/default/footprints/{id}`, `/assembly/footprintInventory` | `/footprints/*` | Assembly view of the board | Equal on KiCad 9/10 boards; differ on KiCad 7 boards (index reads `(uuid …)` and the `Reference` property only). See divergences. |
| Footprints carrying a reference | `/components/*/pcbRefs` | `/references/*/footprints` | — | Same rule on KiCad 9/10 boards; KiCad 7 as above |
| Canonical BOM text | `/components/*/fields` (17 labels + extras, per reference) | `/symbols/*/bomFields` + flags + `properties` (per occurrence) | Design Comparison's BOM is per occurrence and must not inherit the index's netlist parameters | **Differ by definition:** the index's `Description` falls back to the library symbol's description (`sis:497`, netlist `libsource`); its extras include kicad_monkey's `kicad_*`/`_source_cad`/`Sheetfile`/`Sheetname` parameters; on KiCad 7 files it misses `Datasheet` (`sis:410` needs a quoted uuid). Occurrences follows the placed symbol, as KiCad's BOM and today's Design Comparison do. Equal on the other 14 labels for KiCad 9/10 single-occurrence references. |
| Symbol identity | `/components/*/schematicRefs/*/symbolUuid`, `occurrenceId` | `/symbols/*/symbolUuid`, `kiidPath` | Join keys | Same values |
| Sheet instances | `/sheetInstances/*/sheetInstancePath` | `/sheets/*/sheetPath` | Join key only; names, pages and parents stay in the index | Same set on every fixture |
| Variant names | `/assembly/catalog` (merged, one description, `sources`) | `/variantDeclarations` (per registry, as written) + record `name`s | Release Studio compares registries with each other (`rsp:713-750`), which the merged catalog cannot express | Catalog = union of these, by `variant_catalog_service.py:270-306` |

`componentUid` is not in occurrences. Design Comparison's `component_uid(reference)` (`dco:29-32`) and the index's (`sis:890`, reference + symbol UUID) are both computed by readers from `reference` / `symbolUuid`.

### Reading rules: recomputing each consumer's current output

Each recipe reads only this member. `today` is dev; the scratch script `recompute.py` implements every recipe and was run on every fixture (results in validations).

- **Design Comparison components** (C2, replaces `dco:129-194`). For each `/symbols/*` with a `reference` and a `libId` that does not start with `power:` (case-folded):
  - `componentUid = component_uid(reference)`;
  - `value` / `footprint` = `properties.Value` / `properties.Footprint` (or `""`);
  - `fields` = the 17 labels above + extras;
  - `schematicRefs = [{sheetInstancePath: sheetPath, page: documentPath, symbolUuid}]`;
  - `pcbRefs = [{footprintUuid}]` of the **last** uuid in `/references/{reference}/footprints` (today's dict keeps the last), or `[]`.
- **Design Comparison BOM rows** (`dco:197-226`): the components above with `In BOM` ≠ `No`, plus `Reference`/`Value`/`Footprint`, sorted by `Reference`. `diff_boms` keys rows by reference, so the last row of a multi-unit reference wins (`backend/app/services/bom_diff_service.py:74-84`).
- **System Builder identity** (P5/C4, `ie:95-125`, `:391-444`). Group `/symbols/*` with `instanceMatched`, a `reference` that does not start with `#`, by `reference`:
  - units sorted by `(unit, kiidPath)`; `portKey` = the first `kiidPath`; `memberKeys` = sorted `kiidPath`s;
  - `libId` = the first unit's;
  - `dnp` = the component rule from "Relation";
  - `value` / `footprint` = the first unit's `properties`.

  The pin filter (`ie:394`) and the MPN come from the netlist and stay with P5.
- **Catalog usage** (C7, `ps:75-102`, `backend/app/services/project_catalog_usage_service.py:40-53`): one `PlacedSymbol` per distinct `(documentPath, symbolUuid)`, `lib_id = libId`, `references` = the distinct `reference`s of its occurrences, `properties` = `properties`, stamp from `properties` (`ps:57-67`).
- **Catalog asset extraction** (C7, `backend/app/services/project_component_asset_extractor.py:291-309`): `symbols_by_uuid` → `documentPath` of the symbol; `footprints_by_reference` → the first uuid in `/references/{ref}/footprints` and its `documentPath`. The form bytes still come from `sources/`.
- **Release Studio variant declarations** (C3, `rsp:651-699`, `:753-871`):
  - board = `/variantDeclarations` with `source == pcb` (name, description), merged with assignments `{record.name: {footprint.reference: record.dnp}}` from every `/footprints/*/variants/*` that sets `dnp`;
  - project = `source == project`;
  - schematic (`rsp:689-699`, used only when a schematic path is passed) = names of the root sheet's symbol and sheet records in file order, with `dnp` assignments keyed by the symbol's `properties.Reference`.

  Production calls pass no schematic (`backend/app/release_studio/document_pipeline.py:266-271`).

## How a golden is produced from today's code

Everything below runs offline on copies of the fixtures in a scratch directory. `ecad-diff` writes an index cache into the snapshot root, so it must never run on the committed fixture directories.

1. **Today's outputs** (dev). Per fixture:
   - `ECAD_INDEX_CACHE=0 node backend/design-compare-parser/ecad-diff.mjs <copy> <copy> --out ecad.json` (Node 24.22.0);
   - then, with the backend environment (`uv run --offline --no-project --python <venv python> --with-requirements ../requirements/test.txt python today.py`), call:
     - `design_compare_occurrences.revision_components(ecad["base"] | {root: <copy>})` and `bom_rows(...)`;
     - `semantic_index_variants.build_assembly_state(KiCadDesign.from_project_file(pro), project_file=pro, catalog=variant_catalog_service.discover_snapshot_catalog(...)["variants"])`;
     - `semantic_index_service.build_semantic_index(pro, source_revision_key="x")`;
     - `systems.interface_extractor.extract_interface(pro, project_id="p", commit=None)`;
     - `catalog.placement_stamp.placed_symbols(text, rel)` for every non-generated `.kicad_sch`;
     - `release_studio.projections.project_variants(board, pro, schematic)` and `project_variants(board, pro, None)`.
2. **Golden occurrences document.** The prototype producer (`proto_occurrences.py`) builds `OccurrencesA0` from the same kicad_monkey 2026.9.7 model with today's helpers. It is the executable form of the rules above:
   - `siv._build_schematic_graph`, `_ancestor_sheet_flags`, `_fold_sheet_flags`, `_symbol_flags(resolve_symbol(symbol, None, sheet_path), …)`;
   - `sis._canonical_fields` called as `dco:119-125`;
   - `rsp._footprint_reference`;
   - footprint ids from the form's `(uuid …)`, else `(tstamp …)`, because kicad_monkey 2026.9.7 drops `tstamp`.

   G should port that script into `native/parity/` as the occurrences golden generator. It is not a pure renaming of one existing output: the per-occurrence flags, `instanceMatched`, raw records and declarations come from four producers. The transformation from today's outputs to this shape is:
   - flags from `assembly.default` (sparse → full);
   - `properties` from `placed_symbols`;
   - `bomFields` from `revision_components()[].fields` (labels → field names, `""` → absent, `DNP`/`In BOM` and extras dropped);
   - footprints and references from `componentObjects`;
   - declarations from `project_variants().declarations`.
3. **Compare** the Rust member to the golden by JSON value equality (conventions §14). Then run the reading rules against step 1's outputs. Every consumer must match except for the cases in "Expected divergences".

## Expected divergences

| Case | Today | Bundle | Why the bundle is right | Consumer affected |
|---|---|---|---|---|
| Stale instance record: a symbol's `(instances)` holds a path no sheet instance has (copied sheet, deleted sheet, other project) | Design Comparison emits a component and a BOM row for it (`ecad:893-912` enumerates records, not the hierarchy); catalog usage counts its reference (`ps:88-90`) | not an occurrence | KiCad's BOM and netlist ignore it (x-stale: KiCad 10.0.6 BOM has no `R101`) | C2 BOM diff, C7 usage counts |
| Orphan `.kicad_sch` (in the project directory, reached by no sheet) | Design Comparison and catalog usage scan every file (`ecad:197-219`, `project_catalog_usage_service.py:48-52`): duplicate components | not read | Same as KiCad (x-stale: `R6` once) | C2, C7 |
| Multi-unit reference whose units disagree on a BOM field | `diff_boms` keeps the row of the last unit in Node parser order: files sorted by path, file order, instance order | readers choose; recommended: the index's representative (first sheet in hierarchy order, then smallest symbol UUID, KiCad's netlist rule, packet N13) | One documented rule shared with the index | C2 (only when units disagree; none in the fixtures) |
| KiCad 7 board (`(tstamp …)`, `fp_text reference`), e.g. `cynthion`, `synthetic` | semantic index: footprint uuid `""`, reference `""`, no `pcbRefs` (`siv:483`, `sis:1070`); Design Comparison: correct (`ecad:1350`) | uuid from `tstamp`, reference from `fp_text` | Matches Design Comparison and Release Studio (`rsp:639-648`); the index's empty ids are a bug | P1 parity (open question 1); C2 unaffected |
| KiCad 7 schematic, `Datasheet` | the index misses it (`sis:410` requires a quoted uuid) | from the placed symbol | — | index only |
| Index `Description` | library description when the placed symbol's is empty (`sis:497`) | the placed symbol's `Description` | KiCad's BOM shows the field | none (Design Comparison already uses the placed symbol) |
| Project registry description `""` | Release Studio `""` | absent → `None` | KiCad omits a blank description; conventions §10 | C3 (`divergence_reasons` unchanged: `rsp:716-718` skips `None`) |
| Fork core fallbacks for an unmatched instance (suffix match, first instance for the project; fork `schematic_effective.rs:133-152`) | Python paths: no fallback (`siv:285-307`, `ie:109-121`) | no fallback; `instanceMatched: false` | Parity with today; fallbacks would invent references | P2 implementation |
| Paths are repository-relative (maintainer decision, conventions §8; issue #681) | `documentPath` relative to the project directory (Design Comparison) | `RepoPath` | one spelling per file whichever project refers to it | C2, C7: equal for a project at the repository root; otherwise every `documentPath` gains the project directory |
| Fork core lacks footprint `(variant …)` records and sheet-instance variant records (no model in fork `pcb/` or `schematic_bundle.rs:33-50`) | Python reads them (kicad_monkey) | required in the member | Release Studio's board assignments need them | P2 must add parsing (cross-contract) |

## Example provenance

`examples/OccurrencesA0.example.json` is the prototype producer's output on the committed fixture `backend/tests/fixtures/design_variants/oracle` (`variants_oracle.kicad_pro`), trimmed. The repository root is taken to be the fixture project's own directory, as if it were its own repository, so each repository-relative `documentPath` equals the project-relative one:

- **Sheets:** the root, `CH_A` and `CH_B` were kept: the reused `channel.kicad_sch`, and `CH_B`'s `Lite` record. `Wireless` and `Antenna` were dropped with their symbols (`U2`, `R12`, `R6`).
- **Symbols:** `R1`, `R2` (default DNP), `R3`, `R9`, `#PWR01` (a power symbol, kept to show it is included), `R7` and `R8` were kept. `R7` and `R8` are one symbol form in `channel.kicad_sch`; `R8`'s `Reference` property reads `R7`. Together they cover every record flag:
  - `dnp`;
  - `excludeFromBom` and `excludeFromPosFiles` on `R3`;
  - `excludeFromSim` and `excludeFromBoard` on `R9`;
  - field overrides on `R7`.

  Dropped: `R4`, `C1`, `U1` (both units) and `Q1`.
- **Footprints and references:** the kept references' footprints, plus `J9`, a board-only footprint with a footprint-only `PcbOnly` record. `R9` keeps a reference entry with no footprint.
- **Declarations:** 5 of the 7 were kept.

The example has 460 lines, over the ~300 aim, because covering every optional record flag needs several symbols. `bomFields` keys other than `value`, `manufacturerPartNumber` and `footprint` do not occur in this fixture. `cynthion` exercises them (prototype output validated, see W0 report).
