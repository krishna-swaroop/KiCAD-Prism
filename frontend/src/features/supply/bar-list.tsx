import { cn } from "@/lib/utils";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** A tailwind background class; unknown is grey. */
  tone?: string;
  onClick?: () => void;
}

/** Rows of a label, a bar and a count. A zero draws faint, not blank; a row with a click opens the parts behind it. */
export function BarList({ rows, labelWidth = "9rem" }: { rows: readonly BarRow[]; labelWidth?: string }) {
  const largest = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const body = (
          <>
            <span className="truncate">{row.label}</span>
            <span className="h-4 bg-muted/30"><span className={cn("block h-full", row.value === 0 ? "bg-muted" : (row.tone ?? "bg-primary"))} style={{ width: `${Math.max((row.value / largest) * 100, row.value === 0 ? 2 : 0)}%` }} /></span>
            <span className="text-right tabular-nums">{row.value.toLocaleString()}</span>
          </>
        );
        const className = "grid w-full items-center gap-2 text-left text-xs";
        const style = { gridTemplateColumns: `${labelWidth} 1fr 3rem` };
        return (
          <li key={row.key}>
            {row.onClick ? (
              <button type="button" className={cn(className, "hover:bg-muted/30")} style={style} onClick={row.onClick} aria-label={`${row.label}: ${row.value}`}>{body}</button>
            ) : <div className={className} style={style}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
