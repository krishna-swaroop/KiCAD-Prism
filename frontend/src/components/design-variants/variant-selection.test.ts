/**
 * Resolve the URL request from the single semantic-index response.
 */
import { describe, expect, it } from "vitest";

import {
    requestedVariantFromSearchParams,
    resolveVariantSelection,
    variantSearchParams,
    variantSelectionNotice,
    variantSelectorDisabled,
} from "./variant-selection";
import type {
    AssemblyCatalogEntry,
    PrismSemanticIndex,
    SemanticComponent,
} from "@/types/prism-selection";

function component(reference: string): SemanticComponent {
    return {
        componentUid: `cmp:${reference}`,
        reference,
        value: "10k",
        footprint: "R_0603",
        fields: { Value: "10k", DNP: "No", "In BOM": "Yes" },
    };
}

function indexWith(catalog: AssemblyCatalogEntry[]): PrismSemanticIndex {
    return {
        schema: "prism.semantic_index_a0",
        sourceRevisionKey: "rev-a",
        components: [component("R1")],
        nets: [],
        terminals: [],
        indexes: {},
        assembly: {
            schema: "prism.assembly_state_a0",
            catalog,
            default: { occurrences: {}, components: {}, footprints: {} },
            variants: catalog.map((entry) => ({
                name: entry.name,
                occurrences: {},
                components: {},
                footprints: {},
            })),
            diagnostics: [],
        },
    };
}

function indexWithoutAssembly(): PrismSemanticIndex {
    return {
        schema: "prism.semantic_index_a0",
        sourceRevisionKey: "rev-old",
        components: [component("R1")],
        nets: [],
        terminals: [],
        indexes: {},
    };
}

const LITE: AssemblyCatalogEntry = {
    name: "Lite",
    description: null,
    sources: ["schematic"],
};

describe("requestedVariantFromSearchParams", () => {
    it("reads a non-empty variant parameter and treats blank as absent", () => {
        expect(
            requestedVariantFromSearchParams(
                new URLSearchParams("variant=Lite"),
            ),
        ).toBe("Lite");
        expect(
            requestedVariantFromSearchParams(new URLSearchParams("variant=")),
        ).toBeNull();
        expect(requestedVariantFromSearchParams(new URLSearchParams())).toBeNull();
    });
});

describe("variantSearchParams", () => {
    it("writes the variant while preserving the commit pin and open tab", () => {
        const current = new URLSearchParams("commit=abc123&tab=bom");
        const next = variantSearchParams(current, "Lite");
        expect(next.get("variant")).toBe("Lite");
        expect(next.get("commit")).toBe("abc123");
        expect(next.get("tab")).toBe("bom");
        expect(current.get("variant")).toBeNull();
    });

    it("deletes only the variant parameter for the default", () => {
        const current = new URLSearchParams("commit=abc123&variant=Lite");
        const next = variantSearchParams(current, null);
        expect(next.get("variant")).toBeNull();
        expect(next.get("commit")).toBe("abc123");
    });
});

describe("resolveVariantSelection", () => {
    it("uses only the index and distinguishes loading from failure", () => {
        expect(resolveVariantSelection("Lite", null).state).toBe("loading");
        expect(resolveVariantSelection("Lite", null, "failed").state).toBe("failed");
    });
    it("reports empty and unavailable data separately", () => {
        expect(resolveVariantSelection(null, indexWith([])).state).toBe("empty");
        expect(resolveVariantSelection(null, indexWithoutAssembly()).state).toBe("unavailable");
    });
    it("applies the requested variant from the same index as the catalog", () => {
        expect(resolveVariantSelection("Lite", indexWith([LITE]))).toEqual({effective: "Lite", state: "applied"});
        expect(resolveVariantSelection(null, indexWith([LITE]))).toEqual({effective: null, state: "applied"});
    });
    it("keeps a usable index active if a refresh fails", () => {
        expect(resolveVariantSelection("Lite", indexWith([LITE]), "refresh failed")).toEqual({effective: "Lite", state: "applied"});
    });
    it("does not apply an absent variant or silently drop the URL request", () => {
        for (const index of [indexWith([]), indexWith([LITE])]) {
            const resolution = resolveVariantSelection("Removed", index);
            expect(resolution).toEqual({effective: null, state: "missing"});
            expect(variantSelectionNotice(resolution, "Removed")).toContain("Removed");
        }
    });
    it("takes catalog and overlays together when a new index replaces the old one", () => {
        expect(resolveVariantSelection("Lite", indexWith([LITE])).effective).toBe("Lite");
        expect(resolveVariantSelection("Lite", indexWith([])).state).toBe("missing");
    });
});

describe("selector presentation helpers", () => {
    it("disables the control only while nothing can be chosen yet", () => {
        expect(
            variantSelectorDisabled({ effective: null, state: "loading" }),
        ).toBe(true);
        expect(variantSelectorDisabled({ effective: null, state: "empty" })).toBe(true);
        expect(
            variantSelectorDisabled({ effective: null, state: "unavailable" }),
        ).toBe(true);
        expect(
            variantSelectorDisabled({ effective: "Lite", state: "applied" }),
        ).toBe(false);
        expect(
            variantSelectorDisabled({ effective: null, state: "missing" }),
        ).toBe(false);
        expect(variantSelectorDisabled({ effective: null, state: "failed" })).toBe(false);
    });
});
