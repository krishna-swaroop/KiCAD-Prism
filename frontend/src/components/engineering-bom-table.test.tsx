/**
 * VAR-13 / D1: the BOM keeps every indexed component by default, offers an
 * explicit Assembly filter, and recomputes grouping/quantities from the
 * filtered list without touching the index.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EngineeringBomTable } from "./engineering-bom-table";
import type {
    PrismSemanticIndex,
    SemanticComponent,
} from "@/types/prism-selection";

function component(
    reference: string,
    value: string,
    dnp: string,
    inBom: string,
): SemanticComponent {
    return {
        componentUid: `cmp:${reference}`,
        reference,
        value,
        footprint: "R_0603",
        fields: { Value: value, DNP: dnp, "In BOM": inBom, Footprint: "R_0603" },
    };
}

const components: SemanticComponent[] = [
    component("R1", "10k", "No", "Yes"),
    component("R3", "10k", "No", "No"),
    component("R2", "22k", "Yes", "Yes"),
];

const index: PrismSemanticIndex = {
    schema: "prism.semantic_index_a0",
    sourceRevisionKey: "rev",
    components,
    nets: [],
    terminals: [],
    indexes: {},
};

function renderTable(effective?: SemanticComponent[]) {
    const onSelection = vi.fn();
    render(
        <EngineeringBomTable
            semanticIndex={index}
            components={effective}
            loading={false}
            selection={null}
            onSelection={onSelection}
            onRetry={vi.fn()}
        />,
    );
    return { onSelection };
}

const rowFor = (reference: string) =>
    screen.getByRole("button", { name: reference }).closest("tr")!;

describe("EngineeringBomTable assembly filter", () => {
    it("shows every indexed component, including excluded and DNP parts", () => {
        renderTable();
        expect(screen.getByRole("button", { name: "R1" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "R2" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "R3" })).toBeTruthy();
        expect(screen.getByText("3 components")).toBeTruthy();
        // Effective flags are visible without the filter.
        expect(within(rowFor("R2")).getAllByText("Yes").length).toBeGreaterThan(0);
        expect(within(rowFor("R3")).getAllByText("No").length).toBeGreaterThan(0);
    });

    it("filters to the assembly and recomputes the quantity", () => {
        renderTable();
        // Both 10k parts share a group before filtering.
        const before = rowFor("R1");
        expect(within(before).getByText("2")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /Assembly/ }));

        expect(screen.getByRole("button", { name: "R1" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "R2" })).toBeNull();
        expect(screen.queryByRole("button", { name: "R3" })).toBeNull();
        const after = rowFor("R1");
        expect(within(after).getByText("1")).toBeTruthy();
        expect(screen.getByText("1 of 3 components")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /All components/ }));
        expect(screen.getByRole("button", { name: "R3" })).toBeTruthy();
        expect(within(rowFor("R1")).getByText("2")).toBeTruthy();
    });

    it("presents the effective components it is given, not the base index", () => {
        const effective = index.components.map((entry) =>
            entry.reference === "R3"
                ? {
                      ...entry,
                      fields: { ...entry.fields, "In BOM": "Yes" },
                  }
                : entry,
        );
        renderTable(effective);
        fireEvent.click(screen.getByRole("button", { name: /Assembly/ }));
        expect(screen.getByRole("button", { name: "R3" })).toBeTruthy();
        expect(index.components[1]!.fields!["In BOM"]).toBe("No");
    });
});
