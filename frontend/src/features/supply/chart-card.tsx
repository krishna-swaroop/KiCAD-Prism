import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  /** The answer in a line: "4 parts run out within 2 weeks". */
  answer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A square card: title, the answer, then the chart. */
export function ChartCard({ title, answer, className, children }: ChartCardProps) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-2 border p-3", className)}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </header>
      {answer ? <p className="text-sm font-medium">{answer}</p> : null}
      <div className="min-w-0">{children}</div>
    </section>
  );
}
