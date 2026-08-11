import { describe, expect, it } from "vitest";
import {
    changeEvidenceMode,
    connectionEntries,
    formatValue,
    orderedFields,
    propertyDeltas,
    routeMetricRows,
    terminalSummary,
} from "./comparison-property-model";
import type { ChangeItem, PcbDiff } from "./types";

/**
 * Ported from the selected-change card's tests when its derivations moved here.
 * The rules are the reviewer-facing ones — what counts as evidence, what is
 * noise, and which revision's net names a route's metrics belong to — so they
 * are worth keeping whichever component happens to render them.
 */

function change(overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: "change-1",
        kind: "changed",
        domain: "pcb",
        category: "nets",
        classification: "primary",
        label: "USB",
        object_kind: "net_class",
        reasons: ["properties-changed"],
        fields: { "Track width": { old: 0.18, new: 0.2 } },
        details: { reviewOnly: true, visualTargets: [] },
        ...overrides,
    };
}

const labelsOf = (deltas: Array<{ label: string }>) =>
    deltas.map((delta) => delta.label);

describe("evidence mode", () => {
    it("calls a record with no native object of its own structured evidence", () => {
        expect(changeEvidenceMode([change()])).toBe("structured");
    });

    it("calls a named native object with no target a resolution failure", () => {
        // A track names a real KiCad object, so an empty target list is a
        // visualization failure. Calling it structured evidence would let a
        // paint bug pass as a legitimate non-geometric change.
        const track = change({
            object_kind: "track",
            net: "USB_DP",
            source_id_compare: "t1",
            details: { visualTargets: [] },
        });
        expect(changeEvidenceMode([track])).toBe("unresolved");
    });

    it("calls a resolved target visual", () => {
        const track = change({
            object_kind: "track",
            net: "USB_DP",
            source_id_compare: "t1",
            details: {
                visualTargets: [{
                    side: "comparison",
                    status: "modified",
                    sourceId: "t1",
                    role: "track",
                }],
            },
        });
        expect(changeEvidenceMode([track])).toBe("visual");
    });

    it("keeps an aggregate logical net free of a missing-target warning", () => {
        const net = change({
            object_kind: "net",
            net: "GND",
            details: { reviewOnly: true, visualTargets: [] },
        });
        expect(changeEvidenceMode([net])).toBe("structured");
    });
});

describe("property deltas", () => {
    it("states an authored field with both of its values", () => {
        const deltas = propertyDeltas([change()]);
        expect(labelsOf(deltas)).toEqual(["Track Width"]);
        expect(deltas[0]!.oldValue).toBe(0.18);
        expect(deltas[0]!.newValue).toBe(0.2);
    });

    it("suppresses per-segment centroid noise across a routing group", () => {
        const segment = (id: string, side: "old" | "new"): ChangeItem => change({
            id,
            label: "VCC",
            object_kind: "segment",
            net: "VCC",
            fields: {
                Position: side === "old"
                    ? { old: [1, 2], new: null }
                    : { old: null, new: [7, 8] },
                Layer: side === "old"
                    ? { old: "F.Cu", new: null }
                    : { old: null, new: "F.Cu" },
                Net: side === "old"
                    ? { old: "VCC", new: null }
                    : { old: null, new: "VCC" },
                Width: side === "old"
                    ? { old: 0.127, new: null }
                    : { old: null, new: 0.127 },
            },
            details: { visualTargets: [] },
        });
        const labels = labelsOf(propertyDeltas([
            segment("segment-1", "old"),
            segment("segment-2", "new"),
        ]));

        expect(labels).not.toContain("Position");
        // Net, layer and width are identical across the route, so aggregating
        // them yields nothing to report.
        expect(labels).not.toContain("Net");
        expect(labels).not.toContain("Layer");
        expect(labels).not.toContain("Width");
    });

    it("keeps a net reassignment visible when the route did not move", () => {
        // Copper that only changes net looks identical in both panes and has
        // identical route metrics. Without the net pair the reviewer is given
        // no reason the row exists at all.
        const segment = (id: string) => change({
            id,
            label: "PHY_D+",
            object_kind: "segment",
            net: "Net-(U16-1D-)",
            reasons: ["net-changed"],
            fields: {
                Position: { old: [1, 2], new: [1, 2] },
                Net: {
                    old: "/CONTROL Port/CONTROL PHY/PHY_D+",
                    new: "Net-(U16-1D-)",
                },
            },
            details: { visualTargets: [] },
        });
        const deltas = propertyDeltas([segment("s1"), segment("s2")]);

        expect(labelsOf(deltas)).toContain("Net");
        expect(labelsOf(deltas)).not.toContain("Position");
        expect(deltas.find((delta) => delta.label === "Net")!.oldValue)
            .toBe("/CONTROL Port/CONTROL PHY/PHY_D+");
    });

    it("retains an aggregated route width when it genuinely changes", () => {
        const deltas = propertyDeltas([
            change({
                id: "old-segment",
                object_kind: "segment",
                net: "VCC",
                fields: { Width: { old: 0.127, new: null } },
            }),
            change({
                id: "new-segment",
                object_kind: "segment",
                net: "VCC",
                fields: { Width: { old: null, new: 0.2 } },
            }),
        ]);
        const width = deltas.find((delta) => delta.label === "Width")!;

        expect(width.oldValue).toBe("0.127");
        expect(width.newValue).toBe("0.2");
    });

    it("keeps schematic connectivity free of same-page field-anchor noise", () => {
        const selected = change({
            domain: "schematic",
            object_kind: "symbol",
            net: "GND",
            reasons: ["moved", "connectivity-changed"],
            fields: {
                Position: { old: [10, 20], new: [12, 20] },
                "Value attributes": {
                    old: { at: [10, 22], effects: { hide: false } },
                    new: { at: [12, 22], effects: { hide: false } },
                },
                Connections: { old: 240, new: 241 },
            },
            details: {
                connectivity: { addedTerminals: ["R120.1"], removedTerminals: [] },
                visualTargets: [],
            },
        });
        const labels = labelsOf(propertyDeltas([selected]));

        expect(labels).not.toContain("Position");
        expect(labels).not.toContain("Value Attributes");
        expect(labels).toContain("Connections");
        expect(terminalSummary([selected])).toEqual({
            added: ["R120.1"],
            removed: [],
        });
    });

    it("summarises exactly the terminals the drill-down lists", () => {
        // The panel prints "Added: …" while the queue row expands to one entry
        // per terminal. They are two readings of one connectivity delta, so
        // they are derived from one walk rather than two — a reviewer must
        // never see a pin in the summary that has no row to click.
        const selected = change({
            details: {
                connectivity: {
                    addedTerminals: ["U3.42", "R120.1", "U3.42"],
                    removedTerminals: ["P2.1"],
                },
            },
        });

        const summary = terminalSummary([selected])!;
        const entries = connectionEntries([selected]);

        expect(summary.added).toEqual(
            entries.filter((entry) => entry.kind === "added")
                .map((entry) => entry.label),
        );
        expect(summary.removed).toEqual(
            entries.filter((entry) => entry.kind === "removed")
                .map((entry) => entry.label),
        );
        // Deduplicated: the diff can report one terminal from several changes.
        expect(summary.added).toEqual(["R120.1", "U3.42"]);
    });

    it("heads each delta with the verb that explains it", () => {
        const deltas = propertyDeltas([change({
            object_kind: "symbol",
            reasons: ["renamed"],
            fields: { Designator: { old: "D?", new: "D10" } },
        })]);

        expect(deltas[0]!.verb).toBe("Re-annotated");
    });
});

