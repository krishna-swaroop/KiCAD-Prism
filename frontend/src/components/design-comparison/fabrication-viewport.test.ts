import { describe, expect, it } from "vitest";
import {
    centreCamera,
    clampScale,
    frameCamera,
    paneLayout,
    type Camera,
} from "./fabrication-viewport";

const BOARD = { x: 100, y: 100, width: 40, height: 30 };
// Fabrication layers annotate outside the profile, so the drawn rectangle is
// larger than the board the view fits to.
const DRAWN = { x: 95, y: 96, width: 50, height: 38 };
const PANE = { width: 800, height: 600 };

/** Where a board point lands inside a pane, in pixels. */
function project(point: { x: number; y: number }, camera: Camera) {
    const layout = paneLayout(DRAWN, BOARD, camera, PANE);
    return {
        x: layout.left + (point.x - DRAWN.x) * layout.scale,
        y: layout.top + (point.y - DRAWN.y) * layout.scale,
    };
}

describe("board viewport", () => {
    it("fits the board to the pane, not the annotation around it", () => {
        // Fitting the drawn extent instead leaves the board a fraction of the
        // pane with empty space all around it.
        const layout = paneLayout(DRAWN, BOARD, centreCamera(BOARD), PANE);
        const boardWidth = BOARD.width * layout.scale;
        const boardHeight = BOARD.height * layout.scale;

        expect(Math.max(boardWidth / PANE.width, boardHeight / PANE.height))
            .toBeCloseTo(1, 6);
    });

    it("centres the difference it frames", () => {
        const target = { x: 110, y: 105, width: 0.4, height: 0.4 };

        const centre = project(
            { x: target.x + target.width / 2, y: target.y + target.height / 2 },
            frameCamera(BOARD, target),
        );

        expect(centre.x).toBeCloseTo(PANE.width / 2, 6);
        expect(centre.y).toBeCloseTo(PANE.height / 2, 6);
    });

    it("keeps board around a difference far smaller than the board", () => {
        // Framing a moved vertex to fill the pane shows a featureless field
        // with no pad or trace to locate it against — and at that magnification
        // the layer artwork stops resolving at all.
        const speck = frameCamera(BOARD, { x: 120, y: 115, width: 0.002, height: 0.002 });

        expect(speck.scale).toBeLessThanOrEqual(10);
        expect(paneLayout(DRAWN, BOARD, speck, PANE).scale).toBeGreaterThan(0);
    });

    it("never zooms past the whole board for a board-sized difference", () => {
        expect(frameCamera(BOARD, { ...BOARD }).scale).toBe(1);
    });

    it("holds every pane on the same board point regardless of pane size", () => {
        // Side-by-side panes are measured separately; a camera stored in pixels
        // would drift between them the moment their sizes differed.
        const camera = frameCamera(BOARD, { x: 118, y: 112, width: 1, height: 1 });
        const wide = paneLayout(DRAWN, BOARD, camera, { width: 900, height: 600 });
        const narrow = paneLayout(DRAWN, BOARD, camera, { width: 500, height: 600 });

        const centreOf = (
            layout: ReturnType<typeof paneLayout>,
            pane: { width: number; height: number },
        ) => ({
            x: (pane.width / 2 - layout.left) / layout.scale + DRAWN.x,
            y: (pane.height / 2 - layout.top) / layout.scale + DRAWN.y,
        });

        expect(centreOf(wide, { width: 900, height: 600 })).toEqual(
            centreOf(narrow, { width: 500, height: 600 }),
        );
    });

    it("bounds the zoom range", () => {
        expect(clampScale(1e6)).toBe(40);
        expect(clampScale(0)).toBe(1);
        expect(clampScale(3)).toBe(3);
    });

    it("reports no layout before the pane has been measured", () => {
        const layout = paneLayout(DRAWN, BOARD, centreCamera(BOARD), { width: 0, height: 0 });

        expect(layout.scale).toBe(0);
    });
});
