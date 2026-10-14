import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { PrismAnalyticReading, PrismSemanticViewerElement } from "@/types/prism-semantic-viewer";

import { formatChange } from "./format";

/** One end of a profile line: where it lies on the copper and the value there. */
export interface ProfileEnd {
    mm: [number, number];
    sliceKey?: string;
    world: [number, number, number];
    value: number;
}

/** A click that moves less than this (px) places a point; more is a camera drag. */
const CLICK_PX = 4;

function endOf(reading: PrismAnalyticReading | null): ProfileEnd | null {
    if (!reading?.boardMm || !reading.world || !Number.isFinite(reading.value)) return null;
    return { mm: reading.boardMm, sliceKey: reading.sliceKey, world: reading.world, value: reading.value as number };
}

/**
 * The profile line on the board. Click a start and an end on the copper; the
 * line follows the cursor in between, with its length and the change in the
 * field, and stays on the copper as the camera moves. A third click starts a
 * new line; Esc clears it. While it runs, clicks don't select on the board.
 */
export function ProfileTool({ viewer, host, active, units, onLine }: {
    viewer: PrismSemanticViewerElement | null;
    host: HTMLElement | null;
    active: boolean;
    units?: string;
    onLine: (line: [ProfileEnd, ProfileEnd] | null) => void;
}) {
    const svg = useRef<SVGSVGElement>(null);
    const path = useRef<SVGLineElement>(null);
    const halo = useRef<SVGLineElement>(null);
    const dotA = useRef<SVGCircleElement>(null);
    const dotB = useRef<SVGCircleElement>(null);
    const pill = useRef<HTMLDivElement>(null);
    const [stage, setStage] = useState<"start" | "end" | "done">("start");
    const [missed, setMissed] = useState(false);
    const report = useRef(onLine);
    report.current = onLine;

    useEffect(() => {
        if (!viewer || !host || !active) return;
        viewer.setClickSelect(false);
        host.style.cursor = "crosshair";
        let a: ProfileEnd | null = null;
        let b: ProfileEnd | null = null;
        let cursor: ProfileEnd | null = null;
        let down: { x: number; y: number } | null = null;
        let frame = 0;
        let missTimer = 0;

        const place = (element: SVGCircleElement | null, point: { x: number; y: number } | null) => {
            if (!element) return;
            element.style.display = point ? "" : "none";
            if (point) {
                element.setAttribute("cx", String(point.x));
                element.setAttribute("cy", String(point.y));
            }
        };
        const draw = () => {
            frame = 0;
            const box = host.getBoundingClientRect();
            const local = (end: ProfileEnd | null) => {
                const point = end ? viewer.projectPoint(end.world) : null;
                return point ? { x: point.x - box.left, y: point.y - box.top } : null;
            };
            const end = b ?? cursor;
            const [pa, pb] = [local(a), local(end)];
            place(dotA.current, pa);
            place(dotB.current, b ? pb : null);
            const show = Boolean(pa && pb);
            if (svg.current) svg.current.style.display = a ? "" : "none";
            for (const line of [halo.current, path.current]) {
                if (!line) continue;
                line.style.display = show ? "" : "none";
                if (pa && pb) {
                    line.setAttribute("x1", String(pa.x));
                    line.setAttribute("y1", String(pa.y));
                    line.setAttribute("x2", String(pb.x));
                    line.setAttribute("y2", String(pb.y));
                }
            }
            if (pill.current) {
                pill.current.style.display = show && a && end ? "" : "none";
                if (pa && pb && a && end) {
                    const length = Math.hypot(end.mm[0] - a.mm[0], end.mm[1] - a.mm[1]);
                    const change = end.value - a.value;
                    pill.current.textContent = `${length.toFixed(2)} mm · Δ ${formatChange(change, units)}`;
                    pill.current.style.transform = `translate(${(pa.x + pb.x) / 2}px, ${(pa.y + pb.y) / 2}px) translate(-50%, -150%)`;
                }
            }
        };
        const redraw = () => { if (!frame) frame = window.requestAnimationFrame(draw); };

        const onDown = (event: PointerEvent) => {
            down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
        };
        const onUp = (event: PointerEvent) => {
            const start = down;
            down = null;
            if (!start || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_PX) return;
            const end = endOf(viewer.analyticProbe(event.clientX, event.clientY));
            if (!end) {
                setMissed(true);
                window.clearTimeout(missTimer);
                missTimer = window.setTimeout(() => setMissed(false), 1600);
                return;
            }
            setMissed(false);
            if (!a || b) {
                a = end;
                b = null;
                cursor = null;
                setStage("end");
            } else {
                b = end;
                setStage("done");
                report.current([a, b]);
            }
            redraw();
        };
        const onMove = (event: PointerEvent) => {
            if (!a || b || event.buttons !== 0) return;
            cursor = endOf(viewer.analyticProbe(event.clientX, event.clientY)) ?? cursor;
            redraw();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !a) return;
            a = null;
            b = null;
            cursor = null;
            setStage("start");
            report.current(null);
            redraw();
        };
        host.addEventListener("pointerdown", onDown);
        host.addEventListener("pointerup", onUp);
        host.addEventListener("pointermove", onMove);
        window.addEventListener("keydown", onKey);
        // The camera moved: the ends stay where they are on the copper.
        const unsubscribe = viewer.onSceneChange(redraw);
        setStage("start");
        redraw();
        return () => {
            viewer.setClickSelect(true);
            host.style.cursor = "";
            host.removeEventListener("pointerdown", onDown);
            host.removeEventListener("pointerup", onUp);
            host.removeEventListener("pointermove", onMove);
            window.removeEventListener("keydown", onKey);
            unsubscribe();
            window.cancelAnimationFrame(frame);
            window.clearTimeout(missTimer);
        };
    }, [active, host, units, viewer]);

    if (!active) return null;
    return (
        <>
            <svg ref={svg} className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" style={{ display: "none" }}>
                <line ref={halo} stroke="black" strokeOpacity={0.45} strokeWidth={4} strokeLinecap="round" />
                <line ref={path} stroke="white" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />
                <circle ref={dotA} r={4.5} fill="hsl(var(--primary))" stroke="white" strokeWidth={1.5} />
                <circle ref={dotB} r={4.5} fill="hsl(var(--primary))" stroke="white" strokeWidth={1.5} />
            </svg>
            <div ref={pill} className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-md border bg-background/95 px-2 py-0.5 font-mono text-xs shadow-sm"
                style={{ display: "none" }} />
            <Badge variant={missed ? "warning" : "info"} className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
                {missed ? "Click on the shown copper" : stage === "start" ? "Click the start of the line" : stage === "end" ? "Click the end · Esc clears" : "Click to start a new line · Esc clears"}
            </Badge>
        </>
    );
}
