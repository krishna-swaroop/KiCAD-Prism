import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatTileProps {
    icon: LucideIcon;
    label: string;
    /** The figure. Pass `children` instead to put a control (an input) in its place. */
    value?: ReactNode;
    /** A line under the figure. */
    hint?: ReactNode;
    /** Beside the label, e.g. an edit button. */
    action?: ReactNode;
    children?: ReactNode;
    className?: string;
}

/** A figure under a small uppercase label with its icon, as the Supply dashboard tiles. */
export function StatTile({ icon: Icon, label, value, hint, action, children, className }: StatTileProps) {
    return (
        <div className={cn("flex flex-col gap-1 border p-3", className)}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                </span>
                {action}
            </div>
            {children ?? <span className="text-2xl font-semibold tabular-nums">{value}</span>}
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
    );
}
