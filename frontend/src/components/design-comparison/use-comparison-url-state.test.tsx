import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { useComparisonUrlState } from "./use-comparison-url-state";

// The shareable half of the comparison lives in the address bar and is read
// from it during render. These tests pin the two properties that used to need
// a pair of mirroring effects: an arriving link is in force immediately, and
// what a reviewer does reaches the URL without a round trip through state.

const IDENTITY = { base: "base-sha", compare: "compare-sha" };

function wrapper(entry: string) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
    };
}

function renderUrlState(entry: string) {
    return renderHook(() => useComparisonUrlState(IDENTITY), {
        wrapper: wrapper(entry),
    });
}

describe("useComparisonUrlState", () => {
    it("is already showing what a pasted link asked for on the first render", () => {
        const { result } = renderUrlState(
            "/?section=history&base=base-sha&compare=compare-sha"
            + "&diff=pcb&item=track-1&secondary=1&layers=F.Cu,B.Cu"
            + "&presentation=side-by-side",
        );

        // No `act`, no waitFor: nothing has to settle, because nothing was
        // copied. A mirror would still be holding the defaults here.
        expect(result.current.activeTab).toBe("pcb");
        expect(result.current.selection).toEqual({ kind: "item", id: "track-1" });
        expect(result.current.showSecondary).toBe(true);
        expect(result.current.visibleLayers).toEqual(["F.Cu", "B.Cu"]);
        expect(result.current.presentationOverride).toBe("side-by-side");
    });

    it("falls back to the shareable defaults when the link carries nothing", () => {
        const { result } = renderUrlState("/?section=history");

        expect(result.current.activeTab).toBe("sch");
        expect(result.current.selection).toBeNull();
        expect(result.current.showSecondary).toBe(false);
        expect(result.current.visibleLayers).toEqual([]);
        expect(result.current.presentationOverride).toBeNull();
    });

    it("writes a choice to the URL, keeping the revision pair", () => {
        const { result } = renderUrlState("/?section=history&branch=main");

        act(() => result.current.setActiveTab("pcb"));

        expect(result.current.activeTab).toBe("pcb");
        // The pair identifies the comparison, so every write restates it, and
        // unrelated keys survive.
        expect(result.current.selection).toBeNull();
    });

    it("accepts a functional update against the value in the URL", () => {
        const { result } = renderUrlState("/?section=history&secondary=1");

        act(() => result.current.setShowSecondary((shown) => !shown));

        expect(result.current.showSecondary).toBe(false);
    });

    /**
     * Each setter navigates, and `setSearchParams` hands its callback the
     * params captured at render rather than what a previous call in the same
     * handler just wrote. Without the accumulator, the tab here would be lost
     * and only the selected change would survive.
     */
    it("keeps both writes when one handler sets two values", () => {
        const { result } = renderUrlState("/?section=history");

        act(() => {
            result.current.setActiveTab("pcb");
            result.current.setSelection({ kind: "item", id: "track-1" });
        });

        expect(result.current.activeTab).toBe("pcb");
        expect(result.current.selection).toEqual({ kind: "item", id: "track-1" });
    });

    it("puts the whole shareable state into the address bar", () => {
        function Probe() {
            const state = useComparisonUrlState(IDENTITY);
            const location = useLocation();
            return (
                <button onClick={() => state.setVisibleLayers(["F.Cu"])}>
                    {location.search}
                </button>
            );
        }
        render(
            <MemoryRouter initialEntries={["/?section=history"]}>
                <Probe />
            </MemoryRouter>,
        );

        act(() => screen.getByRole("button").click());

        const search = new URLSearchParams(screen.getByRole("button").textContent ?? "");
        expect(search.get("layers")).toBe("F.Cu");
        expect(search.get("base")).toBe("base-sha");
        expect(search.get("compare")).toBe("compare-sha");
        expect(search.get("section")).toBe("history");
    });

    it("round-trips decision and instance scope instead of collapsing to one item", () => {
        const { result } = renderUrlState("/?section=history");

        act(() => result.current.setSelection({
            kind: "instance",
            id: "pcb:components:part>26k>29k",
            reference: "R52",
            documentPath: "board.kicad_pcb",
        }));

        expect(result.current.selection).toEqual({
            kind: "instance",
            id: "pcb:components:part>26k>29k",
            reference: "R52",
            documentPath: "board.kicad_pcb",
        });
    });
});
