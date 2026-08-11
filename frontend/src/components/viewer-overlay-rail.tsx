import {
    useLayoutEffect,
    useRef,
    type ReactNode,
} from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewerOverlayRailTab<T extends string> = {
    id: T;
    label: string;
    icon?: ReactNode;
    badge?: ReactNode;
};

type ViewerOverlayRailProps<T extends string> = {
    activeTab: T | null;
    tabs: ViewerOverlayRailTab<T>[];
    onTabChange: (tab: T) => void;
    onClose: () => void;
    onVisibleWidthChange?: (width: number) => void;
    ariaLabel: string;
    className?: string;
    children: ReactNode;
};

/**
 * A transform-only rail that floats over a stable viewer canvas. The measured
 * width is reported to the viewer camera as a safe-area inset; it never
 * participates in the canvas layout or calls resize().
 */
export function ViewerOverlayRail<T extends string>({
    activeTab,
    tabs,
    onTabChange,
    onClose,
    onVisibleWidthChange,
    ariaLabel,
    className,
    children,
}: ViewerOverlayRailProps<T>) {
    const railRef = useRef<HTMLElement | null>(null);
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
    }, [onVisibleWidthChange]);

    useLayoutEffect(() => {
        if (!onVisibleWidthChange) return;
        onVisibleWidthChange(
            activeTab
                ? railRef.current?.getBoundingClientRect().width ?? 0
                : 0,
        );
    }, [activeTab, onVisibleWidthChange]);

    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail) return;
        if (activeTab) rail.removeAttribute("inert");
        else rail.setAttribute("inert", "");
    }, [activeTab]);

    return (
        <aside
            ref={railRef}
            aria-label={ariaLabel}
            aria-hidden={!activeTab}
            className={cn(
                "absolute inset-y-0 right-0 z-40 flex w-96 flex-col border-l bg-background/95 shadow-xl backdrop-blur-sm transition-[transform,opacity] duration-200",
                activeTab
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none translate-x-full opacity-0",
                className,
            )}
        >
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
            <div className="min-h-0 flex-1">{children}</div>
        </aside>
    );
}
