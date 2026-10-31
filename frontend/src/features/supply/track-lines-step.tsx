import { Button } from "@/components/ui/button";

export interface TrackLine {
  mpn: string;
  manufacturer: string;
  candidates: Array<{ part_id: string; manufacturer: string }>;
}

/** Lines whose number several makers share: pick the part each one means, one click. */
export function TrackLinesStep({ lines, busy, onChoose }: { lines: readonly TrackLine[]; busy: boolean; onChoose: (line: TrackLine, partId: string) => void }) {
  return (
    <ul className="max-h-[50vh] divide-y themed-scrollbar overflow-y-auto border" aria-label="Lines to settle">
      {lines.map((line) => (
        <li key={`${line.mpn}|${line.manufacturer}`} className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{line.mpn}</span>
            <span className="bg-secondary px-2 py-0.5 text-xs">{line.manufacturer ? `written as ${line.manufacturer}` : "no maker on the line"}</span>
          </div>
          {line.manufacturer ? (
            <div className="flex flex-wrap gap-2">
              {line.candidates.map((candidate) => (
                <Button key={candidate.part_id} size="sm" variant="outline" disabled={busy} onClick={() => onChoose(line, candidate.part_id)}>
                  {candidate.manufacturer}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Name the maker on the symbol, or choose it in Review.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
