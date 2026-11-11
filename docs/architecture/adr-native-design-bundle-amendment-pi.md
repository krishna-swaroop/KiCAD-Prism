# ADR amendment PI: design facts in the materialization (a1)

- **Status:** Proposed (2026-11-11). The new version and the reader compatibility rule were decided by the maintainer on 2026-11-11 (power-integrity suite, `10-bundle-changes.md` §5): the materialization gets a new version identifier for the facts of group A, with an ADR amendment, field map and schema; readers accept the old and the new version. The rest of this text is the producer's proposal for review. The contract, producer, readers and documents land together on `feature/pi-suite`.
- **Parent:** [`adr-native-design-bundle.md`](adr-native-design-bundle.md) §6 (bundle members; the `materialization/board.kmpack` row). It also changes [`bundle-format.md`](../../native/contracts/prism/bundle-format.md) §2.1 (members) and §9 (reader validation).
- **Applies to:** the fork contract `kicad_monkey.materialization` (`native/src/tsp/kicad_monkey/materialization-a0.tsp`), the materializer in `prism-kicad-core`, the pack, and every reader in this repository: `prism-bundle` (validator and reader), the WASM module of the 3D viewer, the viewer's JavaScript, the backend's archive reader.

## 1. Context

The power-integrity engines in prism-sim-studio need facts that the producer already parses but does not write: the rules of each zone (clearance, minimum width, thermal reliefs, island removal, keep-outs, the drawn outline with its arcs), the zone rules pads and footprints set for themselves, the board's arc-approximation error, courtyards and rule areas as regions, and the copper-to-edge clearance. Today a consumer can only re-parse the board, or guess.

Three constraints shape where these facts go:

1. **They are not material.** As geometry operations, the 3D viewer would draw them and the saved-versus-refilled fill comparison (`compare_fills`) would count them. As new binding columns, the pack's binary layout would change.
2. **Every reader decodes sealed types.** The generated Rust types carry `deny_unknown_fields`, so any new field makes a reader that was not rebuilt reject the document. The committed WASM is such a reader.
3. **The contract rule** (`conventions.md` §3): any change, a new optional field included, is a version bump with an ADR amendment. The materialization has grown in place so far (stack flags, castellation, dielectric kind arrived inside a0); this amendment starts following the rule for it.

## 2. Decisions

### D1. A new version, `kicad_monkey.materialization.a1`

- a1 is a0 plus one header field, `design_facts` (§3). Nothing else in the document changes: operations, binding, chunks, components and the stack are byte-for-byte what a0 wrote for the same board, apart from the zone source UIDs of D4.
- The root model `MaterializationDocumentA1` (`$id` `urn:wavenumber:schema:kicad_monkey.materialization.document:a1`, schema `MaterializationDocumentA1.json`) sits beside the a0 root in the same TypeSpec file, as the fork's `NativeHandshakeA1`/`A2` do. The a0 root and its schema `MaterializationDocument.json` stay unchanged, as `conventions.md` §3 asks while stored bundles can hold a0.
- **The request stays `kicad_monkey.materialization.request` a0.** A request names products and filters; nothing about it changed.
- **Rust is generated from the a1 schema only** (`prism-kicad-codegen`), into the same module, so the shared types keep their names and only the root becomes `MaterializationDocumentA1`. TypeScript gets both roots.

### D2. The pack format stays 0

The pack's JSON header is the document without operations, binding and chunks (`prism-kicad-materialization-pack`, `pack.rs` `encode_preamble_and_header`). `design_facts` rides in that header; the section directory, string table, binding, chunk directory, linear-part table and column blocks are unchanged. The format number changes only when the binary layout does, so `generator.pack_format_version` stays 0.

### D3. Readers accept a1 and a0

- An a1 reader decodes both versions into the a1 types: a0 lacks only `design_facts`, which is optional in the model for that reason alone.
- The validator (`validate_materialization_document`) dispatches on `schema`/`version`: an a1 document must carry `design_facts`, an a0 document must not (codes `missing_design_facts`, `unexpected_design_facts`); any other id is `unsupported_contract`.
- `prism-bundle`'s step 7 accepts a member whose `member_schema` is either id, opens the pack, and now also requires the header's `schema` to equal the member's (`member-schema-invalid`). The backend's archive reader and the viewer's `openAnalyticPack` accept both ids.
- **Why keep a0:** bundles built before a1 stay in the store until they are rebuilt, and their reuse needs the current generator digest anyway (amendment K2 §3.3), so a0 packs are read, never written. The rule ends when a later amendment drops a0, at which point `MaterializationDocument.json` can go.
- **Out-of-repository readers** (prism-sim-studio) are unsealed for the materialization before this lands (`10-bundle-changes.md` R-2), so the next addition is not a breaking event for them.

### D4. Zone source UIDs are unique

A zone's `source_uid` is its UUID. A nil UUID, or one an earlier zone of the board (board or footprint zone, in file order) already has, falls back to `zone@<byte offset>`, the form a zone without UUID already had. The binding of fill operations and the zone records use the same UIDs. No committed fixture has a nil or repeated zone UUID, so no golden, pin or pack of a committed fixture changes for this.

### D5. The facts are board facts, not scoped

`design_facts` is like `nets` and `net_classes`: every document of a board carries all of it, whatever the request's products, slices, nets or region. Filtering (`filter_document`, `PreparedBoard`) copies it unchanged, so correctness rule 2 (a filtered complete document equals the direct one) holds as before. The producer therefore always reads footprint graphics, which courtyards need, even for a request without drawn products.

