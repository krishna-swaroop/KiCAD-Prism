import assert from "node:assert/strict";
import { test } from "node:test";

import { diff_indexes } from "./ecad-diff.mjs";
import { index_document } from "./ecad-parse.mjs";

function object(overrides = {}) {
    return {
        uuid: "11111111-1111-1111-1111-111111111111",
        kind: "wire",
        documentPath: "root.kicad_sch",
        hash: "same",
        at: [1, 2],
        ...overrides,
    };
}

test("added, removed and modified objects are emitted deterministically", () => {
    const unchanged = object();
    const removed = object({
        uuid: "00000000-0000-0000-0000-000000000001",
        at: [8, 8],
    });
    const modified = object({
        uuid: "00000000-0000-0000-0000-000000000002",
        hash: "before",
    });
    const added = object({
        uuid: "00000000-0000-0000-0000-000000000003",
        at: [9, 9],
    });
    const after = {
        ...modified,
        hash: "after",
        at: [4, 6],
    };

    const result = diff_indexes(
        [unchanged, removed, modified],
        [unchanged, after, added],
    );

    assert.deepEqual(
        result.changes.map((change) => [change.uuid, change.status]),
        [
            [removed.uuid, "removed"],
            [modified.uuid, "modified"],
            [added.uuid, "added"],
        ],
    );
    assert.deepEqual(result.changes[1].reasons, ["moved"]);
    assert.deepEqual(result.changes[1].positionDelta, {
        dx: 3,
        dy: 4,
        distance: 5,
    });
    assert.deepEqual(result.counts, {
        added: 1,
        removed: 1,
        modified: 1,
        unchanged: 1,
        ignored: 0,
        baseObjects: 3,
        headObjects: 3,
    });
});

test("derived index fields can change even when the parser hash does not", () => {
    const before = object({
        kind: "pin",
        parentUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        at: [10, 20],
    });
    const after = { ...before, at: [12.5, 19] };

    const result = diff_indexes([before], [after]);

    assert.equal(result.changes.length, 1);
    assert.deepEqual(result.changes[0].reasons, ["moved"]);
    assert.deepEqual(result.changes[0].positionDelta, {
        dx: 2.5,
        dy: -1,
        distance: 2.692582,
    });
});

test("document path is part of identity", () => {
    const before = object({ documentPath: "old.kicad_sch" });
    const after = object({ documentPath: "new.kicad_sch" });

    const result = diff_indexes([before], [after]);

    assert.deepEqual(
        result.changes.map((change) => change.status),
        ["added", "removed"],
    );
});

test("pure KiCad UUID churn is ignored when authored content is identical", () => {
    const before = object({ uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
    const after = object({ uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });

    const result = diff_indexes([before], [after]);

    assert.equal(result.changes.length, 0);
    assert.equal(result.counts.unchanged, 1);
    assert.equal(result.counts.ignored, 1);
    assert.equal(result.ignored[0].reason, "internal-identity-only");
});

test("a recreated sheet pin is paired by interface slot and reports its rename", () => {
    const before = object({
        uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        kind: "sheet_pin",
        parentUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        text: "~{ENABLE}",
        name: "~{ENABLE}",
        reviewFields: { "Sheet pin": "~{ENABLE}", "Electrical type": "input" },
        hash: "before",
    });
    const after = {
        ...before,
        uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        text: "ENABLE",
        name: "ENABLE",
        reviewFields: { "Sheet pin": "ENABLE", "Electrical type": "input" },
        hash: "after",
    };

    const result = diff_indexes([before], [after]);

    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].status, "modified");
    assert.equal(result.changes[0].base.uuid, before.uuid);
    assert.equal(result.changes[0].compare.uuid, after.uuid);
    assert.deepEqual(result.changes[0].properties, [
        { name: "Sheet pin", from: "~{ENABLE}", to: "ENABLE" },
    ]);
});