describe("route metrics", () => {
    const metrics: PcbDiff["route_metrics"] = {
        base: {
            "/Expansion/PMOD_A7": {
                centerline_length_mm: 15.1491,
                via_count: 1,
                used_layers: ["B.Cu", "F.Cu"],
                via_barrel_length_mm: 1.5384,
                propagation_delay: null,
                diagnostics: [],
            },
        },
        compare: {
            "/Expansion/PMOD_A10": {
                centerline_length_mm: 15.1491,
                via_count: 1,
                used_layers: ["B.Cu", "F.Cu"],
                via_barrel_length_mm: 1.5384,
                propagation_delay: null,
                diagnostics: [],
            },
        },
    };

    it("reads each side under the net name that revision used", () => {
        // After a rename the two revisions file the same copper under
        // different names; looking both up under the new one finds nothing.
        const rows = routeMetricRows([change({
            object_kind: "track",
            net: "/Expansion/PMOD_A10",
            reasons: ["net-changed"],
            fields: {
                Net: { old: "/Expansion/PMOD_A7", new: "/Expansion/PMOD_A10" },
            },
        })], metrics);
        const length = rows.find((row) => row.label === "Route length")!;

        expect(length.oldValue).toBe("15.1491 mm");
        expect(length.newValue).toBe("15.1491 mm");
    });

    it("reports nothing when neither side names a measured net", () => {
        expect(routeMetricRows([change({ object_kind: "track", net: "NOPE" })], metrics))
            .toEqual([]);
    });
});

describe("connection entries", () => {
    it("turns a connectivity delta into one navigable entry per terminal", () => {
        const entries = connectionEntries([change({
            details: {
                connectivity: {
                    addedTerminals: ["U3-42"],
                    removedTerminals: ["P2-1"],
                },
            },
        })]);

        expect(entries.map((entry) => [entry.kind, entry.label])).toEqual([
            ["added", "U3-42"],
            ["removed", "P2-1"],
        ]);
    });
});

describe("value formatting", () => {
    it("renders nested authored attributes as reviewer-facing text", () => {
        expect(formatValue({ at: [1, 2], hide: false }))
            .toBe("At: 1, 2; Hide: No");
    });

    it("names an absent value rather than printing nothing", () => {
        expect(formatValue(null)).toBe("—");
        expect(formatValue("")).toBe("—");
    });
});

describe("component field ordering", () => {
    it("leads with the fields an engineer reads first", () => {
        const ordered = orderedFields({
            Tolerance: "1%",
            Value: "10k",
            Footprint: "0603",
        });
        expect(ordered.map(([name]) => name))
            .toEqual(["Value", "Footprint", "Tolerance"]);
    });

    it("hides the raw kicad flags surfaced as badges", () => {
        const ordered = orderedFields({ Value: "10k", kicad_dnp: "true" });
        expect(ordered.map(([name]) => name)).toEqual(["Value"]);
    });
});
