import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Radix-backed tooltip.
 *
 * This replaces a hand-rolled version that positioned itself with static
 * utility classes and only opened on mouse enter. That was enough for the one
 * decorative hint it was written for, but not for explaining why a control is
 * unavailable: those need to reach keyboard users, survive being near a
 * viewport edge, and close on Escape. The exported names and props are
 * unchanged, so the existing call site keeps working.
 */

const TooltipProvider = ({
    delayDuration = 200,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = ({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) => (
    // Each tooltip carries its own provider so a call site can drop one in
    // without the whole app having to be wrapped.
    <TooltipProvider>
        <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
)

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, side = "top", sideOffset = 6, children, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            data-slot="tooltip-content"
            side={side}
            sideOffset={sideOffset}
            className={cn(
                "z-50 max-w-xs border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
                className
            )}
            {...props}
        >
            {children}
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
