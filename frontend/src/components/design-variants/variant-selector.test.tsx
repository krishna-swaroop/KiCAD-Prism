/**
 * VAR-14: the selector is a pure view of the resolution — default selected
 * when nothing applies, missing names visibly not applied, failed discovery
 * retryable.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DesignVariantSelector } from "./variant-selector";
import type { VariantSelectionResolution } from "./variant-selection";
import type { AssemblyCatalogEntry } from "@/types/prism-selection";

const LITE: AssemblyCatalogEntry = {
    name: "Lite",
    description: null,
    sources: ["schematic"],
};
const PRO: AssemblyCatalogEntry = {
    name: "Pro",
    description: null,
    sources: ["project"],
};

const applied = (name: string): VariantSelectionResolution => ({
    effective: name,
    state: "applied",
});

function renderSelector(
    resolution: VariantSelectionResolution,
    extras: Partial<Parameters<typeof DesignVariantSelector>[0]> = {},
) {
    const onSelect = vi.fn();
    render(
        <DesignVariantSelector
            resolution={resolution}
            variants={[LITE, PRO]}
            onSelect={onSelect}
            requested={resolution.effective}
            {...extras}
        />,
    );
    return { onSelect };
}

describe("DesignVariantSelector", () => {
    it("offers Default plus every catalog variant, in order", () => {
        renderSelector(applied("Lite"));
        const select = screen.getByLabelText("Variant") as HTMLSelectElement;
        expect(Array.from(select.options).map((option) => option.value)).toEqual([
            "",
            "Lite",
            "Pro",
        ]);
        expect(select.value).toBe("Lite");
    });

    it("selects a name and the default", () => {
        const { onSelect } = renderSelector({ effective: null, state: "applied" });
        const select = screen.getByLabelText("Variant");
        fireEvent.change(select, { target: { value: "Pro" } });
        expect(onSelect).toHaveBeenLastCalledWith("Pro");
        fireEvent.change(select, { target: { value: "" } });
        expect(onSelect).toHaveBeenLastCalledWith(null);
    });

    it("shows the default with a missing notice for an unknown name (E16)", () => {
        renderSelector(
            { effective: null, state: "missing" },
            { requested: "Nope" },
        );
        const select = screen.getByLabelText("Variant") as HTMLSelectElement;
        expect(select.value).toBe("");
        expect(select.disabled).toBe(false);
        expect(screen.getByRole("status").textContent).toContain("Nope");
    });

    it("disables the control while loading, empty or unavailable", () => {
        for (const resolution of [
            { effective: null, state: "loading" },
            { effective: null, state: "unavailable" },
        ] as VariantSelectionResolution[]) {
            const { unmount } = render(
                <DesignVariantSelector
                    resolution={resolution}
                    variants={resolution.state === "empty" ? [] : [LITE]}
                    onSelect={vi.fn()}
                />,
            );
            expect(
                (screen.getByLabelText("Variant") as HTMLSelectElement).disabled,
            ).toBe(true);
            expect(screen.getByRole("status")).toBeTruthy();
            unmount();
        }
    });

    it("keeps the reason visible and offers a retry when discovery failed", () => {
        const onRetry = vi.fn();
        renderSelector({ effective: null, state: "failed" }, { onRetry });
        expect(screen.getByRole("status").textContent).toContain("could not be loaded");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});


describe("empty projects", () => {
    it("does not show a selector without variants", () => {
        renderSelector({effective: null, state: "empty"}, {variants: []});
        expect(screen.queryByLabelText("Variant")).toBeNull();
    });
    it("still explains a missing requested variant without an empty selector", () => {
        renderSelector({effective: null, state: "missing"}, {variants: [], requested: "Removed"});
        expect(screen.queryByLabelText("Variant")).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("Removed");
    });
});
