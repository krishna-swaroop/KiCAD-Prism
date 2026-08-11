import { describe, expect, it } from "vitest";
import { groupChanges } from "./comparison-review-groups";
import {
    reviewImpactCounts,
    reviewImpactForGroup,
    reviewStatusCounts,
} from "./comparison-review-queue";
import type { ChangeItem } from "./types";

/**
 * How grouped review items are owned, counted and ordered.
 *
 * These drive `groupChanges` only to get a realistic group to ask about — the
 * subject is what the queue then says about it. The rules that decide what
 * shares a group, and which parser events survive to be grouped at all, are
 * covered by `comparison-review-groups.test.ts`.
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

describe("review ownership and counts", () => {
    it("assigns deterministic engineering ownership to review groups", () => {
        const footprintRotation = groupChanges([schematicChange({
            domain: "pcb",
            category: "components",
            object_kind: "footprint",
            reasons: ["rotated"],
            layers: ["B.Cu"],
        })])[0]!;
        const netRename = groupChanges([schematicChange({
            domain: "pcb",
            category: "nets",
            reference: null,
            object_kind: "track",
            net: "PMOD_A4",
            reasons: ["net-changed"],
            fields: { Net: { old: "PMOD_A3", new: "PMOD_A4" } },
        })])[0]!;
        const boardOutline = groupChanges([schematicChange({
            domain: "pcb",
            category: "graphics",
            reference: null,
            object_kind: "graphic",
            layers: ["Edge.Cuts"],
            reasons: ["moved"],
        })])[0]!;
        const constraint = groupChanges([schematicChange({
            domain: "pcb",
            category: "rules",
            reference: null,
            object_kind: "board_constraint",
        })])[0]!;

        expect(reviewImpactForGroup(footprintRotation)).toBe("fabrication");
        expect(reviewImpactForGroup(netRename)).toBe("electrical");
        expect(reviewImpactForGroup(boardOutline)).toBe("mechanical");
        expect(reviewImpactForGroup(constraint)).toBe("constraints");
    });

    it("counts review items, not parser events, per status", () => {
        const groups = groupChanges([
            schematicChange({ id: "a", semantic_id: "cmp:u1" }),
            // Same component: one review item, so one modification counted.
            schematicChange({ id: "b", semantic_id: "cmp:u1" }),
            schematicChange({
                id: "c",
                kind: "added",
                label: "R7",
                reference: "R7",
                semantic_id: "cmp:r7",
            }),
        ]);

        expect(reviewStatusCounts(groups)).toEqual({
            added: 1,
            changed: 1,
            removed: 0,
        });
    });

    it("orders owner counts by how much work each discipline is owed", () => {
        const groups = groupChanges([
            schematicChange({
                id: "outline",
                domain: "pcb",
                category: "graphics",
                reference: null,
                object_kind: "graphic",
                semantic_id: "gfx:outline",
                layers: ["Edge.Cuts"],
                reasons: ["moved"],
            }),
            schematicChange({
                id: "fp-1",
                domain: "pcb",
                category: "components",
                object_kind: "footprint",
                semantic_id: "fp:u1",
                reasons: ["rotated"],
                layers: ["F.Cu"],
            }),
            schematicChange({
                id: "fp-2",
                domain: "pcb",
                category: "components",
                label: "R7",
                reference: "R7",
                object_kind: "footprint",
                semantic_id: "fp:r7",
                reasons: ["moved"],
                layers: ["F.Cu"],
            }),
        ]);

        expect(reviewImpactCounts(groups)).toEqual([
            { impact: "fabrication", count: 2 },
            { impact: "mechanical", count: 1 },
        ]);
    });
});
