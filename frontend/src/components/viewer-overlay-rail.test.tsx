import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EcadViewerControls } from "./ecad-viewer-controls";
import { ViewerOverlayRail } from "./viewer-overlay-rail";

const rect = (width: number, height = 600): DOMRect => ({
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("viewer overlay rails", () => {
    it("reports the measured right-rail width without entering layout flow", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockImplementation(function measuredRect(this: HTMLElement) {
                return rect(
                    this.getAttribute("aria-label") === "Viewer details"
                        ? 384
                        : 0,
                );
            });
        const onWidth = vi.fn();
        const { rerender } = render(
            <div className="relative h-[600px] w-[900px]">
                <div data-testid="viewer-host" className="absolute inset-0" />
                <ViewerOverlayRail
                    activeTab="selection"
                    tabs={[{ id: "selection", label: "Selection" }]}
                    onTabChange={() => undefined}
                    onClose={() => undefined}
                    onVisibleWidthChange={onWidth}
                    ariaLabel="Viewer details"
                >
                    Selection details
                </ViewerOverlayRail>
            </div>,
        );

        await waitFor(() => expect(onWidth).toHaveBeenCalledWith(384));
        expect(document.querySelector("[data-testid='viewer-host']"))
            .toHaveClass("absolute", "inset-0");
        expect(document.querySelector("[aria-label='Viewer details']"))
            .toHaveClass("absolute", "right-0");

        rerender(
            <div className="relative h-[600px] w-[900px]">
                <div data-testid="viewer-host" className="absolute inset-0" />
                <ViewerOverlayRail
                    activeTab={null}
                    tabs={[{ id: "selection", label: "Selection" }]}
                    onTabChange={() => undefined}
                    onClose={() => undefined}
                    onVisibleWidthChange={onWidth}
                    ariaLabel="Viewer details"
                >
                    Selection details
                </ViewerOverlayRail>
            </div>,
        );
        await waitFor(() => expect(onWidth).toHaveBeenLastCalledWith(0));
    });

    it("lets the selection inspector resize from a narrower default width", () => {
        window.localStorage.clear();
        const { getByRole } = render(
            <div className="relative h-[600px] w-[900px]">
                <ViewerOverlayRail
                    activeTab="selection"
                    tabs={[{ id: "selection", label: "Selection" }]}
                    onTabChange={() => undefined}
                    onClose={() => undefined}
                    ariaLabel="Viewer details"
                    resizable={{
                        storageKey: "test.inspector.width",
                        defaultWidth: 288,
                        minWidth: 240,
                        maxWidth: 480,
                    }}
                >
                    Selection details
                </ViewerOverlayRail>
            </div>,
        );

        const rail = getByRole("complementary", { name: "Viewer details" });
        expect(rail.style.width).toBe("288px");

        fireEvent.keyDown(getByRole("separator"), { key: "ArrowLeft" });
        expect(rail.style.width).toBe("304px");
    });

    it("collapses the left controls by transform and retains a measured handle", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockImplementation(function measuredRect(this: HTMLElement) {
                if (this.getAttribute("aria-label") === "Schematic pages") {
                    return rect(320);
                }
                if (this.classList.contains("w-11")) return rect(44);
                return rect(0);
            });
        const onWidth = vi.fn();
        const { getByRole } = render(
            <div className="relative h-[600px] w-[900px]">
                <div data-testid="viewer-host" className="absolute inset-0" />
                <EcadViewerControls
                    context="SCH"
                    viewer={null}
                    onVisibleWidthChange={onWidth}
                />
            </div>,
        );

        await waitFor(() => expect(onWidth).toHaveBeenCalledWith(320));
        fireEvent.click(getByRole("button", { name: "Collapse viewer controls" }));
        await waitFor(() => expect(onWidth).toHaveBeenLastCalledWith(44));
        expect(getByRole("complementary", { name: "Schematic pages" }))
            .toHaveClass("-translate-x-[calc(100%_-_2.75rem)]");
        expect(document.querySelector("[data-testid='viewer-host']"))
            .toHaveClass("absolute", "inset-0");
    });

    it("keeps the expand handle in the visible collapsed strip (left rail)", async () => {
        const { getByRole } = render(
            <div className="relative h-[600px] w-[900px] overflow-hidden">
                <EcadViewerControls context="PCB" viewer={null} />
            </div>,
        );

        const rail = getByRole("complementary", { name: "PCB display controls" });
        const header = rail.querySelector(":scope > div");
        expect(header).toBeTruthy();
        const handle = header!.querySelector(".w-11");
        expect(handle).toBeTruthy();
        expect(header!.lastElementChild).toBe(handle);

        fireEvent.click(within(rail).getByRole("button", { name: "Collapse viewer controls" }));

        // Transform keeps the RIGHT strip visible; handle must remain the last child.
        expect(rail.className).toContain("-translate-x-[calc(100%_-_2.75rem)]");
        expect(header!.lastElementChild).toBe(handle);
        expect(header!.firstElementChild).not.toBe(handle);
        expect(within(rail).getByRole("button", { name: "Expand viewer controls" })).toBeTruthy();
    });
});
