import { describe, expect, it } from "vitest";
import {
    createGroupingContext,
    groupChanges,
} from "./comparison-review-groups";
import {
    prepareChangesForReview,
    semanticNetRenames,
} from "./comparison-review-noise";
import {
    groupDocumentEntries,
    groupSummary,
} from "./comparison-review-queue";
import type { BomDiff, ChangeItem } from "./types";

/**
 * The review pipeline, end to end: parser events in, review rows out.
 *
 * Noise suppression and grouping are separate modules but not separable
 * behaviours — "a board-wide net rename collapses to one review item" is only
 * true because `prepareChangesForReview` marks the followers derivative *and*
 * `groupChanges` buckets them onto the rename. Testing either half alone would
 * assert something no reviewer ever sees, so these drive both.
 */

function schematicChange(overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: "change-1",
        kind: "changed",
        domain: "schematic",
        category: "components",
        classification: "primary",
        label: "U1",
        reference: "U1",
        semantic_id: "cmp:u1",
        object_kind: "symbol",
        page: "main.kicad_sch",
        reasons: ["properties-changed"],
        ...overrides,
    };
}

describe("review-focused comparison grouping", () => {

    it("omits pure pin movement that only follows symbol geometry", () => {
        const result = prepareChangesForReview([
            schematicChange({
                id: "pin-move",
                object_kind: "pin",
                semantic_id: "pin:1",
                reasons: ["moved"],
                fields: { Position: { old: "10, 10", new: "20, 10" } },
            }),
        ]);

        expect(result.changes).toEqual([]);
        expect(result.suppressedCount).toBe(1);
    });

    it("omits added and removed child pins when their parent symbol already carries the event", () => {
        const result = prepareChangesForReview([
            schematicChange({ id: "symbol-added", kind: "added", reasons: ["object-added"] }),
            schematicChange({
                id: "pin-added",
                kind: "added",
                object_kind: "pin",
                semantic_id: "pin:1",
                reasons: ["object-added"],
            }),
        ]);

        expect(result.changes.map((change) => change.id)).toEqual(["symbol-added"]);
        expect(result.suppressedCount).toBe(1);
    });

    it("keeps an electrically meaningful pin edit", () => {
        const result = prepareChangesForReview([
            schematicChange({
                id: "pin-rename",
                object_kind: "pin",
                semantic_id: "pin:1",
                reasons: ["renamed"],
                fields: { Name: { old: "IN", new: "ENABLE" } },
            }),
        ]);

        expect(result.changes).toHaveLength(1);
        expect(result.changes[0]?.classification).toBe("primary");
    });

    it("omits derivative pin reference renames already carried by the symbol", () => {
        const result = prepareChangesForReview([
            schematicChange({
                id: "symbol-rename",
                fields: { Reference: { old: "R57", new: "R118" } },
                reasons: ["renamed"],
            }),
            schematicChange({
                id: "pin-reference",
                category: "nets",
                object_kind: "pin",
                semantic_id: "pin:1",
                fields: { Reference: { old: "R57", new: "R118" } },
                reasons: ["renamed"],
            }),
        ]);

        expect(result.changes.map((change) => change.id)).toEqual(["symbol-rename"]);
        expect(result.suppressedCount).toBe(1);
    });

    it("moves same-page symbol coordinate and field-placement edits to optional layout evidence", () => {
        const result = prepareChangesForReview([
            schematicChange({
                reasons: ["moved", "properties-changed"],
                fields: {
                    Position: { old: "10, 10", new: "20, 10" },
                    "Value attributes": {
                        old: { at: [10, 12] },
                        new: { at: [20, 12] },
                    },
                },
            }),
        ]);

        expect(result.changes[0]?.classification).toBe("secondary");
        expect(groupChanges(result.changes)[0]).toMatchObject({
            category: "graphics",
            label: "Layout-only changes",
        });
    });

    it("keeps actual component field changes primary and summarizes readable values", () => {
        const result = prepareChangesForReview([
            schematicChange({
                reasons: ["moved", "properties-changed"],
                fields: {
                    Position: { old: "10, 10", new: "20, 10" },
                    Value: { old: "10k", new: "4.7k" },
                },
            }),
        ]);
        const group = groupChanges(result.changes)[0]!;

        expect(group.classification).toBe("primary");
        expect(groupSummary(group)).toBe("Value: 10k → 4.7k");
    });

    it("treats whitespace-only field normalization as layout noise", () => {
        const result = prepareChangesForReview([
            schematicChange({
                reasons: ["moved", "properties-changed"],
                fields: {
                    Datasheet: { old: " ~", new: "~" },
                    Position: { old: "10, 10", new: "20, 10" },
                },
            }),
        ]);

        expect(result.changes[0]?.classification).toBe("secondary");
    });

    it("suppresses derivative semantic bus geometry instead of exposing raw content JSON", () => {
        const stable = {
            busUid: "bus:1",
            kind: "bus",
            page: "main.kicad_sch",
            sheetPath: "/Power/",
            sourceUuid: "native-1",
            at: null,
            size: null,
        };
        const result = prepareChangesForReview([
            schematicChange({
                id: "semantic-bus-geometry",
                category: "nets",
                reference: null,
                object_kind: "bus",
                reasons: ["content-changed"],
                fields: {
                    busContent: {
                        old: JSON.stringify({ ...stable, points: [[10, 10], [10, 20]] }),
                        new: JSON.stringify({ ...stable, points: [[12, 10], [12, 20]] }),
                    },
                },
            }),
        ]);

        expect(result.changes).toEqual([]);
        expect(result.suppressedCount).toBe(1);
    });

    it("keeps a structured bus change when non-geometric semantics differ", () => {
        const result = prepareChangesForReview([
            schematicChange({
                id: "semantic-bus-interface",
                category: "nets",
                reference: null,
                object_kind: "bus",
                reasons: ["content-changed"],
                fields: {
                    busContent: {
                        old: JSON.stringify({ kind: "bus", page: "main.kicad_sch", name: "D[0..7]", points: [] }),
                        new: JSON.stringify({ kind: "bus", page: "main.kicad_sch", name: "D[0..15]", points: [] }),
                    },
                },
            }),
        ]);

        expect(result.changes).toHaveLength(1);
        expect(result.changes[0]?.classification).toBe("primary");
    });

    it("deduplicates native label renames already represented by a semantic net rename", () => {
        const semanticRename = schematicChange({
            id: "semantic-net-rename",
            category: "nets",
            reference: null,
            net: "/Expansion/PMOD_A7",
            object_kind: undefined,
            reasons: ["net-renamed"],
            fields: { name: { old: "/Expansion/PMOD_A4", new: "/Expansion/PMOD_A7" } },
        });
        const nativeLabel = schematicChange({
            id: "native-label-rename",
            category: "nets",
            reference: null,
            net: "PMOD_A7",
            object_kind: "label",
            reasons: ["net-changed", "properties-changed"],
            fields: {
                Net: { old: "PMOD_A4", new: "PMOD_A7" },
                Text: { old: "PMOD_A4", new: "PMOD_A7" },
            },
        });

        const result = prepareChangesForReview([semanticRename, nativeLabel]);

        expect(result.changes.map((change) => change.id)).toEqual(["semantic-net-rename"]);
        expect(result.suppressedCount).toBe(1);
    });

    it("suppresses generated unconnected-net renames with no electrical change", () => {
        const result = prepareChangesForReview([
            schematicChange({
                category: "nets",
                reference: null,
                net: "unconnected-(U1-Pad2)",
                object_kind: undefined,
                reasons: ["net-renamed"],
                fields: {
                    name: {
                        old: "unconnected-(U1-OLD-Pad2)",
                        new: "unconnected-(U1-NEW-Pad2)",
                    },
                },
            }),
        ]);

        expect(result.changes).toEqual([]);
        expect(result.suppressedCount).toBe(1);
    });

    it("never demotes connectivity or net changes", () => {
        const result = prepareChangesForReview([
            schematicChange({
                category: "nets",
                object_kind: "wire",
                reference: null,
                net: "USB_D+",
                reasons: ["moved", "net-changed"],
            }),
        ]);

        expect(result.changes[0]?.classification).toBe("primary");
    });

    it("collapses unnetted wiring additions and removals into one page-level review item", () => {
        const prepared = prepareChangesForReview([
            schematicChange({
                id: "wire-add",
                kind: "added",
                category: "nets",
                object_kind: "wire",
                reference: null,
                semantic_id: "wire:1",
                reasons: ["object-added"],
            }),
            schematicChange({
                id: "junction-remove",
                kind: "removed",
                category: "nets",
                object_kind: "junction",
                reference: null,
                semantic_id: "junction:1",
                reasons: ["object-removed"],
            }),
        ]);
        const groups = groupChanges(prepared.changes);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({
            label: "Wiring changes",
            kind: "changed",
            classification: "secondary",
        });
        expect(groupSummary(groups[0]!)).toContain("1 added · 1 removed");
    });

    it("collapses all layout-only geometry on a page into one optional entry", () => {
        const prepared = prepareChangesForReview([
            schematicChange({ id: "symbol-move", reasons: ["moved"] }),
            schematicChange({
                id: "wire-move",
                category: "nets",
                object_kind: "wire",
                reference: null,
                semantic_id: "wire:1",
                reasons: ["moved"],
            }),
        ]);
        const groups = groupChanges(prepared.changes);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.changes).toHaveLength(2);
        expect(groupSummary(groups[0]!)).toMatch(/1 symbol.*1 wire/);
    });

    it("turns a same-reference remove/add across pages into one component relocation", () => {
        const groups = groupChanges([
            schematicChange({
                id: "old-fl3",
                kind: "removed",
                label: "FL3",
                reference: "FL3",
                semantic_id: "cmp:fl3",
                page: "usb_phy.kicad_sch",
                reasons: ["object-removed"],
            }),
            schematicChange({
                id: "new-fl3",
                kind: "added",
                label: "FL3",
                reference: "FL3",
                semantic_id: "cmp:fl3",
                page: "control_port.kicad_sch",
                reasons: ["object-added"],
            }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.label).toBe("FL3");
        expect(groupSummary(groups[0]!)).toBe(
            "Moved: usb_phy.kicad_sch → control_port.kicad_sch",
        );
        expect(groupDocumentEntries(groups[0]!)).toHaveLength(2);
    });

    it("groups PCB routing by net while keeping pads and zones exact", () => {
        const base = schematicChange({ domain: "pcb", page: "board.kicad_pcb" });
        const groups = groupChanges([
            { ...base, id: "track", category: "nets", object_kind: "track", net: "GND", semantic_id: "track:1" },
            { ...base, id: "via", category: "nets", object_kind: "via", net: "GND", semantic_id: "via:1" },
            { ...base, id: "pad", category: "components", object_kind: "pad", semantic_id: "pad:1" },
            { ...base, id: "pad-2", category: "components", object_kind: "pad", semantic_id: "pad:2" },
            { ...base, id: "zone", category: "zones", object_kind: "zone", reference: null, net: "GND", semantic_id: "zone:1" },
        ]);

        expect(groups).toHaveLength(3);
        expect(groups.find((group) => group.label === "GND routing")?.changes).toHaveLength(2);
        expect(groups.find((group) => group.label === "U1")?.changes).toHaveLength(2);
        expect(groups.find((group) => group.category === "zones")?.changes).toHaveLength(1);
    });

    it("suppresses footprint-owned primitives when the whole component is added", () => {
        const base = schematicChange({
            domain: "pcb",
            kind: "added",
            page: "board.kicad_pcb",
            reasons: ["object-added"],
        });
        const prepared = prepareChangesForReview([
            { ...base, id: "footprint", object_kind: "footprint" },
            { ...base, id: "pad", object_kind: "pad", semantic_id: "pad:1" },
            { ...base, id: "silk", object_kind: "footprint_graphic", semantic_id: "silk:1" },
        ]);

        expect(prepared.changes.map((change) => change.id)).toEqual(["footprint"]);
        expect(prepared.suppressedCount).toBe(2);
    });

    it("rolls component-owned artwork and pad geometry into one component review item", () => {
        const base = schematicChange({
            domain: "pcb",
            page: "board.kicad_pcb",
        });
        const groups = groupChanges([
            { ...base, id: "footprint", object_kind: "footprint" },
            { ...base, id: "pad", object_kind: "pad", semantic_id: "pad:1" },
            { ...base, id: "fab", category: "graphics", object_kind: "footprint_graphic", semantic_id: "fab:1" },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ category: "components", label: "U1" });
        expect(groups[0]?.changes).toHaveLength(3);
    });

    it("rolls a component's pad net reassignments into one review item", () => {
        // A pin swap across a BGA touches dozens of pads on one part. Listing
        // each pad separately buries the fact that it is one decision about
        // one component.
        const base = schematicChange({
            domain: "pcb",
            page: "board.kicad_pcb",
            reference: "IC1",
            label: "IC1",
            object_kind: "pad",
            category: "nets",
            reasons: ["net-changed"],
        });
        const groups = groupChanges([
            {
                ...base,
                id: "pad-b6",
                semantic_id: "pad:b6",
                fields: { Net: { old: "PMOD_B6", new: "PMOD_B9" } },
            },
            {
                ...base,
                id: "pad-a2",
                semantic_id: "pad:a2",
                fields: { Net: { old: "PMOD_A2", new: "PMOD_A5" } },
            },
            {
                ...base,
                id: "pad-a5",
                semantic_id: "pad:a5",
                fields: { Net: { old: "PMOD_A5", new: "PMOD_A8" } },
            },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ label: "IC1", category: "nets" });
        expect(groups[0]?.changes).toHaveLength(3);
    });

    it("collapses a board-wide net rename cascade into one derived review item", () => {
        // Renaming one schematic net makes KiCad rewrite the net reference on
        // every track, via and pad that carries it. That is one authored edit,
        // owned by the schematic, not hundreds of board decisions.
        const renames = semanticNetRenames([
            schematicChange({
                id: "net-rename",
                category: "nets",
                object_kind: "net",
                reference: null,
                reasons: ["net-renamed"],
                fields: {
                    name: { old: "/Debugger/MCU_SWDCLK", new: "/Debugger/MCU_SWCLK" },
                },
            }),
        ]);
        const base = schematicChange({
            domain: "pcb",
            page: "board.kicad_pcb",
            reference: null,
            category: "nets",
            reasons: ["net-changed"],
            net: "/Debugger/MCU_SWCLK",
            fields: {
                Net: { old: "/Debugger/MCU_SWDCLK", new: "/Debugger/MCU_SWCLK" },
            },
        });
        const prepared = prepareChangesForReview(
            [
                { ...base, id: "track-1", object_kind: "track", semantic_id: "t:1" },
                { ...base, id: "via-1", object_kind: "via", semantic_id: "v:1" },
                {
                    ...base,
                    id: "pad-1",
                    object_kind: "pad",
                    reference: "U5",
                    label: "U5",
                    semantic_id: "p:1",
                },
            ],
            { netRenames: renames },
        );

        expect(prepared.changes.every((change) => (
            change.classification === "secondary"
        ))).toBe(true);
        const groups = groupChanges(prepared.changes);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.label).toBe("/Debugger/MCU_SWCLK");
        expect(groups[0]?.changes).toHaveLength(3);
        expect(groupSummary(groups[0]!)).toContain(
            "Renamed from /Debugger/MCU_SWDCLK",
        );
    });

    it("keeps a real net reassignment primary when no rename explains it", () => {
        // The net lost terminals rather than being renamed, so the copper's new
        // net membership is a genuine electrical change.
        const prepared = prepareChangesForReview(
            [schematicChange({
                id: "track-1",
                domain: "pcb",
                page: "board.kicad_pcb",
                reference: null,
                category: "nets",
                object_kind: "track",
                reasons: ["net-changed"],
                net: "Net-(U16-1D-)",
                fields: {
                    Net: {
                        old: "/CONTROL Port/CONTROL PHY/PHY_D+",
                        new: "Net-(U16-1D-)",
                    },
                },
            })],
            { netRenames: new Set(["/Debugger/MCU_SWDCLK /Debugger/MCU_SWCLK"]) },
        );

        expect(prepared.changes[0]?.classification).toBe("primary");
        expect(prepared.changes[0]?.derivedFrom).toBeUndefined();
    });

    it("keeps a net-renamed object primary when it also moved", () => {
        const renames = new Set(["OLD NEW"]);
        const prepared = prepareChangesForReview(
            [schematicChange({
                id: "track-1",
                domain: "pcb",
                page: "board.kicad_pcb",
                reference: null,
                category: "nets",
                object_kind: "track",
                reasons: ["net-changed", "moved"],
                net: "NEW",
                fields: { Net: { old: "OLD", new: "NEW" } },
            })],
            { netRenames: renames },
        );

        expect(prepared.changes[0]?.classification).toBe("primary");
    });

    it("summarizes a PCB component from its footprint or pad evidence, not artwork metadata", () => {
        const base = schematicChange({
            domain: "pcb",
            page: "board.kicad_pcb",
        });
        const group = groupChanges([
            {
                ...base,
                id: "fab",
                category: "graphics",
                object_kind: "footprint_graphic",
                semantic_id: "fab:1",
                fields: { Layer: { old: "F.Fab", new: "B.Fab" } },
            },
            {
                ...base,
                id: "footprint",
                object_kind: "footprint",
                fields: { Description: { old: "Filter", new: "EMI filter" } },
            },
        ])[0]!;

        expect(groupSummary(group)).toBe("Description: Filter → EMI filter");
    });

    it("groups rule assignments and DRC waivers without mixing rule families", () => {
        const base = schematicChange({
            domain: "pcb",
            category: "rules",
            reference: null,
            page: "board.kicad_pro",
        });
        const groups = groupChanges([
            { ...base, id: "assignment-a", object_kind: "net_class_assignment", label: "USB_D+" },
            { ...base, id: "assignment-b", object_kind: "net_class_assignment", label: "USB_D-" },
            { ...base, id: "exclusion-a", object_kind: "drc_exclusion", label: "Courtyard overlap" },
            { ...base, id: "constraint", object_kind: "board_constraint", label: "Board constraints" },
        ]);

        expect(groups.map((group) => group.label)).toEqual([
            "Board constraints",
            "DRC exclusions",
            "Net class assignments",
        ]);
        expect(groups.find((group) => group.label === "Net class assignments")?.changes).toHaveLength(2);
    });

    it("collapses secondary PCB documentation graphics by layer and kind", () => {
        const base = schematicChange({
            domain: "pcb",
            category: "graphics",
            classification: "secondary",
            object_kind: "graphic",
            reference: null,
            layers: ["Dwgs.User"],
        });
        const groups = groupChanges([
            { ...base, id: "graphic-1", semantic_id: "graphic:1" },
            { ...base, id: "graphic-2", semantic_id: "graphic:2" },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({
            label: "Dwgs.User graphic",
            classification: "secondary",
        });
    });
});

describe("component grouping by BOM identity", () => {
    const MPN = "Manufacturer Part Number";

    function capacitor(reference: string, overrides: Partial<ChangeItem> = {}) {
        return schematicChange({
            id: `change-${reference}`,
            label: reference,
            reference,
            semantic_id: `cmp:${reference.toLocaleLowerCase()}`,
            // An authored value edit, not the shared helper's default
            // "properties-changed", which with no fields reads as layout noise
            // and never reaches the component branch.
            reasons: ["symbol-fields-changed"],
            ...overrides,
        });
    }

    function bom(
        rows: Array<{
            ref: string;
            oldValue?: string;
            newValue?: string;
            oldMpn?: string;
            newMpn?: string;
        }>,
        fields: string[] = ["Reference", "Value", MPN],
    ): BomDiff {
        return {
            summary: { added: 0, removed: 0, changed: rows.length },
            fields,
            changes: rows.map((row) => ({
                ref: row.ref,
                status: "changed" as const,
                old: row.oldValue === undefined && row.oldMpn === undefined
                    ? undefined
                    : { Value: row.oldValue ?? "", [MPN]: row.oldMpn ?? "" },
                new: row.newValue === undefined && row.newMpn === undefined
                    ? undefined
                    : { Value: row.newValue ?? "", [MPN]: row.newMpn ?? "" },
            })),
        };
    }

    it("collapses instances that made the same value transition into one row", () => {
        // Four of the project's 100nF capacitors become 470nF at the same part
        // number. That is one decision, so it is one review item.
        const changed = ["C1", "C2", "C3", "C4"];
        const groups = groupChanges(
            changed.map((reference) => capacitor(reference)),
            [],
            createGroupingContext([], bom(changed.map((ref) => ({
                ref,
                oldValue: "100nF",
                newValue: "470nF",
                oldMpn: "CL10B104KB8NNNC",
                newMpn: "CL10B104KB8NNNC",
            })))),
        );

        expect(groups).toHaveLength(1);
        expect(groups[0]!.references).toEqual(["C1", "C2", "C3", "C4"]);
        expect(groups[0]!.label).toBe("100nF → 470nF");
    });

    it("splits rows when the instances transitioned to different values", () => {
        const groups = groupChanges(
            ["C1", "C2", "C3", "C4"].map((reference) => capacitor(reference)),
            [],
            createGroupingContext([], bom([
                { ref: "C1", oldValue: "100nF", newValue: "470nF", oldMpn: "M1", newMpn: "M1" },
                { ref: "C2", oldValue: "100nF", newValue: "470nF", oldMpn: "M1", newMpn: "M1" },
                { ref: "C3", oldValue: "100nF", newValue: "220nF", oldMpn: "M1", newMpn: "M1" },
                { ref: "C4", oldValue: "100nF", newValue: "220nF", oldMpn: "M1", newMpn: "M1" },
            ])),
        );

        expect(groups.map((group) => [group.label, group.references])).toEqual([
            ["100nF → 220nF", ["C3", "C4"]],
            ["100nF → 470nF", ["C1", "C2"]],
        ]);
    });

    it("keeps the same value on different part numbers as separate rows", () => {
        const groups = groupChanges(
            ["C1", "C2"].map((reference) => capacitor(reference)),
            [],
            createGroupingContext([], bom([
                { ref: "C1", oldValue: "100nF", newValue: "470nF", oldMpn: "M1", newMpn: "M1" },
                { ref: "C2", oldValue: "100nF", newValue: "470nF", oldMpn: "M2", newMpn: "M2" },
            ])),
        );

        expect(groups).toHaveLength(2);
        // Colliding labels are qualified by part number so the two rows cannot
        // be mistaken for a duplicate.
        expect(groups.map((group) => group.label).sort()).toEqual([
            "100nF → 470nF (M1)",
            "100nF → 470nF (M2)",
        ]);
    });

    it("recognises the part-number column whatever the project calls it", () => {
        for (const column of ["MPN", "Mfr Part Number", "manufacturer_part_no"]) {
            const groups = groupChanges(
                [capacitor("C1"), capacitor("C2")],
                [],
                createGroupingContext([], {
                    summary: { added: 0, removed: 0, changed: 2 },
                    fields: ["Reference", "Value", column],
                    changes: ["C1", "C2"].map((ref) => ({
                        ref,
                        status: "changed" as const,
                        old: { Value: "100nF", [column]: "M1" },
                        new: { Value: "470nF", [column]: "M1" },
                    })),
                }),
            );
            expect(groups, column).toHaveLength(1);
            expect(groups[0]!.references, column).toEqual(["C1", "C2"]);
        }
    });

    it("falls back to the change's own fields when no BOM was built", () => {
        const groups = groupChanges(
            [
                capacitor("C1", {
                    fields: { Value: { old: "100nF", new: "470nF" } },
                }),
                capacitor("C2", {
                    fields: { Value: { old: "100nF", new: "470nF" } },
                }),
            ],
            [],
            null,
        );

        expect(groups).toHaveLength(1);
        expect(groups[0]!.label).toBe("100nF → 470nF");
        expect(groups[0]!.references).toEqual(["C1", "C2"]);
    });

    it("falls back to one row per designator when the part cannot be named", () => {
        const groups = groupChanges(
            [capacitor("C1"), capacitor("C2")],
            [],
            null,
        );

        expect(groups.map((group) => group.label)).toEqual(["C1", "C2"]);
        expect(groups.map((group) => group.references)).toEqual([["C1"], ["C2"]]);
    });

    it("does not invent an old side for an added component", () => {
        const groups = groupChanges(
            [capacitor("C9", { kind: "added", fields: { Value: "470nF" } })],
            [],
            null,
        );

        expect(groups[0]!.label).toBe("470nF");
    });
});

describe("copper grouped by conductor across a net rename", () => {
    function copper(overrides: Partial<ChangeItem> = {}): ChangeItem {
        return schematicChange({
            domain: "pcb",
            category: "nets",
            reference: null,
            object_kind: "track",
            semantic_id: null,
            ...overrides,
        });
    }

    it("keeps one physical trace in one review item when its net is renamed", () => {
        // Renaming a net leaves the copper in place and rewrites the net
        // reference on every object, so those arrive as `changed` carrying the
        // NEW name while anything genuinely deleted still carries the old one.
        // Bucketing on the current name split one trace across an "Added
        // <new>" row and a "Removed <old>" row, and selecting either
        // highlighted only its share of the trace.
        //
        // The production path marks the rewrites as `derivedFrom` via
        // prepareChangesForReview; removals on the old name must still join
        // that same row.
        const renames = semanticNetRenames([
            schematicChange({
                id: "semantic-aux-rename",
                category: "nets",
                object_kind: "net",
                reference: null,
                reasons: ["net-renamed"],
                fields: {
                    name: {
                        old: "/AUX/AUX.SBU2S",
                        new: "/AUX/AUX_TYPE_C.SBU2S",
                    },
                },
            }),
        ]);
        const renetted = Array.from({ length: 11 }, (_, index) => copper({
            id: `renetted-${index}`,
            kind: "changed",
            net: "/AUX/AUX_TYPE_C.SBU2S",
            reasons: ["net-changed"],
            fields: {
                Net: { old: "/AUX/AUX.SBU2S", new: "/AUX/AUX_TYPE_C.SBU2S" },
            },
        }));
        const deleted = Array.from({ length: 2 }, (_, index) => copper({
            id: `deleted-${index}`,
            kind: "removed",
            net: "/AUX/AUX.SBU2S",
            reasons: ["object-removed"],
        }));

        const prepared = prepareChangesForReview(
            [...renetted, ...deleted],
            { netRenames: renames },
        );
        const groups = groupChanges(
            prepared.changes,
            [],
            createGroupingContext(prepared.changes),
        );

        expect(groups).toHaveLength(1);
        expect(groups[0]!.changes).toHaveLength(13);
        expect(groups[0]!.label).toBe("/AUX/AUX_TYPE_C.SBU2S");
    });

    it("merges renamed copper by alias when prepare never marked the rewrite", () => {
        // No schematic rename in hand: the copper's own old/new Net pairs are
        // the only evidence. Aliasing still has to keep one conductor together.
        const renetted = Array.from({ length: 11 }, (_, index) => copper({
            id: `renetted-${index}`,
            kind: "changed",
            net: "/AUX/AUX_TYPE_C.SBU2S",
            reasons: ["net-changed"],
            fields: {
                Net: { old: "/AUX/AUX.SBU2S", new: "/AUX/AUX_TYPE_C.SBU2S" },
            },
        }));
        const deleted = Array.from({ length: 2 }, (_, index) => copper({
            id: `deleted-${index}`,
            kind: "removed",
            net: "/AUX/AUX.SBU2S",
            reasons: ["object-removed"],
        }));

        const groups = groupChanges([...renetted, ...deleted]);

        expect(groups).toHaveLength(1);
        expect(groups[0]!.changes).toHaveLength(13);
        expect(groups[0]!.label)
            .toBe("/AUX/AUX.SBU2S \u2192 /AUX/AUX_TYPE_C.SBU2S routing");
    });

    it("leaves an untouched net named plainly", () => {
        const groups = groupChanges([
            copper({ id: "a", kind: "removed", net: "GND", reasons: ["object-removed"] }),
            copper({ id: "b", kind: "removed", net: "GND", reasons: ["object-removed"] }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]!.label).toBe("GND routing");
    });

    it("does not merge two conductors that merely changed net", () => {
        // A net reassignment that is not a rename moves copper onto a
        // different circuit; those are separate decisions.
        const groups = groupChanges([
            copper({
                id: "a",
                kind: "changed",
                net: "VCC",
                reasons: ["net-changed"],
                fields: { Net: { old: "VBUS", new: "VCC" } },
            }),
            copper({
                id: "b",
                kind: "changed",
                net: "VCC",
                reasons: ["net-changed"],
                fields: { Net: { old: "V5", new: "VCC" } },
            }),
        ]);

        expect(groups.map((group) => group.changes.length).sort()).toEqual([1, 1]);
    });

    it("survives a rename chain without looping", () => {
        const groups = groupChanges([
            copper({
                id: "a",
                kind: "changed",
                net: "C",
                reasons: ["net-changed"],
                fields: { Net: { old: "B", new: "C" } },
            }),
            copper({
                id: "b",
                kind: "changed",
                net: "B",
                reasons: ["net-changed"],
                fields: { Net: { old: "A", new: "B" } },
            }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]!.changes).toHaveLength(2);
    });
});
