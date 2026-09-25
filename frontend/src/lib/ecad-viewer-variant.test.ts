/**
 * VAR-16: the bridge must call the vendored variant API, must not mask an
 * outdated bundle, and must report the element's actual state.
 */
import { describe, expect, it, vi } from "vitest";

import {
    syncViewerVariant,
    viewerVariantNotice,
    type ViewerVariantSync,
} from "./ecad-viewer-variant";
import type { ECadViewerElement } from "@/types/ecad-viewer";

function element(
    behavior: {
        known?: boolean;
        applied?: string | null;
    } = {},
): { element: ECadViewerElement; setVariant: ReturnType<typeof vi.fn> } {
    const setVariant = vi.fn(() => behavior.known ?? true);
    const stub = {
        setVariant,
        getVariant: vi.fn(() => behavior.applied ?? null),
    };
    return { element: stub as unknown as ECadViewerElement, setVariant };
}

describe("syncViewerVariant", () => {
    it("reports pending when the element is not mounted", () => {
        expect(syncViewerVariant(null, "Lite")).toEqual({
            state: "pending",
            requested: "Lite",
            applied: null,
        });
    });

    it("reports an outdated bundle instead of optional-chaining past it", () => {
        const stale = {} as ECadViewerElement;
        expect(syncViewerVariant(stale, "Lite")).toEqual({
            state: "unsupported",
            requested: "Lite",
            applied: null,
        });
        expect(viewerVariantNotice("pcb", syncViewerVariant(stale, "Lite"))).toContain(
            "out of date",
        );
    });

    it("clears to the default design with a null selection", () => {
        const { element: viewer, setVariant } = element({ applied: null });
        expect(syncViewerVariant(viewer, null)).toEqual({
            state: "default",
            requested: null,
            applied: null,
        });
        expect(setVariant).toHaveBeenCalledWith(null);
    });

    it("reports applied once the element reflects the name", () => {
        const { element: viewer, setVariant } = element({ applied: "Lite" });
        const result = syncViewerVariant(viewer, "Lite");
        expect(result).toEqual({
            state: "applied",
            requested: "Lite",
            applied: "Lite",
        });
        expect(setVariant).toHaveBeenCalledTimes(1);
        expect(setVariant).toHaveBeenCalledWith("Lite");
        expect(viewerVariantNotice("schematic", result)).toBeNull();
    });

    it("stays pending while the sources still settle", () => {
        const { element: viewer } = element({ applied: null });
        const result = syncViewerVariant(viewer, "Lite");
        expect(result.state).toBe("pending");
        expect(viewerVariantNotice("pcb", result)).toBeNull();
    });

    it("reports a name the vendored viewer rejects", () => {
        const { element: viewer } = element({ known: false, applied: null });
        const result = syncViewerVariant(viewer, "Nope");
        expect(result.state).toBe("missing");
        expect(viewerVariantNotice("schematic", result)).toContain("Nope");
        expect(viewerVariantNotice("pcb", result)).toContain("PCB");
    });

    it("is idempotent for repeated identical selections", () => {
        const { element: viewer, setVariant } = element({ applied: "Lite" });
        const first: ViewerVariantSync = syncViewerVariant(viewer, "Lite");
        const second: ViewerVariantSync = syncViewerVariant(viewer, "Lite");
        expect(second).toEqual(first);
        expect(setVariant).toHaveBeenCalledTimes(2);
    });
});
