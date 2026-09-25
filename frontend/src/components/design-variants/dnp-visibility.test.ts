/**
 * VAR-19: the 3D hiding plan must derive from the physical classification,
 * never from reference-level DNP alone, and Show DNP must clear it without
 * touching the variant.
 */
import { describe, expect, it } from "vitest";

import {
    EMPTY_DNP_PLAN,
    dnpVisibilityNotice,
    dnpVisibilityPlan,
} from "./dnp-visibility";
import type { PhysicalVisibility } from "@/types/prism-selection";

const visibility: Record<string, PhysicalVisibility> = {
    R1: "visible",
    R2: "hidden",
    Q1: "ambiguous",
    J9: "absent",
};

describe("dnpVisibilityPlan", () => {
    it("separates hidden, ambiguous and absent references", () => {
        expect(dnpVisibilityPlan(visibility, false)).toEqual({
            hidden: ["R2"],
            ambiguous: ["Q1"],
            absent: ["J9"],
        });
    });

    it("passes nothing to the viewer when Show DNP is on", () => {
        expect(dnpVisibilityPlan(visibility, true)).toBe(EMPTY_DNP_PLAN);
    });

    it("never guesses a DNP value for an ambiguous pair", () => {
        const plan = dnpVisibilityPlan({ Q1: "ambiguous" }, false);
        expect(plan.hidden).toEqual([]);
        expect(plan.ambiguous).toEqual(["Q1"]);
    });

    it("sorts the reference lists for stable output", () => {
        const plan = dnpVisibilityPlan(
            { R9: "hidden", R2: "hidden", R5: "ambiguous" },
            false,
        );
        expect(plan.hidden).toEqual(["R2", "R9"]);
        expect(plan.ambiguous).toEqual(["R5"]);
    });
});

describe("dnpVisibilityNotice", () => {
    it("is silent when nothing is ambiguous", () => {
        expect(dnpVisibilityNotice(EMPTY_DNP_PLAN)).toBeNull();
        expect(dnpVisibilityNotice(dnpVisibilityPlan({ R2: "hidden" }, false))).toBeNull();
    });

    it("names the references and the limitation", () => {
        const notice = dnpVisibilityNotice(dnpVisibilityPlan(visibility, false));
        expect(notice).toContain("Q1");
        expect(notice).toContain("alternate footprints");
    });

    it("uses singular wording for one reference", () => {
        const notice = dnpVisibilityNotice(
            dnpVisibilityPlan({ Q1: "ambiguous" }, false),
        );
        expect(notice).toContain("1 component has alternate footprints");
    });
});
