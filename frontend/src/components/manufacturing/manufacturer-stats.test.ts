import { describe, expect, it } from "vitest";

import type { PcbRuleField, SpecTemplate } from "@/types/manufacturing";
import { keyMinimums, manufacturerScorecard } from "./manufacturer-stats";
import { makeRun } from "./test-fixtures";

describe("manufacturerScorecard", () => {
    it("is empty for no productions", () => {
        expect(manufacturerScorecard([])).toEqual({
            productions: 0,
            units: 0,
            yieldPct: null,
            defects: { critical: 0, major: 0, minor: 0, aesthetic: 0, total: 0 },
        });
    });

    it("sums units and defects across every production", () => {
        const score = manufacturerScorecard([
            makeRun({ quantity_ordered: 100, defect_severity_counts: { critical: 1, major: 2 } }),
            makeRun({ quantity_ordered: 50, defect_severity_counts: { major: 1, minor: 5 } }),
        ]);
        expect(score.productions).toBe(2);
        expect(score.units).toBe(150);
        expect(score.defects).toEqual({ critical: 1, major: 3, minor: 5, aesthetic: 0, total: 9 });
    });

    it("computes yield over received and closed productions only", () => {
        const score = manufacturerScorecard([
            makeRun({ status: "received", quantity_ordered: 100, quantity_good: 97 }),
            makeRun({ status: "closed", quantity_ordered: 100, quantity_good: 98 }),
            // A draft with no good units yet must not drag the figure down.
            makeRun({ status: "draft", quantity_ordered: 500, quantity_good: 0 }),
            makeRun({ status: "in_production", quantity_ordered: 500, quantity_good: 0 }),
        ]);
        expect(score.yieldPct).toBe(97.5);
        expect(score.units).toBe(1200);
    });

    it("leaves cancelled productions out entirely", () => {
        const score = manufacturerScorecard([
            makeRun({ status: "closed", quantity_ordered: 100, quantity_good: 100 }),
            makeRun({ status: "cancelled", quantity_ordered: 900, quantity_good: 0, defect_severity_counts: { critical: 3 } }),
        ]);
        expect(score.productions).toBe(1);
        expect(score.units).toBe(100);
        expect(score.yieldPct).toBe(100);
        expect(score.defects.total).toBe(0);
    });

    it("has no yield when nothing has arrived", () => {
        expect(manufacturerScorecard([makeRun({ status: "ordered", quantity_good: 0 })]).yieldPct).toBeNull();
    });

    it("rounds yield to one decimal", () => {
        const score = manufacturerScorecard([makeRun({ status: "closed", quantity_ordered: 3, quantity_good: 2 })]);
        expect(score.yieldPct).toBe(66.7);
    });
});

describe("keyMinimums", () => {
    const fields: PcbRuleField[] = [
        { key: "min_track_width", label: "Min track width", type: "number", unit: "mm" },
        { key: "min_via_diameter", label: "Min via diameter", type: "number", unit: "mm" },
        { key: "min_via_hole", label: "Min via hole", type: "number", unit: "mm" },
    ];
    const template = (capabilities: Record<string, number>, meta = {}) =>
        ({ id: "t", manufacturer_id: "m", name: "T", spec_config: "", capabilities, capability_meta: meta, created_at: "", updated_at: "" }) as SpecTemplate;

    it("lists the set minimums, KiCad-tracked first, with their units", () => {
        const rows = keyMinimums(
            template({ max_board: 300, min_via_diameter: 0.25, min_track_width: 0.1 }, { max_board: { label: "Max board", unit: "mm" } }),
            fields,
        );
        expect(rows.map((r) => [r.label, r.value, r.unit])).toEqual([
            ["Min track width", 0.1, "mm"],
            ["Min via diameter", 0.25, "mm"],
            ["Max board", 300, "mm"],
        ]);
    });

    it("caps the list", () => {
        const rows = keyMinimums(template({ min_track_width: 1, min_via_diameter: 2, min_via_hole: 3 }), fields, 2);
        expect(rows).toHaveLength(2);
    });

    it("is empty when no capability is set", () => {
        expect(keyMinimums(template({}), fields)).toEqual([]);
    });
});
