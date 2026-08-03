import { describe, expect, it } from "vitest";
import {
    presentationForSelection,
    recommendPresentationForChange,
    recommendPresentationForChanges,
} from "./comparison-review-policy";
import type { ComparisonPresentationMode } from "./comparison-url";
import type { ChangeItem } from "./types";

function reviewChange(overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: "change-1",
        kind: "changed",
        domain: "schematic",
        category: "graphics",
        classification: "primary",
        label: "Change",
        object_kind: "graphic",
        reasons: ["content-changed"],
        ...overrides,
    };
}

type PolicyCase = {
    name: string;
    change: Partial<ChangeItem>;
    mode: ComparisonPresentationMode;
};

const schematicCases: PolicyCase[] = [
    {
        name: "added symbol",
        change: { kind: "added", category: "components", object_kind: "symbol", reasons: ["object-added"] },
        mode: "composite",
    },
    {
        name: "removed symbol",
        change: { kind: "removed", category: "components", object_kind: "symbol", reasons: ["object-removed"] },
        mode: "composite",
    },
    {
        name: "symbol field edit",
        change: {
            category: "components",
            object_kind: "symbol",
            reasons: ["symbol-fields-changed"],
            fields: { Value: { old: "10k", new: "4.7k" } },
        },
        mode: "old-new",
    },
    {
        name: "symbol placement edit",
        change: { category: "components", object_kind: "symbol", reasons: ["moved"] },
        mode: "side-by-side",
    },
    {
        name: "symbol library replacement",
        change: { category: "components", object_kind: "symbol", reasons: ["lib-changed"] },
        mode: "side-by-side",
    },
    {
        name: "pin edit",
        change: { category: "nets", object_kind: "pin", reasons: ["content-changed"] },
        mode: "side-by-side",
    },
    {
        name: "power symbol edit",
        change: {
            category: "components",
            object_kind: "symbol",
            reference: "#PWR0118",
            label: "#PWR0118",
            reasons: ["properties-changed"],
            fields: { Value: { old: "GND", new: "+3V3" } },
        },
        mode: "side-by-side",
    },
    {
        name: "no-connect marker",
        change: { kind: "added", category: "nets", object_kind: "no_connect", reasons: ["object-added"] },
        mode: "side-by-side",
    },
    {
        name: "bus entry",
        change: { kind: "removed", category: "nets", object_kind: "bus_entry", reasons: ["object-removed"] },
        mode: "side-by-side",
    },
    {
        name: "hierarchical sheet",
        change: { kind: "added", category: "sheets", object_kind: "sheet", reasons: ["object-added"] },
        mode: "side-by-side",
    },
    {
        name: "instance replacement",
        change: { category: "components", object_kind: "symbol", reasons: ["instance-replaced"] },
        mode: "side-by-side",
    },
    {
        name: "connectivity change",
        change: { category: "nets", object_kind: "wire", reasons: ["connectivity-changed"] },
        mode: "side-by-side",
    },
    {
        name: "bus membership",
        change: { category: "nets", object_kind: "bus", reasons: ["bus-membership-changed"] },
        mode: "side-by-side",
    },
    {
        name: "net rename",
        change: { category: "nets", object_kind: "label", reasons: ["net-renamed"] },
        mode: "side-by-side",
    },
    {
        name: "added wire",
        change: { kind: "added", category: "nets", object_kind: "wire", reasons: ["object-added"] },
        mode: "composite",
    },
    {
        name: "removed label",
        change: { kind: "removed", category: "nets", object_kind: "label", reasons: ["object-removed"] },
        mode: "composite",
    },
    {
        name: "added logical net",
        change: {
            kind: "added",
            category: "nets",
            object_kind: "net",
            net: "VBUS",
            reasons: ["object-added"],
        },
        mode: "composite",
    },
    {
        name: "added junction",
        change: { kind: "added", category: "nets", object_kind: "junction", reasons: ["object-added"] },
        mode: "composite",
    },
    {
        name: "modified label text",
        change: {
            category: "nets",
            object_kind: "label",
            reasons: ["renamed"],
            fields: { Text: { old: "SDA", new: "I2C_SDA" } },
        },
        mode: "side-by-side",
    },
    {
        name: "sheet pin",
        change: { category: "sheets", object_kind: "sheet_pin", reasons: ["renamed"] },
        mode: "side-by-side",
    },
    {
        name: "hierarchy path change",
        change: {
            category: "components",
            object_kind: "symbol",
            reference: "R12",
            reasons: ["re-pathed"],
        },
        mode: "side-by-side",
    },
    {
        name: "modified junction",
        change: { category: "nets", object_kind: "junction", reasons: ["moved"] },
        mode: "side-by-side",
    },
    {
        name: "moved drawing",
        change: { category: "graphics", object_kind: "graphic", reasons: ["moved"] },
        mode: "side-by-side",
    },
    {
        name: "drawing content",
        change: { category: "graphics", object_kind: "graphic", reasons: ["content-changed"] },
        mode: "old-new",
    },
    {
        name: "image content",
        change: { category: "graphics", object_kind: "image", reasons: ["content-changed"] },
        mode: "old-new",
    },
    {
        name: "table content",
        change: { category: "graphics", object_kind: "table", reasons: ["content-changed"] },
        mode: "old-new",
    },
];

