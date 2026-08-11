import { describe, expect, it } from "vitest";
import { groupChanges } from "./comparison-review-groups";
import {
    reviewReportCsv,
    reviewReportFilename,
    reviewReportRows,
} from "./comparison-review-report";
import type { ChangeItem } from "./types";

function change(overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: "change-1",
        kind: "changed",
        domain: "pcb",
        category: "components",
        classification: "primary",
        label: "U1",
        reference: "U1",
        semantic_id: "cmp:u1",
        object_kind: "footprint",
        page: "board.kicad_pcb",
        reasons: ["rotated"],
        layers: ["F.Cu"],
        ...overrides,
    };
}

describe("review report export", () => {
    it("reports the rollup the reviewer sees, not the parser events", () => {
        const groups = groupChanges([
            change({ id: "a" }),
            change({ id: "b", object_kind: "pad", reasons: ["moved"] }),
        ]);

        const rows = reviewReportRows(groups);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            "Status": "Modified",
            "Category": "Components",
            "Review owner": "PCB fabrication",
            "Item": "U1",
            "Objects": 2,
            "Scope": "Primary",
        });
    });

    it("carries the review owner and scope of each item", () => {
        const groups = groupChanges([
            change({
                id: "net",
                category: "nets",
                reference: null,
                object_kind: "track",
                net: "USB_D+",
                reasons: ["net-changed"],
                fields: { Net: { old: "D+", new: "USB_D+" } },
            }),
            change({
                id: "doc",
                category: "graphics",
                reference: null,
                object_kind: "graphic",
                classification: "secondary",
                layers: ["User.Comments"],
                label: "Revision note",
                reasons: ["properties-changed"],
            }),
        ]);

        const rows = reviewReportRows(groups);
        // Copper is named for the conductor it belongs to — the base
        // revision's net — with the rename stated alongside it.
        const route = rows.find((row) => String(row["Item"]).includes("USB_D+"));
        const note = rows.find((row) => row["Scope"] === "Secondary");

        expect(route?.["Review owner"]).toBe("Electrical");
        expect(route?.["Scope"]).toBe("Primary");
        expect(note).toBeDefined();
        expect(note?.["Review owner"]).toBe("Documentation");
    });

    it("quotes values so a net name containing a comma cannot shift columns", () => {
        const csv = reviewReportCsv(groupChanges([
            change({
                category: "nets",
                reference: null,
                object_kind: "track",
                net: 'NET,"A"',
                label: 'NET,"A"',
                reasons: ["net-changed"],
            }),
        ]));
        const [header, row] = csv.split("\n");

        expect(header).toContain('"Review owner"');
        expect(row).toContain('NET,""A""');
        // Header and body must agree on column count for any consumer to parse.
        expect(row?.split('","')).toHaveLength(header!.split('","').length);
    });

    it("names the file after the revisions so two exports stay distinguishable", () => {
        expect(reviewReportFilename({
            domain: "pcb",
            base: "refs/heads/main",
            compare: "0f1c9ab2c3d4e5f6",
        })).toBe("design-compare-pcb-refs-heads-m-0f1c9ab2c3d4.csv");
    });

    it("emits a header even when the filtered queue is empty", () => {
        expect(reviewReportCsv([]).split("\n")).toHaveLength(1);
    });
});