## 3. The header shape

```text
design_facts: {
  max_error_nm?, copper_edge_clearance_nm?,          // project file, board.design_settings.rules
  zones: [ { source_uid, name?, net_key?, footprint_source_uid?,
             slice_keys[≥1], priority, outline: PlanarRegion2d,
             fill?: { clearance_nm, min_width_nm, pad_connection, thermal_gap_nm,
                      thermal_spoke_width_nm, island_removal, island_min_area_mm2?,
                      corner_smoothing?, corner_radius_nm?,
                      hatch?: { thickness_nm?, gap_nm?, orientation_deg? } },
             keepout?: { tracks, vias, pads, copper_pour, footprints } } ],
  pad_rules: [ { source_uid, clearance_nm?, pad_connection?, thermal_gap_nm?,
                 thermal_spoke_width_nm?, thermal_spoke_angle_deg?,
                 layers: [ { kicad_layer, …same optional rules } ] } ],
  footprint_rules: [ { source_uid, clearance_nm?, pad_connection?, thermal_gap_nm?,
                       thermal_spoke_width_nm? } ],
  courtyards: [ { source_uid, side, regions: PlanarRegion2d[≥1] } ]
}
```

- Units and names follow the member: integer nanometres (`_nm`), degrees (`_deg`), area in mm² (`_mm2`), snake_case, the board frame (y down). Enums: `pad_connection` ∈ `none`, `thermal_reliefs`, `solid`, `thru_hole_only`; `island_removal` ∈ `always`, `never`, `below_area`; `corner_smoothing` ∈ `chamfer`, `fillet`.
- Keys: zones by their binding `source_uid` (D4), pads by the pad's binding `source_uid`, footprint rules and courtyards by the component's `source_uid`.
- A zone has exactly one of `fill` (a copper zone) and `keepout` (a rule area: each flag true where KiCad says `not_allowed`). Zones are those with a copper layer of the stack; rule areas owned by footprints are included, with `footprint_source_uid`. `slice_keys` are conductor slices in stack order.
- `outline` is the authored outline with its arcs: KiCad reads the first `(polygon)` as the outline and later ones as holes in it. Fills stay operations as before.
- Zone fill values carry KiCad's parser default when the file omits them (KiCad reads them so). Pad, padstack-layer and footprint values are present only where the item sets them instead of inheriting (`zone_connect` −1 is absent); an item that sets nothing has no record.
- Courtyards are the `F.CrtYd`/`B.CrtYd` graphics of each footprint, closed as the board profile is (chained within 0.01 mm, even-odd nesting). One that does not close is reported (`courtyard_not_closed`, no product) and kept when it has any closed region.
- Arrays are in file order; courtyards by component in file order, front before back.

## 4. What is not in a1

| Item | Why |
|---|---|
| Per-hole connected slices (`connected_slice_keys`, item A-7) | The producer's connectivity resolver (`board_plotter_ir/layer_policy.rs`) tests tracks, arcs, pads and vias, not zone fills. Its answer would call a via in a plane unconnected on the plane, the case the PI engines need. The reader's own test (R-1) is the right source; A-7 waits until the resolver sees fills. |
| A zone's display hatch (`(hatch edge 0.5)`) | It is the editor's outline drawing, not copper. The fill hatch (`(mode hatch)`) is in `fill.hatch`. |
| Hatch smoothing, border algorithm, minimum hole area | Not parsed into typed values; they stay in the parser's `unmodeled_fill_settings`. |
| Placement rule areas (`(placement …)`) | Not a copper constraint. |
| Custom design rules (`.kicad_dru`) | `copper_edge_clearance_nm` is the board setting only; a custom rule can tighten it per area or net. |
| Zones only on technical layers | Their fills are already mask, paste or silkscreen operations; no rule a PI engine reads. |

The parser gained three typed zone fields for this (`PcbZone::corner_smoothing`, `corner_radius`, `hatch_fill`). They are read-only facts: the tokens stay listed in `unmodeled_fill_settings`, which zone rewriters check, so no writer behaviour changes.

## 5. Consequences

- **Generator id:** `crate_version` 0.15.0 and `member_schemas` name `kicad_monkey.materialization.a1`, so the generator digest changes and every stored bundle is rebuilt on next use (amendment K2 §3.3). The pin table is re-blessed; parse-stage members are unchanged (only `bundle.json` and the pack change).
- **3D viewer:** draws nothing new. Lowering reads operations and the stack only; the header JSON grows (165 kB on cynthion's 66 zones and 348 courtyards). The committed WASM, the served viewer and the viewer's `demo.kmpack` are rebuilt.
- **Fill comparison and cross-check:** unchanged; they read operations and binding only.
- **Cost:** courtyard closure and zone records add about 0.1 s on cynthion in a release build; footprint graphics are now always decoded.

## 6. Text changes on acceptance

1. **Parent §6, the members table:** `materialization/board.kmpack` is `kicad_monkey.materialization.a1`; readers also accept a0 (this amendment). The status line names this amendment.
2. **`bundle-format.md`:** the member table names a1; reader validation accepts a1 and a0 and checks the header's schema against `member_schema`.
3. **`contracts/prism/README.md`:** the materialization is the fork's a1, with a field map for its design facts (`field-maps/materialization.md`).
4. **`native/docs/design/rust-pcb-analytic-materializer.html`:** the contract section names a1.