test("property value and attribute edits are classified", () => {
    const before = object({
        kind: "symbol",
        properties: [{ name: "Value", value: "10k", at: [1, 1] }],
    });
    const after = {
        ...before,
        properties: [{ name: "Value", value: "10k", at: [2, 1] }],
    };

    const result = diff_indexes([before], [after]);

    assert.deepEqual(result.changes[0].reasons, ["properties-changed"]);
    assert.deepEqual(result.changes[0].properties, [
        {
            name: "Value",
            from: "10k",
            to: "10k",
            attributesChanged: true,
            fromAttributes: {
                at: [1, 1],
                rotation: undefined,
                hide: false,
                effects: undefined,
            },
            toAttributes: {
                at: [2, 1],
                rotation: undefined,
                hide: false,
                effects: undefined,
            },
        },
    ]);
});

test("assembly-state changes expose explicit old and new booleans", () => {
    const before = object({
        kind: "symbol",
        dnp: false,
        inBom: true,
        onBoard: true,
    });
    const after = {
        ...before,
        inBom: false,
        onBoard: false,
    };

    const result = diff_indexes([before], [after]);

    assert.deepEqual(result.changes[0].reasons, ["properties-changed"]);
    assert.deepEqual(result.changes[0].properties, [
        { name: "In BOM", from: true, to: false },
        { name: "On board", from: true, to: false },
    ]);
});

test("native style edits are classified as authored content", () => {
    const before = object({ hash: "before" });
    const after = { ...before, hash: "after" };

    const result = diff_indexes([before], [after]);

    assert.deepEqual(result.changes[0].reasons, ["content-changed"]);
    assert.equal(result.byReason["unclassified"], undefined);
});

test("regenerated zone fills are diagnosed but not emitted as changes", () => {
    const before = object({
        kind: "zone",
        documentPath: "board.kicad_pcb",
        generatedHash: "fill-before",
    });
    const after = { ...before, generatedHash: "fill-after" };

    const result = diff_indexes([before], [after]);

    assert.equal(result.changes.length, 0);
    assert.equal(result.counts.ignored, 1);
    assert.deepEqual(
        {
            key: result.ignored[0].key,
            status: result.ignored[0].status,
            reason: result.ignored[0].reason,
            uuid: result.ignored[0].uuid,
            kind: result.ignored[0].kind,
            documentPath: result.ignored[0].documentPath,
            at: result.ignored[0].at,
        },
        {
        key: "board.kicad_pcb#11111111-1111-1111-1111-111111111111",
        status: "ignored",
        reason: "generated-content-only",
        uuid: "11111111-1111-1111-1111-111111111111",
        kind: "zone",
        documentPath: "board.kicad_pcb",
        at: [1, 2],
        },
    );
});

test("route aggregates retain centerline, via span, and used layers", () => {
    const board = index_document(`
        (kicad_pcb
          (version 20240108)
          (net 0 "")
          (net 1 "VCC")
          (segment (start 0 0) (end 3 4) (width 0.2)
            (layer "F.Cu") (net 1)
            (uuid "11111111-1111-1111-1111-111111111111"))
          (via (at 3 4) (size 0.8) (drill 0.4)
            (layers "F.Cu" "B.Cu") (net 1)
            (uuid "22222222-2222-2222-2222-222222222222")))`,
        "board.kicad_pcb",
    );

    assert.equal(board.routeMetrics.VCC.routeLengthMm, 5);
    assert.equal(board.routeMetrics.VCC.viaCount, 1);
    assert.deepEqual(board.routeMetrics.VCC.usedLayers, ["F.Cu", "B.Cu"]);
    assert.deepEqual(board.routeMetrics.VCC.viaSpans, { "F.Cu|B.Cu": 1 });
});