const pcbCases: PolicyCase[] = [
    ...["footprint", "pad", "segment", "arc", "via", "zone"].map((object_kind) => ({
        name: `${object_kind} fabrication change`,
        change: {
            domain: "pcb" as const,
            category: object_kind === "footprint"
                ? "components"
                : object_kind === "zone" ? "zones" : "nets",
            object_kind,
            reasons: ["content-changed" as const],
        },
        mode: "side-by-side" as const,
    })),
    {
        // One-sided: the base revision has nothing to put in the other pane,
        // so the composite scene shows the new footprint in board context
        // instead of spending half the width on an empty board.
        name: "added footprint",
        change: {
            domain: "pcb",
            kind: "added",
            category: "components",
            object_kind: "footprint",
            reasons: ["object-added"],
        },
        mode: "composite",
    },
    {
        name: "footprint BOM and position-file state",
        change: {
            domain: "pcb",
            category: "components",
            object_kind: "footprint",
            reference: "R7",
            reasons: ["properties-changed"],
            fields: {
                "Exclude from BOM": { old: false, new: true },
                "Exclude from position files": { old: false, new: true },
            },
        },
        mode: "side-by-side",
    },
    {
        name: "board outline",
        change: {
            domain: "pcb",
            category: "graphics",
            object_kind: "graphic",
            layers: ["Edge.Cuts"],
            reasons: ["content-changed"],
        },
        mode: "side-by-side",
    },
    {
        name: "silkscreen graphic",
        change: {
            domain: "pcb",
            category: "graphics",
            object_kind: "footprint_graphic",
            layers: ["F.SilkS"],
            reasons: ["content-changed"],
        },
        mode: "side-by-side",
    },
    {
        name: "courtyard text",
        change: {
            domain: "pcb",
            category: "graphics",
            object_kind: "footprint_text",
            layers: ["F.CrtYd"],
            reasons: ["content-changed"],
        },
        mode: "side-by-side",
    },
    {
        name: "documentation drawing",
        change: {
            domain: "pcb",
            category: "graphics",
            object_kind: "graphic",
            layers: ["Dwgs.User"],
            reasons: ["content-changed"],
        },
        mode: "old-new",
    },
    {
        name: "organizational group",
        change: {
            domain: "pcb",
            kind: "added",
            category: "other",
            classification: "secondary",
            object_kind: "group",
            reasons: ["object-added"],
        },
        mode: "composite",
    },
    {
        name: "net-class rule",
        change: {
            domain: "pcb",
            category: "rules",
            object_kind: "net_class",
            reasons: ["properties-changed"],
            fields: { "Track width": { old: 0.18, new: 0.2 } },
            details: { reviewOnly: true, visualTargets: [] },
        },
        mode: "old-new",
    },
    {
        name: "net-class assignment",
        change: {
            domain: "pcb",
            category: "rules",
            object_kind: "net_class_assignment",
            reasons: ["properties-changed"],
            fields: { "Net class": { old: "Default", new: "USB" } },
            details: { reviewOnly: true, visualTargets: [] },
        },
        mode: "old-new",
    },
    {
        name: "board fabrication constraints",
        change: {
            domain: "pcb",
            category: "rules",
            object_kind: "board_constraint",
            reasons: ["properties-changed"],
            fields: { "Minimum track width (mm)": { old: 0.127, new: 0.1 } },
            details: { reviewOnly: true, visualTargets: [] },
        },
        mode: "old-new",
    },
];

describe("review presentation policy", () => {
    it.each(schematicCases)("chooses $mode for schematic $name", ({ change, mode }) => {
        expect(recommendPresentationForChange(reviewChange(change)).mode).toBe(mode);
    });

    it.each(pcbCases)("chooses $mode for PCB $name", ({ change, mode }) => {
        expect(recommendPresentationForChange(reviewChange(change)).mode).toBe(mode);
    });

    it("uses the strongest evidence view for a mixed semantic group", () => {
        const result = recommendPresentationForChanges([
            reviewChange({ kind: "added", object_kind: "wire", category: "nets", reasons: ["object-added"] }),
            reviewChange({ object_kind: "no_connect", category: "nets", reasons: ["content-changed"] }),
            reviewChange({ object_kind: "table", reasons: ["content-changed"] }),
        ]);

        expect(result.mode).toBe("side-by-side");
        expect(result.rule).toMatch(/^group:/);
    });

    it("keeps both pages visible for a cross-sheet component relocation", () => {
        const result = recommendPresentationForChanges([
            reviewChange({
                id: "old-fl3",
                kind: "removed",
                category: "components",
                object_kind: "symbol",
                reference: "FL3",
                page: "usb_phy.kicad_sch",
                reasons: ["object-removed"],
            }),
            reviewChange({
                id: "new-fl3",
                kind: "added",
                category: "components",
                object_kind: "symbol",
                reference: "FL3",
                page: "control_port.kicad_sch",
                reasons: ["object-added"],
            }),
        ]);

        expect(result.mode).toBe("side-by-side");
        expect(result.rule).toBe("group:schematic-cross-sheet-relocation");
    });

    it("defaults the unselected overview to Composite", () => {
        expect(recommendPresentationForChanges([]).mode).toBe("composite");
    });

    it("applies recommendations only while Auto is enabled", () => {
        const recommendation = recommendPresentationForChange(reviewChange({
            category: "nets",
            object_kind: "wire",
            reasons: ["moved"],
        }));

        expect(presentationForSelection("composite", recommendation, true)).toBe(
            "side-by-side",
        );
        expect(presentationForSelection("old-new", recommendation, false)).toBe(
            "old-new",
        );
    });
});
