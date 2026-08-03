/**
 * Semantic properties of the object index that M2 will diff against.
 *
 * Run with `node --test scripts/` -- Node 22's built-in runner, so this needs
 * no dependency the backend image does not already have.
 *
 * The reconciliation check in ecad-parse.mjs already proves the index accounts
 * for every object the parser found, against real designs. These cover the
 * things a count cannot: what a hash does and does not respond to.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { index_document } from "./ecad-parse.mjs";

const SCHEMATIC = `
(kicad_sch
  (version 20231120)
  (lib_symbols
    (symbol "Device:R"
      (pin passive line (at 0 3.81 270) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27))))
        (number "1" (effects (font (size 1.27 1.27))))
        (uuid "cafecafe-0000-0000-0000-000000000000"))))
  (symbol (lib_id "Device:R") (at 10 20 0) (unit 1)
    (uuid "11111111-1111-1111-1111-111111111111")
    (property "Reference" "R1" (at 12 19 0)
      (effects (font (size 1.27 1.27) (bold yes)) (justify left)))
    (property "Value" "10k" (at 12 21 0))
    (pin "1" (uuid "22222222-2222-2222-2222-222222222222"))
    (instances
      (project "obc"
        (path "/aaaa-0001" (reference "R1") (unit 1))
        (path "/aaaa-0002" (reference "R9") (unit 1)))))
  (wire (pts (xy 0 0) (xy 10 0))
    (uuid "33333333-3333-3333-3333-333333333333"))
  (sheet (at 30 30) (size 20 10)
    (stroke (width 0) (type default))
    (fill (color 0 0 0 0.0000))
    (uuid "44444444-4444-4444-4444-444444444444")
    (property "Sheetname" "Power" (at 30 29.3 0))
    (property "Sheetfile" "power.kicad_sch" (at 30 40.7 0))
    (pin "ENABLE" input (at 30 35 180)
      (effects (font (size 1.27 1.27)) (justify left))
      (uuid "55555555-5555-5555-5555-555555555555")))
  (junction (at 5 5) (diameter 0))
)
`;

const BOARD = `
(kicad_pcb
  (version 20240108)
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (44 "Edge.Cuts" user))
  (setup
    (pad_to_mask_clearance 0.05)
    (pad_to_paste_clearance_ratio -0.05)
    (pcbplotparams
      (layerselection 17592186044417)
      (plot_on_all_layers_selection 0)
      (usegerberextensions true)
      (usegerberattributes true)
      (creategerberjobfile true)
      (plotreference true)
      (plotvalue false)
      (subtractmaskfromsilk false)
      (outputformat 1)
      (outputdirectory "gerber")))
  (net 0 "")
  (net 1 "VBUS")
  (footprint "R_0402" (layer "F.Cu") (at 1 2)
    (uuid "aaaaaaaa-0000-0000-0000-000000000000")
    (property "Reference" "R1")
    (path "/aaaa-0001")
    (fp_line (start 0 0) (end 1 0) (stroke (width 0.1) (type solid))
      (layer "F.SilkS") (uuid "eeeeeeee-0000-0000-0000-000000000000"))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "VBUS")
      (uuid "bbbbbbbb-0000-0000-0000-000000000000"))
    (zone (net 1) (net_name "VBUS") (layer "F.Cu")
      (uuid "ffffffff-0000-0000-0000-000000000000")
      (polygon (pts (xy 0 0) (xy 1 0) (xy 1 1)))))
  (zone (net 1) (net_name "VBUS") (layer "F.Cu")
    (uuid "cccccccc-0000-0000-0000-000000000000")
    (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10)))
    (filled_polygon (layer "F.Cu") (pts (xy 0 0) (xy 5 0) (xy 5 5))))
  (segment (start 0 0) (end 4 0) (width 0.2) (layer "F.Cu") (net 1)
    (uuid "dddddddd-0000-0000-0000-000000000000"))
  (gr_text "ASSEMBLY" (at 2 3) (layer "F.SilkS")
    (uuid "12121212-0000-0000-0000-000000000000")
    (effects (font (size 1 1) (thickness 0.15))))
)
`;

const sch = (text = SCHEMATIC) => index_document(text, "root.kicad_sch");
const pcb = (text = BOARD) => index_document(text, "board.kicad_pcb");

const PROJECT = JSON.stringify({
    board: {
        design_settings: {
            rules: {
                min_clearance: 0.09999999999999999,
                min_track_width: 0.1,
                allow_microvias: false,
            },
            rule_severities: { clearance: "error" },
            track_widths: [0, 0.1, 0.2],
            via_dimensions: [{ diameter: 0.5, drill: 0.25 }],
            diff_pair_dimensions: [{ width: 0.15, gap: 0.2, via_gap: 0.25 }],
            defaults: { silk_line_width: 0.15 },
            teardrop_options: [{ td_onviapad: true }],
            zones_allow_external_fillets: false,
            zones_use_no_outline: true,
            drc_exclusions: [
                "courtyards_overlap|149225001|84900001|object-a|object-b",
            ],
        },
    },
    net_settings: {
        classes: [{
            name: "USB",
            clearance: 0.2,
            track_width: 0.18,
            via_diameter: 0.6,
            via_drill: 0.3,
            diff_pair_width: 0.18,
            diff_pair_gap: 0.2,
        }],
        netclass_assignments: {
            "/USB D+": "USB",
            "/USB D-": "USB",
        },
        netclass_patterns: [{ pattern: "/USB RX*", netclass: "USB" }],
    },
    erc: {
        erc_exclusions: ["pin_to_pin|1739900|1003300|pin-a|pin-b"],
        pin_map: [
            [0, 1, 2],
            [1, 0, 2],
            [2, 2, 0],
        ],
    },
    text_variables: { TITLE: "USB interface", VERSION: "A" },
});

test("the library symbol cache is not placed content", () => {
    // Scanning into lib_symbols would emit phantom objects no schematic item
    // ever resolves to, and its pin uuids would collide conceptually with
    // real instance pins.
    assert.equal(sch().byUuid.has("cafecafe-0000-0000-0000-000000000000"), false);
    assert.equal(sch().byUuid.has("22222222-2222-2222-2222-222222222222"), true);
});

test("an anonymous form is counted, not silently dropped", () => {
    // The junction has no uuid, so nothing can address it -- but a shortfall
    // that is never counted is indistinguishable from a parser gap.
    const result = sch();
    assert.equal(result.anonymous.junction, 1);
    assert.equal([...result.byUuid.values()].some((o) => o.kind === "junction"), false);
});

test("a symbol carries every KIID_PATH it is placed at", () => {
    // A reused hierarchical sheet is one file, so its instances share the
    // symbol's uuid. Taking only the first path is what collapsed distinct
    // components onto one change id.
    const symbol = sch().byUuid.get("11111111-1111-1111-1111-111111111111");
    assert.deepEqual(symbol.kiidPaths, [
        "/aaaa-0001/11111111-1111-1111-1111-111111111111",
        "/aaaa-0002/11111111-1111-1111-1111-111111111111",
    ]);
    assert.equal(symbol.refdes, "R1");
});

test("property attributes are visible, not just values", () => {
    const symbol = sch().byUuid.get("11111111-1111-1111-1111-111111111111");
    const reference = symbol.properties.find((p) => p.name === "Reference");
    assert.equal(reference.value, "R1");
    assert.deepEqual(reference.at, [12, 19]);
    assert.equal(reference.effects.font.bold, true);
    assert.equal(reference.effects.justify.horiz, "left");

    // A property that only moved is a change the current pipeline cannot see.
    const moved = sch(SCHEMATIC.replace("(at 12 19 0)", "(at 14 19 0)"));
    assert.notEqual(
        moved.byUuid.get("11111111-1111-1111-1111-111111111111").hash,
        symbol.hash,
    );
});

test("schematic editor bookkeeping is not a design change", () => {
    const symbol = "11111111-1111-1111-1111-111111111111";
    const base = sch();
    const autoPlaced = sch(SCHEMATIC.replace(
        '(symbol (lib_id "Device:R") (at 10 20 0) (unit 1)',
        '(symbol (lib_id "Device:R") (at 10 20 0) (unit 1) (fields_autoplaced yes)',
    ));
    const pageTwo = sch(SCHEMATIC.replace(
        '(path "/aaaa-0001" (reference "R1") (unit 1))',
        '(path "/aaaa-0001" (reference "R1") (unit 1) (page "2"))',
    ));
    const pageNineteen = sch(SCHEMATIC.replace(
        '(path "/aaaa-0001" (reference "R1") (unit 1))',
        '(path "/aaaa-0001" (reference "R1") (unit 1) (page "19"))',
    ));

    assert.equal(base.byUuid.get(symbol).hash, autoPlaced.byUuid.get(symbol).hash);
    assert.equal(pageTwo.byUuid.get(symbol).hash, pageNineteen.byUuid.get(symbol).hash);

    // The stable hierarchy identity remains authored content.
    const reReferenced = sch(SCHEMATIC.replace('(reference "R1")', '(reference "R2")'));
    assert.notEqual(base.byUuid.get(symbol).hash, reReferenced.byUuid.get(symbol).hash);
});

test("a wire keeps a centroid but no point list", () => {
    const wire = sch().byUuid.get("33333333-3333-3333-3333-333333333333");
    assert.deepEqual(wire.at, [5, 0]);
    assert.equal("pts" in wire, false);
});

test("hierarchical sheet pins expose interface name and electrical type", () => {
    const pin = sch().byUuid.get("55555555-5555-5555-5555-555555555555");

    assert.equal(pin.name, "ENABLE");
    assert.equal(pin.text, "ENABLE");
    assert.equal(pin.rotation, 180);
    assert.deepEqual(pin.reviewFields, {
        "Sheet pin": "ENABLE",
        "Electrical type": "input",
    });
});

test("editing a pad does not cascade into its footprint", () => {
    // The whole point of the shallow hash. A footprint whose hash covered its
    // pads would report both for a single pad edit.
    const before = pcb();
    const after = pcb(BOARD.replace("(size 1 1)", "(size 2 2)"));
    const pad = "bbbbbbbb-0000-0000-0000-000000000000";
    const footprint = "aaaaaaaa-0000-0000-0000-000000000000";

    assert.notEqual(before.byUuid.get(pad).hash, after.byUuid.get(pad).hash);
    assert.equal(before.byUuid.get(footprint).hash, after.byUuid.get(footprint).hash);
});

test("nested footprint zones and graphics are independently indexed", () => {
    const board = pcb();
    const zone = board.byUuid.get("ffffffff-0000-0000-0000-000000000000");
    const graphic = board.byUuid.get("eeeeeeee-0000-0000-0000-000000000000");

    assert.equal(zone.kind, "footprint_zone");
    assert.equal(zone.parentUuid, "aaaaaaaa-0000-0000-0000-000000000000");
    assert.equal(zone.refdes, "R1");
    assert.equal(graphic.kind, "footprint_graphic");
    assert.equal(graphic.parentUuid, "aaaaaaaa-0000-0000-0000-000000000000");
    assert.equal(graphic.refdes, "R1");
    assert.equal(graphic.layer, "F.SilkS");
});

test("fabrication objects expose reviewer-facing authored fields", () => {
    const board = pcb();
    const pad = board.byUuid.get("bbbbbbbb-0000-0000-0000-000000000000");
    const segment = board.byUuid.get("dddddddd-0000-0000-0000-000000000000");
    const zone = board.byUuid.get("cccccccc-0000-0000-0000-000000000000");

    assert.equal(pad.reviewFields["Pad number"], "1");
    assert.equal(pad.reviewFields["Pad type"], "smd");
    assert.equal(pad.reviewFields["Pad shape"], "rect");
    assert.equal(pad.reviewFields.Size, "1 × 1");
    assert.equal(pad.reviewFields.Layers, "F.Cu");
    assert.deepEqual(segment.reviewFields, { Width: 0.2 });
    assert.equal(zone.reviewFields["Zone layers"], "F.Cu");
});

test("project net classes and assignments are structured review objects", () => {
    const project = index_document(PROJECT, "board.kicad_pro");
    const netClass = [...project.byUuid.values()].find(
        (item) => item.kind === "net_class",
    );
    const assignments = [...project.byUuid.values()].filter(
        (item) => item.kind === "net_class_assignment",
    );

    assert.equal(netClass.name, "USB");
    assert.equal(netClass.reviewOnly, true);
    assert.equal(netClass.reviewFields["Track width"], 0.18);
    assert.equal(netClass.reviewFields["Differential pair gap"], 0.2);
    assert.equal(assignments.length, 3);
    assert.equal(assignments[0].reviewOnly, true);
});

test("fabrication constraints, presets, and DRC exclusions are review objects", () => {
    const project = index_document(PROJECT, "board.kicad_pro");
    const byKind = (kind) => [...project.byUuid.values()].filter(
        (item) => item.kind === kind,
    );

    const constraints = byKind("board_constraint")[0];
    assert.equal(constraints.reviewFields["Minimum copper clearance (mm)"], 0.1);
    assert.equal(constraints.reviewFields["Minimum track width (mm)"], 0.1);
    assert.equal(byKind("routing_preset")[0].reviewFields["Track widths (mm)"].length, 3);
    assert.equal(byKind("drc_exclusion")[0].name, "Courtyards Overlap at 149.225001 × 84.900001 mm");
    assert.equal(byKind("drc_exclusion")[0].reviewFields["Affected objects"], 2);
});

test("ERC policy, ERC exclusions, and title-block variables are semantic objects", () => {
    const project = index_document(PROJECT, "board.kicad_pro");
    const byKind = (kind) => [...project.byUuid.values()].filter(
        (item) => item.kind === kind,
    );

    assert.equal(byKind("erc_pin_rule").length, 6);
    assert.equal(byKind("erc_pin_rule")[1].reviewFields.Severity, "Warning");
    assert.equal(byKind("erc_exclusion")[0].name, "Pin To Pin at 173.99 × 100.33 mm");
    assert.equal(byKind("project_metadata")[0].reviewFields.Title, "USB interface");
});

test("waiver identity ignores KiCad object UUID rewrites", () => {
    const base = index_document(PROJECT, "board.kicad_pro");
    const rewritten = index_document(
        PROJECT
            .replaceAll("object-a", "new-object-a")
            .replaceAll("object-b", "new-object-b")
            .replaceAll("pin-a", "new-pin-a")
            .replaceAll("pin-b", "new-pin-b"),
        "board.kicad_pro",
    );
    for (const kind of ["drc_exclusion", "erc_exclusion"]) {
        const before = [...base.byUuid.values()].find((item) => item.kind === kind);
        const after = [...rewritten.byUuid.values()].find((item) => item.kind === kind);
        assert.equal(before.uuid, after.uuid);
        assert.equal(before.hash, after.hash);
    }
});

test("fabrication output settings expose selected layers and Gerber choices", () => {
    const output = [...pcb().byUuid.values()].find(
        (item) => item.kind === "fabrication_output",
    );

    assert.deepEqual(output.reviewFields["Plot layers"], ["F.Cu", "Edge.Cuts"]);
    assert.equal(output.reviewFields["Output format"], "Gerber");
    assert.equal(output.reviewFields["Plot component values"], false);
    assert.equal(output.reviewFields["Solder mask expansion (mm)"], 0.05);
});

test("custom design rules ignore formatting but retain authored clauses", () => {
    const compact = index_document(`
        (version 1)
        (rule silk_over_via
          (constraint silk_clearance (min 0.07mm))
          (condition "A.Type == '*Text' && B.Type == 'Via'"))
    `, "board.kicad_dru");
    const reformatted = index_document(`
        # presentation-only comment
        (version 1)
        (rule   silk_over_via (constraint silk_clearance (min 0.07mm))
          (condition "A.Type == '*Text' && B.Type == 'Via'"))
    `, "board.kicad_dru");
    const changed = index_document(`
        (version 1)
        (rule silk_over_via
          (constraint silk_clearance (min 0.08mm))
          (condition "A.Type == '*Text' && B.Type == 'Via'"))
    `, "board.kicad_dru");
    const rule = [...compact.byUuid.values()][0];

    assert.equal(rule.kind, "custom_rule");
    assert.equal(rule.name, "silk_over_via");
    assert.equal(rule.hash, [...reformatted.byUuid.values()][0].hash);
    assert.notEqual(rule.hash, [...changed.byUuid.values()][0].hash);
    assert.match(rule.reviewFields.Constraint, /silk_clearance/);
    assert.match(rule.reviewFields.Condition, /A.Type/);
});

test("schematic bus aliases expose membership as one semantic object", () => {
    const withAlias = sch(SCHEMATIC.replace(
        "  (wire (pts",
        "  (bus_alias DATA (members D0 D1 D2))\n  (wire (pts",
    ));
    const alias = [...withAlias.byUuid.values()].find((item) => item.kind === "bus_alias");

    assert.equal(alias.name, "DATA");
    assert.equal(alias.reviewFields.Members, "D0, D1, D2");
    assert.equal(alias.reviewOnly, true);
});

test("moving a footprint does not disturb its pads", () => {
    const before = pcb();
    const after = pcb(BOARD.replace("(at 1 2)", "(at 9 9)"));
    const pad = "bbbbbbbb-0000-0000-0000-000000000000";
    const footprint = "aaaaaaaa-0000-0000-0000-000000000000";

    assert.notEqual(before.byUuid.get(footprint).hash, after.byUuid.get(footprint).hash);
    assert.equal(before.byUuid.get(pad).hash, after.byUuid.get(pad).hash);
    assert.deepEqual(after.byUuid.get(footprint).at, [9, 9]);
});

test("a regenerated zone fill is not an authored change", () => {
    // KiCad recomputes fills on every board edit. Hashing them would report
    // every zone as modified whenever anything on the board moved.
    const zone = "cccccccc-0000-0000-0000-000000000000";
    const base = pcb().byUuid.get(zone);
    const refilled = pcb(BOARD.replace("(xy 5 0) (xy 5 5)", "(xy 6 0) (xy 6 6)"));
    const reshaped = pcb(BOARD.replace("(xy 10 10)", "(xy 11 11)"));

    assert.equal(base.hash, refilled.byUuid.get(zone).hash);
    assert.notEqual(base.hash, reshaped.byUuid.get(zone).hash);
});

test("net names are resolved from codes", () => {
    // Tracks carry a numeric net code; position_delta groups by net name, so
    // an unresolved code would silently split one net into many.
    const board = pcb();
    assert.equal(board.byUuid.get("dddddddd-0000-0000-0000-000000000000").net, "VBUS");
    assert.equal(board.byUuid.get("bbbbbbbb-0000-0000-0000-000000000000").net, "VBUS");
    assert.equal(board.byUuid.get("cccccccc-0000-0000-0000-000000000000").net, "VBUS");
});

test("PCB net-table renumbering is not a design change", () => {
    const base = pcb();
    const renumbered = pcb(
        BOARD
            .replaceAll('(net 1 "VBUS")', '(net 47 "VBUS")')
            .replaceAll("(net 1)", "(net 47)"),
    );

    for (const uuid of [
        "bbbbbbbb-0000-0000-0000-000000000000",
        "cccccccc-0000-0000-0000-000000000000",
        "dddddddd-0000-0000-0000-000000000000",
        "ffffffff-0000-0000-0000-000000000000",
    ]) {
        assert.equal(base.byUuid.get(uuid).hash, renumbered.byUuid.get(uuid).hash);
    }
});

test("real PCB connectivity and trace geometry edits remain changes", () => {
    const segment = "dddddddd-0000-0000-0000-000000000000";
    const base = pcb();
    const renamedNet = pcb(BOARD.replaceAll("VBUS", "GND"));
    const nudgedTrace = pcb(BOARD.replace("(end 4 0)", "(end 4.015 0)"));

    assert.notEqual(base.byUuid.get(segment).hash, renamedNet.byUuid.get(segment).hash);
    assert.notEqual(base.byUuid.get(segment).hash, nudgedTrace.byUuid.get(segment).hash);
    assert.equal(renamedNet.byUuid.get(segment).net, "GND");
});

test("a track keeps a centroid so position_delta survives", () => {
    // The geometry sidecar M3 deletes is what supplies positions today, and
    // position_delta groups by net over tracks, not only components.
    const segment = pcb().byUuid.get("dddddddd-0000-0000-0000-000000000000");
    assert.deepEqual(segment.at, [2, 0]);
    assert.equal(segment.layer, "F.Cu");
});

test("structured graphic layers cross the object boundary as names", () => {
    const drawing = pcb().byUuid.get(
        "12121212-0000-0000-0000-000000000000",
    );
    assert.equal(drawing.kind, "drawing");
    assert.equal(drawing.layer, "F.SilkS");
});

test("a footprint's path is its schematic symbol's KIID_PATH", () => {
    const footprint = pcb().byUuid.get("aaaaaaaa-0000-0000-0000-000000000000");
    assert.deepEqual(footprint.kiidPaths, ["/aaaa-0001"]);
    assert.equal(footprint.refdes, "R1");
});

test("KiCad 7 footprint text supplies RefDes when no Reference property exists", () => {
    const legacyBoard = BOARD
        .replace('(property "Reference" "R1")', '')
        .replace(
            '(path "/aaaa-0001")',
            '(path "/aaaa-0001")\n    (fp_text reference "R7" (at 0 1) (layer "F.SilkS"))\n    (fp_text value "4.7k" (at 0 -1) (layer "F.Fab"))',
        );
    const indexed = pcb(legacyBoard);
    const footprint = indexed.byUuid.get("aaaaaaaa-0000-0000-0000-000000000000");
    const pad = indexed.byUuid.get("bbbbbbbb-0000-0000-0000-000000000000");

    assert.equal(footprint.refdes, "R7");
    assert.equal(pad.refdes, "R7");
    assert.equal(
        footprint.properties.find((property) => property.name === "Value")?.value,
        "4.7k",
    );
});

test("reformatting is not a change", () => {
    const compact = index_document(
        '(kicad_sch (wire (pts (xy 0 0) (xy 1 0)) (uuid "eeee-0001")))',
        "a.kicad_sch",
    );
    const spaced = index_document(
        '(kicad_sch\n  (wire\n    (pts (xy 0 0)   (xy 1 0))\n    (uuid "eeee-0001")\n  )\n)',
        "a.kicad_sch",
    );
    assert.equal(compact.byUuid.get("eeee-0001").hash, spaced.byUuid.get("eeee-0001").hash);
});

test("point order stays significant", () => {
    // Order is not semantic in a file, but it is in a polygon.
    const first = index_document(
        '(kicad_sch (polyline (pts (xy 0 0) (xy 1 1) (xy 2 0)) (uuid "eeee-0002")))',
        "a.kicad_sch",
    );
    const second = index_document(
        '(kicad_sch (polyline (pts (xy 0 0) (xy 2 0) (xy 1 1)) (uuid "eeee-0002")))',
        "a.kicad_sch",
    );
    assert.notEqual(
        first.byUuid.get("eeee-0002").hash,
        second.byUuid.get("eeee-0002").hash,
    );
});
