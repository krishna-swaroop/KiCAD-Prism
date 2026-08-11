import { describe, expect, it } from "vitest";

import {
    selectRevisionSlot,
    type RevisionRef,
} from "./history-comparison-selection";

const base: RevisionRef = { sha: "base", label: "Base", kind: "commit" };
const compare: RevisionRef = { sha: "compare", label: "Compare", kind: "commit" };

describe("history comparison revision selection", () => {
    it("allows either slot to be populated first without changing the other", () => {
        expect(selectRevisionSlot(null, null, "base", base)).toEqual({
            base,
            compare: null,
        });
        expect(selectRevisionSlot(null, null, "compare", compare)).toEqual({
            base: null,
            compare,
        });
    });

    it("does not replace or clear an existing choice with the same SHA", () => {
        expect(selectRevisionSlot(base, compare, "base", compare)).toEqual({
            base,
            compare,
        });
        expect(selectRevisionSlot(base, compare, "compare", base)).toEqual({
            base,
            compare,
        });
    });

    it("updates only the requested slot for a distinct revision", () => {
        const next: RevisionRef = { sha: "next", label: "Next", kind: "release" };
        expect(selectRevisionSlot(base, compare, "base", next)).toEqual({
            base: next,
            compare,
        });
        expect(selectRevisionSlot(base, compare, "compare", next)).toEqual({
            base,
            compare: next,
        });
    });
});
