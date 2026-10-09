import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The tooltip, and the accessible name of an icon-only button. */
  title: string;
  /** Pressed (a toggle) or the current mode. */
  active?: boolean;
  children: ReactNode;
}

/**
 * A button on a FloatingToolbar: icon-only names itself with its title, shown as a tooltip on hover
 * and focus. The native `title` attribute is not used: it shows late or not at all in embedded
 * browsers, and never for keyboard users. The trigger wraps the button so a disabled one still explains itself.
 */
export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(
  { title, active, className, children, ...rest }, ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button ref={ref} type="button" aria-label={rest["aria-label"] ?? title}
            aria-pressed={active === undefined ? undefined : active} {...rest}
            className={cn("flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-xs disabled:opacity-40",
              active ? "bg-accent text-foreground" : "text-muted-foreground enabled:hover:bg-accent/60 enabled:hover:text-foreground", className)}>
            {children}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
});
