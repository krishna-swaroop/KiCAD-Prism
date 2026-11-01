import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const STORAGE = "prism.supply.sections";
/** A section with more items than this starts closed. */
const LONG = 10;

function remembered(id: string): boolean | undefined {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE) ?? "{}") as Record<string, boolean>;
    return typeof stored[id] === "boolean" ? stored[id] : undefined;
  } catch {
    return undefined;
  }
}

function remember(id: string, open: boolean) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE) ?? "{}") as Record<string, boolean>;
    window.localStorage.setItem(STORAGE, JSON.stringify({ ...stored, [id]: open }));
  } catch {
    // Not remembered; the section still opens and closes.
  }
}

interface CollapsibleSectionProps {
  /** Names the section in the viewer's remembered choices. */
  id: string;
  title: string;
  /** How many items it holds; negative shows no count. */
  count: number;
  /** A line shown beside the count, such as what picking saves. */
  note?: string;
  /** Small marks after the count (status chips). */
  chips?: ReactNode;
  /** Lines under the title, read as part of the closed row. */
  summary?: ReactNode;
  /** Buttons at the right of the row, outside what opens and closes it. */
  actions?: ReactNode;
  /** Opens at first whatever the count, until the viewer chooses. */
  startOpen?: boolean;
  /** False: the viewer's earlier choice is neither used nor kept (an open group while searching). */
  remembers?: boolean;
  /** The row stays at the top of the scrolling parent while its content scrolls under it. */
  stickyHeader?: boolean;
  className?: string;
  children: ReactNode;
}

/** A titled section that opens and closes, with its count in a chip. Closed at first when it is long; the choice is remembered. */
export function CollapsibleSection({ id, title, count, note, chips, summary, actions, startOpen, remembers = true, stickyHeader = false, className, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => (remembers ? remembered(id) : undefined) ?? startOpen ?? count <= LONG);
  const change = (next: boolean) => { setOpen(next); if (remembers) remember(id, next); };
  return (
    <Collapsible open={open} onOpenChange={change} className={cn("border", className)} aria-label={title} data-slot="section">
      <div className={cn("flex items-start bg-muted/30 hover:bg-muted/50", stickyHeader && "sticky top-0 z-20 bg-muted")}>
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left">
          <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
              {count >= 0 ? <span className="bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span> : null}
              {chips}
              {note ? <span className="ml-auto text-xs text-muted-foreground">{note}</span> : null}
            </span>
            {summary}
          </span>
        </CollapsibleTrigger>
        {actions ? <div className="flex shrink-0 items-center px-2 py-1.5">{actions}</div> : null}
      </div>
      <CollapsibleContent className="border-t">{children}</CollapsibleContent>
    </Collapsible>
  );
}
