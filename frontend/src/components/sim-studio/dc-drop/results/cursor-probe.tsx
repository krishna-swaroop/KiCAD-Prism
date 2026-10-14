import { useEffect, useRef } from "react";

import type { PrismAnalyticReading, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { formatValue } from "./format";

/** After the cursor rests this long, one exact (GPU) pick refines the reading: it knows via barrels. */
const REST_MS = 150;

type Point = { clientX: number; clientY: number };

/**
 * The overlay value under the cursor, as a ring on the copper and a label.
 *
 * While the cursor moves, each animation frame reads the field with the
 * viewer's CPU probe (a ray against the copper slices: no GPU work, no
 * readback). When it rests, one GPU pick refines the reading. The marker is
 * updated in place, so moving it renders no React tree, and it follows the
 * board when the camera moves under a still cursor.
 */
export function CursorProbe({ viewer, host, active }: {
    viewer: PrismSemanticViewerElement | null;
    host: HTMLElement | null;
    active: boolean;
}) {
    const svg = useRef<SVGSVGElement>(null);
    const halo = useRef<SVGPolygonElement>(null);
    const ring = useRef<SVGPolygonElement>(null);
    const dot = useRef<SVGCircleElement>(null);
    const label = useRef<HTMLDivElement>(null);
    const value = useRef<HTMLDivElement>(null);
    const where = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!viewer || !host || !active) return;
        let point: Point | null = null;
        let frame = 0;
        let rest = 0;
        let ticket = 0;

        const hide = () => {
            if (svg.current) svg.current.style.display = "none";
            if (label.current) label.current.style.display = "none";
        };
        const show = (hit: PrismAnalyticReading | null) => {
            if (!point || !hit || !Number.isFinite(hit.value)) {
                hide();
                return;
            }
            const box = host.getBoundingClientRect();
            const marker = hit.marker;
            if (marker && svg.current && halo.current && ring.current && dot.current) {
                const points = marker.ring.map((p) => `${p.x - box.left},${p.y - box.top}`).join(" ");
                halo.current.setAttribute("points", points);
                ring.current.setAttribute("points", points);
                dot.current.setAttribute("cx", String(marker.centre.x - box.left));
                dot.current.setAttribute("cy", String(marker.centre.y - box.top));
                svg.current.style.display = "";
            } else if (svg.current) {
                svg.current.style.display = "none";
            }
            if (label.current && value.current && where.current) {
                value.current.textContent = formatValue(hit.value as number, hit.units);
                where.current.textContent = [
                    hit.sliceKey?.replace(/^copper\./, ""),
                    hit.boardMm ? `${hit.boardMm[0].toFixed(2)}, ${hit.boardMm[1].toFixed(2)} mm` : null,
                ].filter(Boolean).join(" · ");
                label.current.style.transform = `translate(${point.clientX - box.left + 14}px, ${point.clientY - box.top + 14}px)`;
                label.current.style.display = "";
            }
        };

        const refine = async () => {
            const at = point;
            const mine = ++ticket;
            if (!at) return;
            try {
                const hit = await viewer.analyticAt(at.clientX, at.clientY);
                if (mine === ticket && point === at) show(hit);
            } catch {
                // Keep the probe's reading.
            }
        };
        const read = () => {
            frame = 0;
            if (!point) return;
            ticket += 1;
            show(viewer.analyticProbe(point.clientX, point.clientY));
        };
        const schedule = () => { if (!frame) frame = window.requestAnimationFrame(read); };

        const move = (event: PointerEvent) => {
            // A held button is the camera being dragged: no reading under it.
            if (event.buttons !== 0) {
                point = null;
                window.clearTimeout(rest);
                hide();
                return;
            }
            point = { clientX: event.clientX, clientY: event.clientY };
            schedule();
            window.clearTimeout(rest);
            rest = window.setTimeout(() => void refine(), REST_MS);
        };
        const leave = () => {
            point = null;
            ticket += 1;
            window.clearTimeout(rest);
            hide();
        };
        host.addEventListener("pointermove", move);
        host.addEventListener("pointerleave", leave);
        // Zoom or a redraw under a still cursor: read again where it is.
        const unsubscribe = viewer.onSceneChange?.(() => { if (point) schedule(); });
        return () => {
            host.removeEventListener("pointermove", move);
            host.removeEventListener("pointerleave", leave);
            unsubscribe?.();
            window.cancelAnimationFrame(frame);
            window.clearTimeout(rest);
            hide();
        };
    }, [active, host, viewer]);

    return (
        <>
            <svg ref={svg} className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" style={{ display: "none" }}>
                <polygon ref={halo} fill="rgba(255,255,255,0.18)" stroke="black" strokeWidth={3} strokeOpacity={0.55} />
                <polygon ref={ring} fill="none" stroke="white" strokeWidth={1.5} />
                <circle ref={dot} r={1.8} fill="white" stroke="black" strokeWidth={0.8} />
            </svg>
            <div ref={label} className="pointer-events-none absolute left-0 top-0 z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow-sm"
                style={{ display: "none" }}>
                <div ref={value} className="font-mono font-medium" />
                <div ref={where} className="text-muted-foreground" />
            </div>
        </>
    );
}
