import { describe, expect, it } from "vitest";

import { prepareChangesForReview } from "./comparison-review-noise";
import type { ChangeItem } from "./types";

function change(overrides: Partial<ChangeItem>): ChangeItem {
    return {
        id: "c1",
        kind: "changed",
        domain: "schematic",
        category: "nets",
        classification: "primary",
        ...overrides,
    } as ChangeItem;
}

// A rename between two auto-generated net names is pure noise: dropped by
// default, so it never reaches the listing.
const generatedRename = change({
    id: "gen-rename",
    reasons: ["net-renamed"],
    object_kind: "label",
    fields: { name: { old: "unconnected-(A-Pad1)", new: "Net-(B-Pad2)" } },
});

const realEdit = change({
    id: "real",
    reasons: ["properties-changed"],
    object_kind: "symbol",
    fields: { Value: { old: "10k", new: "22k" } },
});

describe("prepareChangesForReview show-all setting", () => {
    it("drops follow-on noise by default", () => {
        const result = prepareChangesForReview([realEdit, generatedRename]);
        expect(result.suppressedCount).toBe(1);
        expect(result.changes.map((item) => item.id)).toEqual(["real"]);
    });

    it("keeps suppressed changes as secondary when show-all is on", () => {
        const result = prepareChangesForReview([realEdit, generatedRename], {
            keepSuppressed: true,
        });
        // Still counted as suppressed, but retained rather than removed so it
        // runs through the same grouping and geometry steps as any change.
        expect(result.suppressedCount).toBe(1);
        const kept = result.changes.find((item) => item.id === "gen-rename");
        expect(kept).toBeDefined();
        expect(kept?.classification).toBe("secondary");
        // The genuine edit is untouched and stays primary.
        const real = result.changes.find((item) => item.id === "real");
        expect(real?.classification).toBe("primary");
    });

    it("does not change the primary set", () => {
        const off = prepareChangesForReview([realEdit, generatedRename]);
        const on = prepareChangesForReview([realEdit, generatedRename], {
            keepSuppressed: true,
        });
        const primaries = (result: { changes: ChangeItem[] }) =>
            result.changes.filter((item) => item.classification !== "secondary").map((item) => item.id);
        expect(primaries(on)).toEqual(primaries(off));
    });
});
