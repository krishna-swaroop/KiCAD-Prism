import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** A section on the part sheet that folds: the usual small heading with a chevron before it, closed until opened unless it starts open. */
export function FoldSection({ title, startOpen = false, actions, open: shown, onOpenChange, children }: {
  title: string;
  startOpen?: boolean;
  actions?: ReactNode;
  /** With these the caller holds the state, to open the section itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(startOpen);
  const open = shown ?? inner;
  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };
  return (
    <Collapsible open={open} onOpenChange={setOpen} aria-label={title} className="space-y-2">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="flex items-center gap-1 text-left">
          <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        </CollapsibleTrigger>
        {actions}
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
