import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  /** The answer in a line: "4 parts run out within 2 weeks". */
  answer?: ReactNode;
  /** A caveat that sits behind an info icon. */
  info?: string;
  className?: string;
  children: ReactNode;
}

/** A square card: title, the answer, then the chart. */
export function ChartCard({ title, answer, info, className, children }: ChartCardProps) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-2 border p-3", className)}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
          {info ? <span title={info} aria-label={info} role="img"><Info className="h-3.5 w-3.5" /></span> : null}
        </h3>
      </header>
      {answer ? <p className="text-sm font-medium">{answer}</p> : null}
      <div className="min-w-0">{children}</div>
    </section>
  );
}
