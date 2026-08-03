import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { FabricationPanel } from "./fabrication-panel";
import type { ComparisonPresentationMode } from "./comparison-url";
import type { FabricationDiff, FabricationLayerDiff } from "./types";

const URLS = {
    "fab:F.Cu:base": "/sidecars/base.svg",
    "fab:F.Cu:compare": "/sidecars/compare.svg",
};

function props(
    fabrication: FabricationDiff | undefined,
    presentationMode: ComparisonPresentationMode = "side-by-side",
) {
    return { fabrication, sidecarUrls: URLS, presentationMode };
}

function layer(overrides: Partial<FabricationLayerDiff> = {}): FabricationLayerDiff {
    return {
        function: "Copper,L1,Top",
        name: "F.Cu",
        file: { base: "board-F_Cu.gtl", compare: "board-F_Cu.gtl" },
        status: "changed",
        regions: [
            {
                index: 1,
                kind: "changed",
                x: 10,
                y: 20,
                width: 0.5,
                height: 0.5,
                addedOps: 1,
                removedOps: 1,
            },
            {
                index: 2,
                kind: "added",
                x: 25,
                y: 12,
                width: 0.2,
                height: 0.2,
                addedOps: 1,
                removedOps: 0,
            },
        ],
        warnings: [],
        render: { base: "fab:F.Cu:base", compare: "fab:F.Cu:compare" },
        ...overrides,
    };
}

function diff(overrides: Partial<FabricationDiff> = {}): FabricationDiff {
    return {
        present: true,
        bounds: [0, 0, 40, 30],
        board: [0, 0, 40, 30],
        summary: { layers: 2, changedLayers: 1, regions: 2 },
        layers: [layer(), layer({
            name: "B.Cu",
            function: "Copper,L2,Bot",
            status: "unchanged",
            regions: [],
        })],
        warnings: [],
        ...overrides,
    };
}

