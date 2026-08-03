import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ResizablePanel } from "./resizable-panel";

beforeEach(() => window.localStorage.clear());

function panelOf(container: HTMLElement): HTMLElement {
    return container.querySelector("aside")!;
}

describe("resizable panel", () => {
    it("takes its width from state, not from its content", () => {
        // The bug this exists to prevent: one long datasheet URL widening the
        // panel and shrinking the canvas the moment an item is selected.
        const longValue = "https://www.murata.com/en-global/products/"
            + "productdata/8799424610334/EFLD0009.pdf";
        const { container } = render(
            <ResizablePanel
                side="right"
                storageKey="test.width"
                defaultWidth={400}
            >
                <span>{longValue}</span>
            </ResizablePanel>,
        );

        expect(panelOf(container).style.width).toBe("400px");
    });

    it("clamps a stored width into the allowed range", () => {
        window.localStorage.setItem("test.width", "5000");
        const { container } = render(
            <ResizablePanel
                side="right"
                storageKey="test.width"
                defaultWidth={400}
                minWidth={280}
                maxWidth={720}
            >
                <span>content</span>
            </ResizablePanel>,
        );

        expect(Number(panelOf(container).style.width.replace("px", "")))
            .toBeLessThanOrEqual(720);
    });

    it("restores the width the reviewer last chose", () => {
        window.localStorage.setItem("test.width", "512");
        const { container } = render(
            <ResizablePanel
                side="right"
                storageKey="test.width"
                defaultWidth={400}
            >
                <span>content</span>
            </ResizablePanel>,
        );

        expect(panelOf(container).style.width).toBe("512px");
    });

    it("resizes from the keyboard, not only by dragging", () => {
        const { container } = render(
            <ResizablePanel
                side="right"
                storageKey="test.width"
                defaultWidth={400}
                aria-label="Selected change"
            >
                <span>content</span>
            </ResizablePanel>,
        );
        const handle = screen.getByRole("separator");

        // A right-hand panel grows when its edge moves left.
        fireEvent.keyDown(handle, { key: "ArrowLeft" });
        expect(panelOf(container).style.width).toBe("416px");

        fireEvent.keyDown(handle, { key: "ArrowRight" });
        expect(panelOf(container).style.width).toBe("400px");
    });

    it("grows a left panel in the opposite direction from a right one", () => {
        const { container } = render(
            <ResizablePanel
                side="left"
                storageKey="test.left"
                defaultWidth={360}
            >
                <span>content</span>
            </ResizablePanel>,
        );

        fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
        expect(panelOf(container).style.width).toBe("376px");
    });

    it("returns to its default width on double click", () => {
        window.localStorage.setItem("test.width", "600");
        const { container } = render(
            <ResizablePanel
                side="right"
                storageKey="test.width"
                defaultWidth={400}
            >
                <span>content</span>
            </ResizablePanel>,
        );

        fireEvent.doubleClick(screen.getByRole("separator"));
        expect(panelOf(container).style.width).toBe("400px");
    });

    it("describes its range to assistive technology", () => {
        render(
            <ResizablePanel
                side="right"
                storageKey="test.width"
                defaultWidth={400}
                minWidth={280}
                maxWidth={720}
                aria-label="Selected change"
            >
                <span>content</span>
            </ResizablePanel>,
        );
        const handle = screen.getByRole("separator");

        expect(handle.getAttribute("aria-valuenow")).toBe("400");
        expect(handle.getAttribute("aria-valuemin")).toBe("280");
        expect(handle.getAttribute("aria-valuemax")).toBe("720");
        expect(handle.getAttribute("aria-label")).toBe("Resize Selected change");
    });
});
