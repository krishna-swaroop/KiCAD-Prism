import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LogTerminalProps {
  entries: string[];
  dropped?: number;
  onClear: () => void;
}

export function LogTerminal({ entries, dropped = 0, onClear }: LogTerminalProps) {
  const [open, setOpen] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [entries, open]);

  const lastEntry = entries[entries.length - 1];

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-border/50 bg-[hsl(222,60%,5%)]">
      <div className="flex w-full items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Transfer Log
          </span>
          {!open && lastEntry ? (
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/70">
              {lastEntry}
            </span>
          ) : null}
        </button>
        {entries.length > 0 && open ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onClear}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse transfer log" : "Expand transfer log"}
          className="shrink-0 text-muted-foreground"
        >
          {open ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
      {open ? (
        <pre
          ref={preRef}
          className="max-h-40 min-h-[3rem] overflow-auto whitespace-pre-wrap border-t border-border/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground/80"
        >
          {entries.length === 0
            ? "No transfers yet."
            : [
                dropped > 0 ? `… ${dropped} earlier ${dropped === 1 ? "entry" : "entries"} dropped` : null,
                ...entries,
              ]
                .filter(Boolean)
                .join("\n")}
        </pre>
      ) : null}
    </section>
  );
}
