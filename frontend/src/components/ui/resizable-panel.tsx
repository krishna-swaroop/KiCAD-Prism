import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * A side panel whose width belongs to the reviewer, not to its contents.
 *
 * Content-sized panels are the failure this exists to prevent: one long
 * datasheet URL or part description would otherwise widen the panel and shrink
 * the canvas, so the workspace reflowed every time a different item was
 * selected. Here the width is state, the content wraps inside it, and the only
 * thing that changes it is the reviewer dragging the edge.
 *
 * The chosen width persists per `storageKey`, because a reviewer who has sized
 * their queue and their property sheet has expressed a layout preference, not
 * made a one-off adjustment.
 */

export type ResizablePanelProps = {
    /** Which edge carries the drag handle. */
    side: "left" | "right";
    /** Identifies this panel's width in localStorage. */
    storageKey: string;
    defaultWidth: number;
    minWidth?: number;
    maxWidth?: number;
    className?: string;
    "aria-label"?: string;
    children: ReactNode;
};

/** Horizontal room a panel must leave for the canvas and the other panel. */
const RESERVED_FOR_CONTENT = 480;

function readStoredWidth(key: string, fallback: number): number {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function ResizablePanel({
    side,
    storageKey,
    defaultWidth,
    minWidth = 240,
    maxWidth = 720,
    className,
    "aria-label": ariaLabel,
    children,
}: ResizablePanelProps) {
    const clamp = useCallback(
        (value: number) => Math.min(maxWidth, Math.max(minWidth, value)),
        [maxWidth, minWidth],
    );
    const [width, setWidth] = useState(
        () => clamp(readStoredWidth(storageKey, defaultWidth)),
    );
    const [dragging, setDragging] = useState(false);
    const panelRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        window.localStorage.setItem(storageKey, String(width));
    }, [storageKey, width]);

    /**
     * On a viewport too narrow to hold the panel and still show the design, the
     * panel yields — the canvas is the thing being reviewed.
     *
     * Deliberately a floor on what is left over rather than a fraction of the
     * viewport: a percentage cap also fires on perfectly roomy windows and
     * would silently overwrite a width the reviewer had chosen.
     */
    useEffect(() => {
        const fit = () => setWidth((current) => Math.round(Math.min(
            clamp(current),
            Math.max(minWidth, window.innerWidth - RESERVED_FOR_CONTENT),
        )));
        fit();
        window.addEventListener("resize", fit);
        return () => window.removeEventListener("resize", fit);
    }, [clamp, minWidth]);

    const widthFrom = useCallback((clientX: number): number => {
        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return width;
        return clamp(
            side === "left" ? clientX - rect.left : rect.right - clientX,
        );
    }, [clamp, side, width]);

    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
    };

    const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setWidth(widthFrom(event.clientX));
    };

    const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
    };

    // Keyboard resizing: a pointer-only affordance is unusable for anyone who
    // cannot drag, and the separator role is meaningless without it.
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 64 : 16;
        const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
        const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
        if (event.key === grow) {
            event.preventDefault();
            setWidth((current) => clamp(current + step));
        } else if (event.key === shrink) {
            event.preventDefault();
            setWidth((current) => clamp(current - step));
        } else if (event.key === "Home") {
            event.preventDefault();
            setWidth(clamp(defaultWidth));
        }
    };

    return (
        <aside
            ref={panelRef}
            aria-label={ariaLabel}
            // Width is an inline style rather than a utility class on purpose:
            // it is reviewer state, and a Tailwind class cannot carry it.
            style={{ width: `${width}px` }}
            className={cn(
                "relative flex h-full min-w-0 shrink-0 flex-col overflow-hidden bg-background",
                side === "left" ? "border-r" : "border-l",
                className,
            )}
        >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {children}
            </div>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${ariaLabel ?? "panel"}`}
                aria-valuenow={width}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                onDoubleClick={() => setWidth(clamp(defaultWidth))}
                className={cn(
                    "absolute inset-y-0 z-20 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none",
                    dragging && "bg-primary/60",
                    side === "left" ? "right-0" : "left-0",
                )}
            />
        </aside>
    );
}