test("pad geometry edits expose exact old and new fabrication values", () => {
    const board = (size) => index_document(`
        (kicad_pcb
          (version 20240108)
          (net 0 "")
          (net 1 "VCC")
          (footprint "QFN" (layer "F.Cu") (at 1 2)
            (uuid "aaaaaaaa-0000-0000-0000-000000000000")
            (property "Reference" "U1")
            (pad "3" smd rect (at 0 0) (size ${size})
              (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "VCC")
              (uuid "bbbbbbbb-0000-0000-0000-000000000000"))))`,
        "board.kicad_pcb",
    );
    const base = board("1 1");
    const head = board("1.5 0.8");

    const result = diff_indexes(
        [...base.byUuid.values()],
        [...head.byUuid.values()],
    );
    const change = result.changes.find((item) => item.kind === "pad");

    assert.deepEqual(change.reasons, ["properties-changed"]);
    assert.deepEqual(
        change.properties.find((field) => field.name === "Size"),
        { name: "Size", from: "1 × 1", to: "1.5 × 0.8" },
    );
    assert.equal(change.compare.refdes, "U1");
    assert.equal(change.compare.number, "3");
});

test("additions and removals retain review evidence for the missing side", () => {
    const added = object({
        uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        kind: "via",
        documentPath: "board.kicad_pcb",
        layer: "F.Cu",
        net: "GND",
        reviewFields: { Diameter: 0.8, Drill: 0.4 },
    });

    const addition = diff_indexes([], [added]).changes[0];
    const removal = diff_indexes([added], []).changes[0];
    assert.deepEqual(
        addition.properties.find((field) => field.name === "Diameter"),
        { name: "Diameter", from: undefined, to: 0.8 },
    );
    assert.deepEqual(
        removal.properties.find((field) => field.name === "Drill"),
        { name: "Drill", from: 0.4, to: undefined },
    );
});

test("net-class rule and assignment changes are explicit old/new evidence", () => {
    const project = (trackWidth, assignedClass) => index_document(JSON.stringify({
        net_settings: {
            classes: [{ name: "USB", clearance: 0.2, track_width: trackWidth }],
            netclass_assignments: { "/USB D+": assignedClass },
        },
    }), "board.kicad_pro");
    const base = project(0.18, "Default");
    const head = project(0.2, "USB");

    const result = diff_indexes(
        [...base.byUuid.values()],
        [...head.byUuid.values()],
    );
    const classChange = result.changes.find((item) => item.kind === "net_class");
    const assignmentChange = result.changes.find(
        (item) => item.kind === "net_class_assignment",
    );

    assert.deepEqual(
        classChange.properties.find((field) => field.name === "Track width"),
        { name: "Track width", from: 0.18, to: 0.2 },
    );
    assert.deepEqual(
        assignmentChange.properties.find((field) => field.name === "Net class"),
        { name: "Net class", from: "Default", to: "USB" },
    );
    assert.equal(classChange.compare.reviewOnly, true);
});

test("recreated board objects with identical authored content are not review changes", () => {
    const board = (suffix) => `
        (kicad_pcb
          (version 20240108)
          (net 0 "")
          (net 1 "VBUS")
          (footprint "R_0402" (layer "F.Cu") (at 1 2)
            (uuid "aaaaaaaa-0000-0000-0000-0000000000${suffix}")
            (property "Reference" "R1")
            (fp_line (start 0 0) (end 1 0) (stroke (width 0.1) (type solid))
              (layer "F.SilkS")
              (uuid "eeeeeeee-0000-0000-0000-0000000000${suffix}"))
            (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "VBUS")
              (uuid "ffffffff-0000-0000-0000-0000000000${suffix}")))
          (segment (start 0 0) (end 4 0) (width 0.2)
            (layer "F.Cu") (net 1)
            (uuid "bbbbbbbb-0000-0000-0000-0000000000${suffix}"))
          (via (at 2 0) (size 0.8) (drill 0.4)
            (layers "F.Cu" "B.Cu") (net 1)
            (uuid "cccccccc-0000-0000-0000-0000000000${suffix}"))
          (zone (net 1) (net_name "VBUS") (layer "F.Cu")
            (uuid "dddddddd-0000-0000-0000-0000000000${suffix}")
            (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10)))))`;
    const base = index_document(board("01"), "board.kicad_pcb");
    const head = index_document(board("02"), "board.kicad_pcb");

    const result = diff_indexes(
        [...base.byUuid.values()],
        [...head.byUuid.values()],
    );

    assert.equal(result.changes.length, 0);
    assert.equal(result.counts.ignored, 6);
    assert.equal(result.counts.unchanged, 6);
});
