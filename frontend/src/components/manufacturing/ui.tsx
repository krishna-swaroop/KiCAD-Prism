import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// A native <select> with a reliable, theme-aware chevron. The browser arrow is
// removed (appearance-none) and a lucide ChevronDown is positioned over the right
// edge, so it renders identically everywhere and follows the text color. `pr-7`
// keeps the value clear of the icon.
//
// Height defaults to compact (h-7); pass a className height to override.
export const CompactSelect = React.forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement> & { widthClass?: string }
>(function CompactSelect({ className, widthClass = "w-full", children, ...props }, ref) {
    return (
        <div className={cn("relative", widthClass)}>
            <select
                ref={ref}
                className={cn(
                    "h-7 w-full appearance-none rounded-md border bg-background pl-2 pr-7 text-xs",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    className,
                )}
                {...props}
            >
                {children}
            </select>
            <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
        </div>
    );
});

// Compact field spacing used throughout the spec form and dialogs.
export const FIELD_GAP = "space-y-1";
export const GROUP_GRID = "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3";
