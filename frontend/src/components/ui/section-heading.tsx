import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeadingProps {
    title: string;
    /** A count shown after the title. */
    count?: number;
    /** Buttons at the right of the heading row. */
    actions?: ReactNode;
    className?: string;
}

/**
 * The small uppercase heading over a section of a sheet or panel, as on the
 * Supply part sheet: no box around it, content follows at `space-y-2`.
 */
export function SectionHeading({ title, count, actions, className }: SectionHeadingProps) {
    return (
        <div className={cn("flex min-h-7 flex-wrap items-center justify-between gap-2", className)}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
                {count !== undefined && <span className="ml-1.5 font-normal tabular-nums">{count}</span>}
            </h3>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
