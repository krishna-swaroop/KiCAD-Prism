import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The info icon that opens what is behind a figure: on hover, and held open by a click so a form inside it can be used.
 * Moving off it closes it again unless it was clicked.
 */
export function HoverDetails({ label, children }: { label: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  return (
    <Popover
      open={hover || pinned}
      onOpenChange={(next) => { if (!next) { setHover(false); setPinned(false); } }}
    >
      <PopoverTrigger asChild>
        <button
          type="button" aria-label={label}
          className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          onClick={() => setPinned((current) => !current)}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start" className="max-h-96 w-[min(30rem,90vw)] gap-2 themed-scrollbar overflow-y-auto p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
