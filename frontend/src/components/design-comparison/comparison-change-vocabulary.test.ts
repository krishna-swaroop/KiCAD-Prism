import { describe, expect, it } from "vitest";
import {
    REASON_VERB,
    humanize,
    verbForProperty,
} from "./comparison-change-vocabulary";

describe("property delta verbs", () => {
    it("names the two transitions Altium distinguishes on the same field", () => {
        // A revision bump on the same part reads as an update; swapping the
        // part behind the designator reads as a replacement. Both land on
        // Design Item ID, so the reason is what separates them.
        expect(verbForProperty("Design Item ID", ["properties-changed"]))
            .toBe("Updated");
        expect(verbForProperty("Design Item ID", ["lib-changed"]))
            .toBe("Replaced");
    });

    it("reads a designator edit as a re-annotation", () => {
        expect(verbForProperty("Designator", ["renamed"])).toBe("Re-annotated");
    });

    it("trusts the field over a missing reason code", () => {
        // The value moving is the re-annotation, whether or not the diff
        // bothered to emit `renamed` alongside it.
        expect(verbForProperty("Designator", [])).toBe("Re-annotated");
        expect(verbForProperty("Designator", ["properties-changed"]))
            .toBe("Re-annotated");
    });

    it("picks the reason that explains this field when several are declared", () => {
        const reasons = ["renamed", "lib-changed", "moved"];
        expect(verbForProperty("Designator", reasons)).toBe("Re-annotated");
        expect(verbForProperty("Design Item ID", reasons)).toBe("Replaced");
        expect(verbForProperty("Position", reasons)).toBe("Moved");
    });

    it("falls back to the declared field-edit reason for custom fields", () => {
        expect(verbForProperty("Tolerance", ["symbol-fields-changed"]))
            .toBe("Updated");
        expect(verbForProperty("Tolerance", [])).toBe("Updated");
    });

    it("names the geometric and electrical changes Prism tracks", () => {
        expect(verbForProperty("Rotation", ["rotated"])).toBe("Rotated");
        expect(verbForProperty("Layer", ["layer-changed"])).toBe("Re-layered");
        expect(verbForProperty("Net", ["net-changed"])).toBe("Re-netted");
    });

    it("is stable when a change declares only unrelated reasons", () => {
        const first = verbForProperty("Tolerance", ["mirrored", "moved"]);
        const second = verbForProperty("Tolerance", ["moved", "mirrored"]);
        expect(first).toBe(second);
    });

    it("gives every reason code a verb", () => {
        for (const [reason, verb] of Object.entries(REASON_VERB)) {
            expect(verb, reason).toBeTruthy();
        }
    });
});

describe("humanize", () => {
    it("title-cases raw identifiers", () => {
        expect(humanize("net_class_assignment")).toBe("Net Class Assignment");
        expect(humanize("lib-changed")).toBe("Lib Changed");
    });
});
