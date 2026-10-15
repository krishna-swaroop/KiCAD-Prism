import type { ComponentProps } from "react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Simulation Studio's segmented tabs, in the look of Design Comparison's
 * Old/New switch: a primary-outlined group whose active segment is filled
 * with the primary colour, so the selection reads at a glance.
 */
export const SEGMENT_GROUP = "inline-flex items-center gap-0.5 rounded-md border border-primary/60 bg-background p-0.5";

/** Classes for one segment; `active` fills it with the primary colour. */
export function segmentItem(active: boolean): string {
    return cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
}

export function StudioTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
    return <TabsList className={cn(SEGMENT_GROUP, "h-auto", className)} {...props} />;
}

export function StudioTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
    return (
        <TabsTrigger
            className={cn(
                "h-7 flex-none rounded-sm border-0 px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground",
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90",
                "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground",
                className,
            )}
            {...props}
        />
    );
}
