import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ComparisonPropertyPanel } from "./comparison-property-panel";
import type { ChangeGroup } from "./comparison-review-groups";
import type { BomDiff, ChangeItem } from "./types";

function change(overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: "change-1",
        kind: "changed",
        domain: "schematic",
        category: "components",
        classification: "primary",
        label: "R33",
        reference: "R33",
        object_kind: "symbol",
        page: "CurrentSensing.kicad_sch",
        reasons: ["symbol-fields-changed"],
        ...overrides,
    };
}

function group(overrides: Partial<ChangeGroup> = {}): ChangeGroup {
    return {
        id: "schematic:components:part",
        category: "components",
        kind: "changed",
        label: "1K 1/16W 0.1% 0402 VIS → 10R 0.13W 0.5% 0402 VIS",
        classification: "primary",
        unresolvedCount: 0,
        changes: [change()],
        references: ["R33", "R34"],
        ...overrides,
    };
}

const bom: BomDiff = {
    summary: { added: 0, removed: 0, changed: 1 },
    fields: ["Reference", "Value", "Footprint", "Manufacturer Part Number"],
    changes: [{
        ref: "R33",
        status: "changed",
        old: {
            Value: "1K 1/16W 0.1% 0402 VIS",
            Footprint: "RESC1005X04N",
            "Manufacturer Part Number": "TNPW04021K00BEED",
        },
        new: {
            Value: "10R 0.13W 0.5% 0402 VIS",
            Footprint: "PIXXEL_RES0402",
            "Manufacturer Part Number": "TNPW040210R0DEED",
        },
        diffs: {
            Value: { old: "1K 1/16W 0.1% 0402 VIS", new: "10R 0.13W 0.5% 0402 VIS" },
            Footprint: { old: "RESC1005X04N", new: "PIXXEL_RES0402" },
            "Manufacturer Part Number": {
                old: "TNPW04021K00BEED",
                new: "TNPW040210R0DEED",
            },
        },
    }],
};

describe("comparison property panel", () => {
    it("states a changed field once, as old then new", () => {
        // The whole point of the panel: a reviewer reads the transition in one
        // place instead of clicking each revision and diffing in their head.
        render(<ComparisonPropertyPanel group={group()} bom={bom} />);

        const footprint = screen.getByText("Footprint").parentElement!;
        expect(within(footprint).getByText("RESC1005X04N")).toBeTruthy();
        expect(within(footprint).getByText("PIXXEL_RES0402")).toBeTruthy();
    });

    it("marks the departing value and leaves the new one unmarked", () => {
        // Marking both would make every changed row a red/green stripe, the
        // pair ChangeStatusDot already works around for colour blindness.
        render(<ComparisonPropertyPanel group={group()} bom={bom} />);

        expect(screen.getByText("RESC1005X04N").className)
            .toContain("text-destructive");
        expect(screen.getByText("PIXXEL_RES0402").className)
            .not.toContain("text-success");
        expect(screen.getByText("PIXXEL_RES0402").className)
            .not.toContain("text-destructive");
    });

    it("renders an unchanged field plainly, with no arrow", () => {
        const unchanged: BomDiff = {
            ...bom,
            changes: [{
                ref: "R33",
                status: "changed",
                old: { Value: "1K", Footprint: "RESC1005X04N" },
                new: { Value: "10R", Footprint: "RESC1005X04N" },
                diffs: { Value: { old: "1K", new: "10R" } },
            }],
        };
        render(<ComparisonPropertyPanel group={group()} bom={unchanged} />);

        const footprint = screen.getByText("Footprint").parentElement!;
        expect(within(footprint).queryByLabelText("changed to")).toBeNull();
        expect(within(footprint).getByText("RESC1005X04N").className)
            .not.toContain("text-destructive");
    });

    it("marks the departing part in the title", () => {
        render(<ComparisonPropertyPanel group={group()} bom={bom} />);

        const heading = screen.getByRole("heading", { level: 2 });
        expect(within(heading).getByText("1K 1/16W 0.1% 0402 VIS").className)
            .toContain("text-destructive");
        expect(within(heading).getByText("10R 0.13W 0.5% 0402 VIS")).toBeTruthy();
    });

    it("lists every designator the transition covers", () => {
        render(<ComparisonPropertyPanel group={group()} bom={bom} />);

        expect(screen.getByText("R33, R34")).toBeTruthy();
    });

    it("heads a non-BOM delta with the verb that explains it", () => {
        const relayered = group({
            label: "GND",
            category: "nets",
            references: [],
            changes: [change({
                domain: "pcb",
                category: "nets",
                object_kind: "track",
                reference: null,
                net: "GND",
                reasons: ["layer-changed"],
                fields: { Layer: { old: "F.Cu", new: "In1.Cu" } },
            })],
        });
        render(<ComparisonPropertyPanel group={relayered} bom={null} />);

        expect(screen.getByText("Re-layered")).toBeTruthy();
        expect(screen.getByText(": Layer")).toBeTruthy();
    });

    it("does not repeat a field the property sheet already states", () => {
        const withFieldDelta = group({
            changes: [change({
                fields: {
                    Footprint: { old: "RESC1005X04N", new: "PIXXEL_RES0402" },
                },
            })],
        });
        render(<ComparisonPropertyPanel group={withFieldDelta} bom={bom} />);

        expect(screen.queryByText(": Footprint")).toBeNull();
    });

    it("says so when a change resolved to no canvas target", () => {
        const unresolved = group({
            changes: [change({ source_id_compare: "abc-123" })],
        });
        render(<ComparisonPropertyPanel group={unresolved} bom={bom} />);

        expect(screen.getByText(/No canvas target resolved/)).toBeTruthy();
    });

    it("does not render a parser net code of zero as a net name", () => {
        // The PCB parser reports an unassigned net as 0. Beyond not being a
        // name, `{0 && …}` renders a bare "0" in React rather than nothing.
        const unassigned = group({
            label: "DRC exclusions",
            category: "rules",
            references: [],
            changes: [change({
                domain: "pcb",
                category: "rules",
                object_kind: "drc_exclusion",
                reference: null,
                net: 0 as unknown as string,
            })],
        });
        const { container } = render(
            <ComparisonPropertyPanel group={unassigned} bom={null} />,
        );
        // Context is collapsed by default, so open it — otherwise the row is
        // simply absent and the assertion proves nothing.
        fireEvent.click(screen.getByRole("button", { name: /Context/ }));

        expect(screen.queryByText("Net")).toBeNull();
        expect(container.textContent).not.toContain("0");
    });

    it("invites a selection when nothing is selected", () => {
        render(<ComparisonPropertyPanel group={null} bom={bom} />);

        expect(screen.getByText(/Select a change/)).toBeTruthy();
    });
});
