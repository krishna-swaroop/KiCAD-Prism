/**
 * D1 assembly filter: effective In BOM / DNP decide membership, and the two
 * flags stay independent (excluding from the BOM never implies DNP).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
    ASSEMBLY_FILTER_HELP,
    BomAssemblyFilterControl,
    filterComponentsForAssembly,
    isAssembled,
    isDnp,
    isInBom,
} from "./assembly-filter";
import type { SemanticComponent } from "@/types/prism-selection";

function component(
    reference: string,
    dnp: string,
    inBom: string,
): SemanticComponent {
    return {
        componentUid: `cmp:${reference}`,
        reference,
        fields: { DNP: dnp, "In BOM": inBom },
    };
}

const populated = component("R1", "No", "Yes");
const dnpButInBom = component("R2", "Yes", "Yes");
const excludedButPopulated = component("R3", "No", "No");
const excludedAndDnp = component("R4", "Yes", "No");

describe("assembly filter predicate", () => {
    it("keeps populated, in-BOM parts in the assembly", () => {
        expect(isAssembled(populated)).toBe(true);
        expect(isAssembled(dnpButInBom)).toBe(false);
        expect(isAssembled(excludedButPopulated)).toBe(false);
        expect(isAssembled(excludedAndDnp)).toBe(false);
    });

    it("reads the two effective flags independently", () => {
        expect(isInBom(excludedButPopulated)).toBe(false);
        expect(isDnp(excludedButPopulated)).toBe(false);
        expect(isInBom(dnpButInBom)).toBe(true);
        expect(isDnp(dnpButInBom)).toBe(true);
    });

    it("'all' preserves every indexed component and 'assembly' filters a copy", () => {
        const components = [
            populated,
            dnpButInBom,
            excludedButPopulated,
            excludedAndDnp,
        ];
        const all = filterComponentsForAssembly(components, "all");
        expect(all).toEqual(components);
        expect(all).not.toBe(components);
        expect(
            filterComponentsForAssembly(components, "assembly").map(
                (entry) => entry.reference,
            ),
        ).toEqual(["R1"]);
        expect(components).toHaveLength(4);
    });
});

describe("BomAssemblyFilterControl", () => {
    it("reports the selected mode with counts and explains the filter", () => {
        const onChange = vi.fn();
        render(
            <BomAssemblyFilterControl
                value="all"
                onChange={onChange}
                allCount={4}
                assemblyCount={1}
            />,
        );
        const all = screen.getByRole("button", { name: /All components/ });
        const assembly = screen.getByRole("button", { name: /Assembly/ });
        expect(all.getAttribute("aria-pressed")).toBe("true");
        expect(assembly.getAttribute("aria-pressed")).toBe("false");
        expect(
            screen
                .getByRole("group", {
                    name: "Bill of materials assembly filter",
                })
                .getAttribute("title"),
        ).toBe(ASSEMBLY_FILTER_HELP);

        fireEvent.click(assembly);
        expect(onChange).toHaveBeenCalledWith("assembly");
    });
});
