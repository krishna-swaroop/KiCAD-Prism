import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Pan and zoom over a board rectangle, shared by every pane of a comparison.
 *
 * The camera is stored in board millimetres — a centre point and a zoom
 * relative to fit — not in pixels. Panes can then be different sizes and still
 * show the same place, and the layout stays correct when the window resizes.
 */

export interface BoardRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Camera {
    /** Multiple of the scale that fits the whole board in a pane. */
    scale: number;
    /** Board point held at the centre of every pane. */
    cx: number;
    cy: number;
}

interface PaneSize {
    width: number;
    height: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 40;

/** Padding around a framed difference, as a multiple of its own size. */
const FRAME_MARGIN = 8;

/**
 * A framed difference never fills more than this share of the pane. A moved
 * vertex is a fraction of a millimetre, and zooming until it fills the view
 * shows a featureless field with no pad or trace to locate it against.
 */
const MIN_FRAME_BOARD_FRACTION = 1 / 10;

export function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function fitScale(board: BoardRect, pane: PaneSize): number {
    if (!board.width || !board.height || !pane.width || !pane.height) return 0;
    return Math.min(pane.width / board.width, pane.height / board.height);
}

/** Camera that frames `target`, keeping enough board around it to locate it. */
export function frameCamera(board: BoardRect, target: BoardRect): Camera {
    const floor = Math.min(board.width, board.height) * MIN_FRAME_BOARD_FRACTION;
    const width = Math.max(target.width * FRAME_MARGIN, floor);
    const height = Math.max(target.height * FRAME_MARGIN, floor);
    return {
        scale: clampScale(Math.min(board.width / width, board.height / height)),
        cx: target.x + target.width / 2,
        cy: target.y + target.height / 2,
    };
}

export function centreCamera(board: BoardRect): Camera {
    return {
        scale: 1,
        cx: board.x + board.width / 2,
        cy: board.y + board.height / 2,
    };
}

/**
 * Where the board sits inside one pane, in CSS pixels.
 *
 * The board is *laid out* at the zoomed size rather than transformed to it, so
 * the browser rasterises each layer's SVG at the size it is shown. A CSS scale
 * would rasterise once at fit size and then magnify that bitmap, which goes
 * unreadable — and eventually blank — a few multiples in.
 */
export function paneLayout(
    drawn: BoardRect,
    board: BoardRect,
    camera: Camera,
    pane: PaneSize,
) {
    // Zoom is relative to the board filling the pane, while the element laid
    // out is the drawn rectangle — which extends past the profile wherever a
    // fabrication or courtyard layer carries annotation off the board.
    const scale = fitScale(board, pane) * camera.scale;
    return {
        width: drawn.width * scale,
        height: drawn.height * scale,
        left: pane.width / 2 - (camera.cx - drawn.x) * scale,
        top: pane.height / 2 - (camera.cy - drawn.y) * scale,
        scale,
    };
}

export function useBoardViewport(board: BoardRect | null) {
    const [camera, setCamera] = useState<Camera | null>(null);
    const paneRef = useRef<PaneSize>({ width: 0, height: 0 });
    const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

    const home = useMemo(
        () => board ? centreCamera(board) : { scale: 1, cx: 0, cy: 0 },
        [board],
    );
    const view = camera ?? home;

    const reset = useCallback(() => setCamera(null), []);

    const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
        if (!board) return;
        setCamera((current) => {
            const from = current ?? centreCamera(board);
            const scale = clampScale(from.scale * factor);
            if (scale === from.scale) return from;
            const pane = paneRef.current;
            if (!anchor || !pane.width || !pane.height) return { ...from, scale };
            // Hold the board point under the cursor still while the zoom changes.
            const fit = fitScale(board, pane);
            const before = fit * from.scale;
            const after = fit * scale;
            const boardX = from.cx + (anchor.x - pane.width / 2) / before;
            const boardY = from.cy + (anchor.y - pane.height / 2) / before;
            return {
                scale,
                cx: boardX - (anchor.x - pane.width / 2) / after,
                cy: boardY - (anchor.y - pane.height / 2) / after,
            };
        });
    }, [board]);

    const frame = useCallback((target: BoardRect) => {
        if (!board) return;
        setCamera(frameCamera(board, target));
    }, [board]);

    const onWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        paneRef.current = { width: box.width, height: box.height };
        zoomBy(Math.pow(0.9985, event.deltaY), {
            x: event.clientX - box.left,
            y: event.clientY - box.top,
        });
    }, [zoomBy]);

    const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
    }, []);

    const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !board) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        const box = event.currentTarget.getBoundingClientRect();
        paneRef.current = { width: box.width, height: box.height };
        const scale = fitScale(board, paneRef.current);
        if (!scale) return;
        setCamera((current) => {
            const from = current ?? centreCamera(board);
            return {
                ...from,
                cx: from.cx - dx / (scale * from.scale),
                cy: from.cy - dy / (scale * from.scale),
            };
        });
    }, [board]);

    const onPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    // Stable identity: a fresh object on every pan frame would defeat the
    // memoisation on the panes it is spread onto.
    const handlers = useMemo(() => ({
        onWheel,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
    }), [onWheel, onPointerDown, onPointerMove, onPointerUp]);

    return { view, reset, zoomBy, frame, handlers };
}
