# Field map: `materialization/board.kmpack` header, `design_facts` (`kicad_monkey.materialization.a1`)

Root model `MaterializationDocumentA1` in `src/tsp/kicad_monkey/materialization-a0.tsp` (a fork contract; the a0 root `MaterializationDocument` is in the same file). Schema `contracts/generated/schema/MaterializationDocumentA1.json`. No example file: fork contracts have none (`conventions.md` §16 covers `prism.*` documents); the evidence is `prism-kicad-core/tests/board_materialization_design_facts.rs` on committed fixtures.
Written by: the materializer, `prism-kicad-core` `board_materialization/design_facts.rs` and `design_zones.rs` (amendment PI). Stage: board.

This map covers only what a1 added, `/design_facts`; every other field is a0's, documented in `native/docs/design/rust-pcb-analytic-materializer.html`. Paths below are under `native/src/rs/prism-kicad-core/src/` unless named otherwise.

## Fields

Pointers are RFC 6901 with `*` for every element of an array. Units: integer nanometres (`_nm`), degrees (`_deg`), mm² (`_mm2`). `NonNegativeNm` is a 32-bit non-negative length. "Absent" means the source does not state it; nothing is defaulted unless the row says KiCad's parser default.

| Field (JSON pointer) | Type | Unit | Order / nullability | Today's source (path:line) | Consumers | Parity note |
|---|---|---|---|---|---|---|
| `/design_facts` | `DesignFacts` | — | present in every a1 document; absent exactly in a0 | new | sim: board-model (PI suite, `10-bundle-changes.md` §3 group A) | — |
| `/design_facts/max_error_nm` | `NonNegativeNm` | nm | optional; absent without a project file or without the key | `.kicad_pro` `board.design_settings.rules.max_error` (mm), read by `board_materialization/design_facts.rs:38` | sim: engine tolerances (A-3) | — |
| `/design_facts/copper_edge_clearance_nm` | `NonNegativeNm` | nm | optional; as above | `.kicad_pro` `board.design_settings.rules.min_copper_edge_clearance` (mm) | sim (A-6) | board setting only; `.kicad_dru` rules not applied |
| `/design_facts/zones` | `ZoneFacts[]` | — | required; in file order | `pcb/zones.rs` (`PcbZone`), board zones with a copper layer of the stack and footprint rule areas | sim (A-1, A-5) | — |
| `/design_facts/zones/*/source_uid` | string | — | required; unique | `board_materialization/zone_ids.rs` (UUID, else `zone@<offset>` when nil, repeated or absent) | sim: join with binding `source_uid` of `zone_fill` operations | A-4 |
| `/design_facts/zones/*/name` | string | — | optional | `pcb/zones.rs:211` | sim | — |
| `/design_facts/zones/*/net_key` | string | — | optional; absent for no net | `board_materialization/nets.rs:9` (`net_key`) | sim | same key as the operations' `net_key` |
| `/design_facts/zones/*/footprint_source_uid` | string | — | optional; present for a footprint's rule area | the owning footprint's `Component.source_uid` | sim | — |
| `/design_facts/zones/*/slice_keys` | string[] | — | required, ≥ 1; in stack order; conductor slices | the zone's layers through `board_materialization/stack.rs` `CopperStack::expand` | sim | — |
| `/design_facts/zones/*/priority` | uint32 | — | required; 0 when the file has none | `pcb/zones.rs:217` | sim | — |
| `/design_facts/zones/*/outline` | `PlanarRegion2d` | nm | required; first `(polygon)` is `outer`, later ones `holes`, each with its arcs | `pcb/zones.rs` `PcbZonePolygon` (`points`, `arcs`) | sim | footprint zones of format ≥ 20260616 placed by the footprint's rotation and position |
| `/design_facts/zones/*/fill` | `ZoneFillRules` | — | present exactly for a copper zone (no keep-out) | — | sim | — |
| `/design_facts/zones/*/fill/clearance_nm` | `NonNegativeNm` | nm | required; parser default 0.5 mm | `pcb/zones.rs:219` (`connect_pads (clearance)`) | sim | — |
| `/design_facts/zones/*/fill/min_width_nm` | `NonNegativeNm` | nm | required; parser default 0.25 mm | `pcb/zones.rs:220` (`min_thickness`) | sim | — |
| `/design_facts/zones/*/fill/pad_connection` | `PadConnection` | — | required; no mode is `thermal_reliefs` | `pcb/zones.rs` `connect_pads_mode` | sim | `yes`/`full` → `solid`, `no` → `none` |
| `/design_facts/zones/*/fill/thermal_gap_nm` | `NonNegativeNm` | nm | required; parser default 0.5 mm | `pcb/zones.rs:225` | sim | — |
| `/design_facts/zones/*/fill/thermal_spoke_width_nm` | `NonNegativeNm` | nm | required; parser default 0.5 mm | `pcb/zones.rs:226` (`thermal_bridge_width`) | sim | — |
| `/design_facts/zones/*/fill/island_removal` | `IslandRemoval` | — | required; no token is `always` | `pcb/zones.rs:228` | sim | 0 `always`, 1 `never`, 2 `below_area` |
| `/design_facts/zones/*/fill/island_min_area_mm2` | float64 | mm² | optional; as written | `pcb/zones.rs:229` | sim | — |
| `/design_facts/zones/*/fill/corner_smoothing` | `CornerSmoothing` | — | optional; absent for none | `pcb/zones.rs:230` (new typed field) | sim | — |
| `/design_facts/zones/*/fill/corner_radius_nm` | `NonNegativeNm` | nm | optional; only with smoothing | `pcb/zones.rs:232` (new typed field) | sim | — |
| `/design_facts/zones/*/fill/hatch` | `ZoneHatchFill` | — | optional; present for `(mode hatch)` | `pcb/zones.rs` `hatch_fill` (new typed field) | sim | the display hatch `(hatch edge …)` is not here |
| `/design_facts/zones/*/fill/hatch/thickness_nm`, `gap_nm` | `NonNegativeNm` | nm | optional; as written | `hatch_thickness`, `hatch_gap` | sim | — |
| `/design_facts/zones/*/fill/hatch/orientation_deg` | float64 | deg | optional; as written | `hatch_orientation` | sim | — |
| `/design_facts/zones/*/keepout` | `RuleAreaKeepouts` | — | present exactly for a rule area | `pcb/zones.rs` `keepout_from_children` | sim (A-5) | — |
| `/design_facts/zones/*/keepout/{tracks,vias,pads,copper_pour,footprints}` | boolean | — | required; true where `not_allowed` | `pcb/zones.rs` `PcbZoneKeepout` (KiCad 10.0.6 defaults for absent tokens) | sim | — |
| `/design_facts/pad_rules` | `PadRules[]` | — | required; in file order; only pads that set a rule | `pcb/pads.rs` `PcbPad` | sim (A-2) | — |
| `/design_facts/pad_rules/*/source_uid` | string | — | required; unique | the pad's binding `source_uid` | sim | — |
| `/design_facts/pad_rules/*/clearance_nm`, `thermal_gap_nm`, `thermal_spoke_width_nm` | `NonNegativeNm` | nm | optional; absent = inherited | `PcbPad::clearance`, `thermal_gap`, `thermal_bridge_width` | sim | — |
| `/design_facts/pad_rules/*/thermal_spoke_angle_deg` | float64 | deg | optional | `PcbPad::thermal_bridge_angle` | sim | — |
| `/design_facts/pad_rules/*/pad_connection` | `PadConnection` | — | optional; absent for −1 (inherit) or no token | `PcbPad::zone_connect` | sim | 0 `none`, 1 `thermal_reliefs`, 2 `solid`, 3 `thru_hole_only` |
| `/design_facts/pad_rules/*/layers` | `PadstackLayerRules[]` | — | required; in file order; only layers that set a rule | `pcb/padstacks.rs:85-89` | sim | — |
| `/design_facts/pad_rules/*/layers/*/kicad_layer` | string | — | required; as written (`F.Cu`, `Inner`, `B.Cu`, …) | `pcb/padstacks.rs` `PcbPadstackLayer::layer` | sim | — |
| `/design_facts/pad_rules/*/layers/*/…` | as the pad's | | optional | `pcb/padstacks.rs:85-89` | sim | — |
| `/design_facts/footprint_rules` | `FootprintRules[]` | — | required; in file order; only footprints that set a rule | `pcb.rs:379-382` (`PcbFootprint`) | sim (A-2) | — |
| `/design_facts/footprint_rules/*/source_uid` | string | — | required; unique | the component's `source_uid` | sim | — |
| `/design_facts/footprint_rules/*/{clearance_nm,pad_connection,thermal_gap_nm,thermal_spoke_width_nm}` | as the pad's | | optional | `PcbFootprint::clearance`, `zone_connect`, `thermal_gap`, `thermal_width` | sim | — |
| `/design_facts/courtyards` | `Courtyard[]` | — | required; by component in file order, front before back | footprint graphics on `F.CrtYd`/`B.CrtYd`, closed by `board_materialization/profile.rs` `close_profile` | sim (A-5) | — |
| `/design_facts/courtyards/*/source_uid` | string | — | required | the component's `source_uid` | sim | — |
| `/design_facts/courtyards/*/side` | `BoardSide` | — | required | the courtyard layer | sim | — |
| `/design_facts/courtyards/*/regions` | `PlanarRegion2d[]` | nm | required, ≥ 1; sorted by outer start (y, then x) | `close_profile` | sim | a courtyard that does not close is reported as `courtyard_not_closed` |
| `/design_facts/footprint_pads` | `FootprintPads[]` | — | required; by component in file order; footprints without pads left out | `pcb/pads.rs` `PcbPad` grouped by `footprint_index`, `board_materialization/design_facts.rs` `footprint_pads` | sim: AC engine package pins and pin counts (amendment PI D6) | — |
| `/design_facts/footprint_pads/*/source_uid` | string | — | required | the component's `source_uid` | sim | — |
| `/design_facts/footprint_pads/*/pads` | `FootprintPad[]` | — | required, ≥ 1; board file order, every pad with or without copper | `PcbPad` | sim | — |
| `/design_facts/footprint_pads/*/pads/*/source_uid` | string | — | required | the pad's binding `source_uid` (UUID, KiCad 7 `tstamp`, or `pad@<offset>`) | sim | — |
| `/design_facts/footprint_pads/*/pads/*/number` | string | — | required; may be empty | `PcbPad::number` | sim | — |
| `/design_facts/footprint_pads/*/pads/*/net_key` | string | — | optional; absent for no net | `nets.rs` `net_key` | sim | the pad's copper binding writes the empty net instead |

## How a golden is produced from today's code

No golden exists: nothing in Prism produced these facts before a1. The tests in `prism-kicad-core/tests/board_materialization_design_facts.rs` check them against the source text of `fixtures/release-studio/usb-pd` (zones, thermal reliefs, pads with local rules, courtyards, the project's board rules), `native/parity/docs-oracle/board` (a keep-out rule area, a footprint rule) and `fixtures/release-studio/cynthion` (a KiCad 7 board: 66 zones, nine rule areas, one owned by a footprint). Footprint pads are checked against the order of `(pad …)` in the USB-PD text and against every pad binding (number, net, component) on USB-PD and cynthion (1,472 pads, repeated numbers, unnamed pads).

## Expected divergences

| Case | Today | Bundle | Why the bundle is right | Consumer affected |
|---|---|---|---|---|
| A zone with a nil or repeated UUID | binding `source_uid` was the UUID, repeated across zones | `zone@<offset>` for the nil or later repeated one | `source_uid` identifies one zone | none in the repository; no committed fixture has such a zone |

## Example provenance

None: fork contracts have no example files. The tests named above are the evidence.