describe("fabrication panel", () => {
    it("opens on the first changed layer rather than the first plotted one", () => {
        const view = render(<FabricationPanel {...props(diff())} />);

        // B.Cu is unchanged, so it is not what the reviewer came to look at.
        expect(view.getByText("Copper,L1,Top")).toBeTruthy();
        expect(view.queryByText("B.Cu")).toBeNull();
    });

    it("lists unchanged layers only when asked", () => {
        const view = render(<FabricationPanel {...props(diff())} />);

        fireEvent.click(view.getByRole("checkbox"));

        expect(view.getByText("B.Cu")).toBeTruthy();
    });

    it("collapses a layer that is already expanded", () => {
        // Expansion used to be derived from which layer was selected, so the
        // only way to close a layer was to open a different one.
        const view = render(<FabricationPanel {...props(diff())} />);
        const row = view.getByRole("button", { name: /F\.Cu/ });

        fireEvent.click(row);
        expect(row).toHaveAttribute("aria-expanded", "true");

        fireEvent.click(row);
        expect(row).toHaveAttribute("aria-expanded", "false");
    });

    it("reports a difference's size and position in board millimetres", () => {
        const view = render(<FabricationPanel {...props(diff())} />);

        fireEvent.click(view.getByRole("button", { name: /F\.Cu/ }));
        fireEvent.click(view.getByRole("button", { name: /10\.00, 20\.00/ }));

        expect(view.getByText(/0\.500 × 0\.500 mm at 10\.000, 20\.000/)).toBeTruthy();
    });

    it("cross-probes from a marker on the artwork to its list entry", () => {
        const view = render(<FabricationPanel {...props(diff())} />);
        fireEvent.click(view.getByRole("button", { name: /F\.Cu/ }));
        const markers = view.getAllByRole("img", { name: /Difference markers/ })[0]!;

        fireEvent.click(within(markers).getByText("1"));

        expect(
            view.getByRole("button", { name: /10\.00, 20\.00/ }),
        ).toHaveAttribute("aria-current", "true");
    });

    it("lets a drag through the middle of a marker reach the pane", () => {
        // A transparent fill is still a hit target, so a large marker used to
        // swallow every drag that began inside it and the pane could not be
        // panned at all.
        const view = render(<FabricationPanel {...props(diff())} />);
        const markers = view.getAllByRole("img", { name: /Difference markers/ })[0]!;

        for (const rect of markers.querySelectorAll("rect")) {
            const fill = rect.getAttribute("fill");
            const painted = fill && fill !== "none";
            expect(!painted || rect.classList.contains("pointer-events-none")).toBe(true);
        }
    });

    it("draws markers dashed so they cannot read as plotted geometry", () => {
        const view = render(<FabricationPanel {...props(diff())} />);
        const markers = view.getAllByRole("img", { name: /Difference markers/ })[0]!;

        const outlines = [...markers.querySelectorAll("rect")]
            .filter((rect) => rect.getAttribute("fill") === "none");
        expect(outlines.length).toBeGreaterThan(0);
        for (const outline of outlines) {
            expect(outline.getAttribute("stroke-dasharray")).toBeTruthy();
        }
    });

    it("frames a difference belonging to a layer that was not current", () => {
        // Selection used to resolve the number against whichever layer was
        // showing, so opening a difference from another layer framed the wrong
        // place or nothing at all.
        const view = render(<FabricationPanel {...props(diff())} />);
        fireEvent.click(view.getByRole("checkbox"));
        fireEvent.click(view.getByRole("button", { name: /B\.Cu/ }));

        expect(view.getByText("Copper,L2,Bot")).toBeTruthy();
    });

    it("walks the differences with the next control", () => {
        const view = render(<FabricationPanel {...props(diff())} />);
        const next = view.getByRole("button", { name: "Next difference" });

        fireEvent.click(next);
        expect(view.getByText(/^#1 /)).toBeTruthy();

        fireEvent.click(next);
        expect(view.getByText(/^#2 /)).toBeTruthy();

        // The walk wraps rather than dead-ending on the last difference.
        fireEvent.click(next);
        expect(view.getByText(/^#1 /)).toBeTruthy();
    });

    it("offers zoom and fit controls for every presentation", () => {
        const view = render(<FabricationPanel {...props(diff(), "composite")} />);

        expect(view.getByRole("button", { name: "Zoom in" })).toBeTruthy();
        expect(view.getByRole("button", { name: "Zoom out" })).toBeTruthy();
        expect(view.getByRole("button", { name: "Fit board" })).toBeTruthy();
        expect(view.getByText("100%")).toBeTruthy();
    });

    it("zooms about the viewport and reports the level", () => {
        const view = render(<FabricationPanel {...props(diff())} />);

        fireEvent.click(view.getByRole("button", { name: "Zoom in" }));

        expect(view.getByText("140%")).toBeTruthy();
    });

    it("shows both revisions side by side and only one for old/new", () => {
        const side = render(<FabricationPanel {...props(diff())} />);
        expect(side.getAllByRole("img", { name: /Difference markers/ })).toHaveLength(2);
        cleanup();

        const single = render(<FabricationPanel {...props(diff(), "old-new")} />);
        expect(single.getAllByRole("img", { name: /Difference markers/ })).toHaveLength(1);
    });

    it("renders while the fabrication pass is still running", () => {
        // The domain is published empty alongside the schematic and BOM results
        // and filled in later; dereferencing the missing counts took the whole
        // Design Comparison view down.
        const view = render(<FabricationPanel {...props({
            present: false,
            layers: [],
        } as unknown as FabricationDiff)} />);

        expect(view.getByText("No fabrication output")).toBeTruthy();
    });

    it("shows progress rather than counts before the pass reports", () => {
        const view = render(<FabricationPanel {...props({
            present: true,
            layers: [layer()],
            bounds: [0, 0, 40, 30],
        } as unknown as FabricationDiff)} />);

        expect(view.getByText("Comparing…")).toBeTruthy();
    });

    it("surfaces why the output is missing when the plot failed", () => {
        const view = render(<FabricationPanel {...props(diff({
            present: false,
            layers: [],
            warnings: ["kicad-cli is not available"],
        }))} />);

        expect(view.getByText("kicad-cli is not available")).toBeTruthy();
    });

    it("keeps a layer that only one revision plots visible as the change", () => {
        const view = render(<FabricationPanel {...props(diff({
            summary: { layers: 1, changedLayers: 1, regions: 0 },
            layers: [layer({
                name: "F.Paste",
                status: "removed",
                regions: [],
                file: { base: "board-F_Paste.gtp", compare: null },
                render: undefined,
            })],
        }))} />);

        expect(view.getByText("removed")).toBeTruthy();
        expect(
            view.getAllByText("Not plotted in this revision").length,
        ).toBeGreaterThan(0);
    });
});
