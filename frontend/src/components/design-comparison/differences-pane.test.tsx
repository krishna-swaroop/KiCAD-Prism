import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DifferencesPane } from "./differences-pane";
import type { ChangeGroup } from "./comparison-review-groups";
import type { ChangeItem } from "./types";

const REFERENCES = Array.from({ length: 28 }, (_, index) => `C${index + 1}`);

function change(reference: string): ChangeItem {
    return {
        id: `change-${reference}`,
        kind: "added",
        domain: "pcb",
        category: "components",
        classification: "primary",
        label: reference,
        reference,
        object_kind: "footprint",
        reasons: ["object-added"],
        fields: { Layer: { old: null, new: "B.Cu" } },
    };
}

const group: ChangeGroup = {
    id: "pcb:components:part",
    category: "components",
    kind: "added",
    label: "0.1uF",
    classification: "primary",
    unresolvedCount: 0,
    changes: REFERENCES.map(change),
    references: REFERENCES,
};

function renderPane(overrides: Partial<Parameters<typeof DifferencesPane>[0]> = {}) {
    const onSelectChange = vi.fn();
    render(
        <DifferencesPane
            title="PCB compare"
            groups={[group]}
            totalGroups={1}
            secondaryGroupCount={0}
            statusCounts={{ added: 1, removed: 0, changed: 0 }}
            impactCounts={[]}
            impacts={new Set()}
            onToggleImpact={vi.fn()}
            onExport={vi.fn()}
            statuses={new Set(["added", "removed", "changed"])}
            onToggleStatus={vi.fn()}
            search=""
            onSearchChange={vi.fn()}
            showSecondary={false}
            onShowSecondaryChange={vi.fn()}
            selectedChangeId={null}
            selectedGroupId={null}
            onSelectChange={onSelectChange}
            onSelectGroup={vi.fn()}
            onPreviewChange={vi.fn()}
            onPrevious={vi.fn()}
            onNext={vi.fn()}
            {...overrides}
        />,
    );
    return { onSelectChange };
}

describe("queue row members", () => {
    it("makes every designator reachable, not just the first four", () => {
        // The row can only show a few chips inline. If the overflow count is
        // dead text, the other designators cannot be selected at all.
        renderPane();

        expect(screen.queryByText("C28")).toBeNull();
        fireEvent.click(
            screen.getByRole("button", { name: "Show all 28 designators" }),
        );

        expect(screen.getByText("C28")).toBeTruthy();
    });

    it("selects the instance behind a designator in the opened list", () => {
        const { onSelectChange } = renderPane();
        fireEvent.click(
            screen.getByRole("button", { name: "Show all 28 designators" }),
        );

        fireEvent.click(screen.getByText("C28"));

        expect(onSelectChange).toHaveBeenCalledWith(
            expect.objectContaining({ reference: "C28" }),
        );
    });

    it("does not repeat the changes the property panel already states", () => {
        renderPane();
        fireEvent.click(
            screen.getByRole("button", { name: "Show all 28 designators" }),
        );

        // "Re-layered: Layer" and its old/new pair belong to the panel; the
        // row exists to get the reviewer to a member.
        expect(screen.queryByText(/Re-layered/)).toBeNull();
        expect(screen.queryByText(/: Layer/)).toBeNull();
    });
});
