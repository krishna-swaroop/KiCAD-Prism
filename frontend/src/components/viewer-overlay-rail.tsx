import {
    useLayoutEffect,
    useRef,
    type MutableRefObject,
    type ReactNode,
} from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    useResizableWidth,
    type UseResizableWidthOptions,
} from "@/components/ui/resizable-panel";
import { cn } from "@/lib/utils";

export type ViewerOverlayRailTab<T extends string> = {
    id: T;
    label: string;
    icon?: ReactNode;
    badge?: ReactNode;
};

export type ViewerOverlayRailResize = Omit<UseResizableWidthOptions, "side">;

/** Schematic/PCB Selection inspector: narrower than Comments, reviewer-resizable. */
export const SELECTION_INSPECTOR_RAIL_RESIZE: ViewerOverlayRailResize = {
    storageKey: "prism.visualizer.selection-inspector.width",
    defaultWidth: 288,
    minWidth: 240,
    maxWidth: 480,
};

type ViewerOverlayRailProps<T extends string> = {
    activeTab: T | null;
    tabs: ViewerOverlayRailTab<T>[];
    onTabChange: (tab: T) => void;
    onClose: () => void;
    onVisibleWidthChange?: (width: number) => void;
    ariaLabel: string;
    className?: string;
    /**
     * When set, the rail width is reviewer-controlled instead of the default
     * `w-96`. Used for the Selection inspector on Schematic/PCB; omit it for
     * Comments and other overlay tools so they keep a fixed width.
     */
    resizable?: ViewerOverlayRailResize;
    children: ReactNode;
};

/**
 * A transform-only rail that floats over a stable viewer canvas. The measured
 * width is reported to the viewer camera as a safe-area inset; it never
 * participates in the canvas layout or calls resize().
 */
export function ViewerOverlayRail<T extends string>(props: ViewerOverlayRailProps<T>) {
    if (props.resizable) {
        return <ResizableViewerOverlayRail {...props} resizable={props.resizable} />;
    }
    return <ViewerOverlayRailFrame {...props} />;
}

function ResizableViewerOverlayRail<T extends string>({
    resizable,
    ariaLabel,
    ...props
}: ViewerOverlayRailProps<T> & { resizable: ViewerOverlayRailResize }) {
    const sizing = useResizableWidth({ side: "right", ...resizable });
    return (
        <ViewerOverlayRailFrame
            {...props}
            ariaLabel={ariaLabel}
            widthPx={sizing.width}
            railRef={sizing.panelRef}
            separator={
                <div
                    {...sizing.separatorProps}
                    aria-label={`Resize ${ariaLabel}`}
                    className={cn(
                        "absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none",
                        sizing.dragging && "bg-primary/60",
                    )}
                />
            }
        />
    );
}

function ViewerOverlayRailFrame<T extends string>({
    activeTab,
    tabs,
    onTabChange,
    onClose,
    onVisibleWidthChange,
    ariaLabel,
    className,
    children,
    widthPx,
    railRef: railRefProp,
    separator,
}: ViewerOverlayRailProps<T> & {
    widthPx?: number;
    railRef?: MutableRefObject<HTMLElement | null>;
    separator?: ReactNode;
}) {
    const internalRef = useRef<HTMLElement | null>(null);
    const railRef = railRefProp ?? internalRef;
    const activeTabRef = useRef(activeTab);
    activeTabRef.current = activeTab;

    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail || !onVisibleWidthChange) return;
        const report = () => {
            onVisibleWidthChange(
                activeTabRef.current ? rail.getBoundingClientRect().width : 0,
            );
        };
        report();
        const observer = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(report);
        observer?.observe(rail);
        return () => {
            observer?.disconnect();
            onVisibleWidthChange(0);
        };
    }, [onVisibleWidthChange, railRef]);

    useLayoutEffect(() => {
        if (!onVisibleWidthChange) return;
        onVisibleWidthChange(
            activeTab
                ? railRef.current?.getBoundingClientRect().width ?? 0
                : 0,
        );
    }, [activeTab, onVisibleWidthChange, railRef, widthPx]);

    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail) return;
        if (activeTab) rail.removeAttribute("inert");
        else rail.setAttribute("inert", "");
    }, [activeTab, railRef]);

    return (
        <aside
            ref={railRef}
            aria-label={ariaLabel}
            aria-hidden={!activeTab}
            style={widthPx == null ? undefined : { width: `${widthPx}px` }}
            className={cn(
                "absolute inset-y-0 right-0 z-40 flex min-w-0 flex-col overflow-hidden border-l bg-background/95 shadow-xl backdrop-blur-sm transition-[transform,opacity] duration-200",
                widthPx == null && "w-96",
                activeTab
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none translate-x-full opacity-0",
                className,
            )}
        >
            {separator}
            <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-card/80 p-1">
                {tabs.map((tab) => (
                    <Button
                        key={tab.id}
                        type="button"
                        size="sm"
                        variant={activeTab === tab.id ? "secondary" : "ghost"}
                        className="h-8 min-w-0 flex-1 text-xs"
                        onClick={() => onTabChange(tab.id)}
                        aria-pressed={activeTab === tab.id}
                    >
                        {tab.icon}
                        <span className="truncate">{tab.label}</span>
                        {tab.badge}
                    </Button>
                ))}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={onClose}
                    aria-label={`Close ${ariaLabel.toLocaleLowerCase()}`}
                >
                    <X className="size-4" />
                </Button>
            </div>
            <div className="min-h-0 min-w-0 flex-1">{children}</div>
        </aside>
    );
}
