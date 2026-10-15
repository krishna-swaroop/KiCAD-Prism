import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
        ref={ref}
        className={cn(
            "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
            className,
        )}
        {...props}
    >
        <SwitchPrimitive.Thumb
            className="pointer-events-none block size-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-px"
        />
    </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

export { Switch }
