import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon?: LucideIcon;
    /** Colour for the icon, e.g. `text-success`. */
    iconClassName?: string;
    children: ReactNode;
    /** The button that fixes it, or a line saying who can. */
    action?: ReactNode;
    /** Pass `border-0 flex-1` to fill a box that already has a border. */
    className?: string;
}

/** One empty state for every manufacturing list and panel. */
export function EmptyState({ icon: Icon, iconClassName, children, action, className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 border border-dashed p-8 text-center text-muted-foreground",
                className,
            )}
        >
            {Icon && <Icon className={cn("h-8 w-8 opacity-50", iconClassName)} aria-hidden />}
            <div className="text-sm">{children}</div>
            {action}
        </div>
    );
}
