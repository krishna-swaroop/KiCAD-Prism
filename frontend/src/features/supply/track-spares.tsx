import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "default" | "percent" | "auto";

const modeOf = (spares: string): Mode => (spares === "" ? "default" : spares === "auto" ? "auto" : "percent");

/** The spares the project's cost is worked out with: the workspace's setting, one percent for every part, or by package. */
export function TrackSpares({ spares, onChange }: { spares: string; onChange: (next: string) => void }) {
  const mode = modeOf(spares);
  return (
    <section aria-label="Costing spares" className="space-y-1">
      <Label htmlFor="track-spares" className="text-xs font-medium text-muted-foreground">Spares</Label>
      <div className="flex items-center gap-2">
        <select
          id="track-spares" value={mode} className="h-9 border bg-background px-3 text-sm"
          onChange={(event) => onChange(event.target.value === "default" ? "" : event.target.value === "auto" ? "auto" : "0")}
        >
          <option value="default">The workspace's setting</option>
          <option value="percent">A percent of every part</option>
          <option value="auto">By package</option>
        </select>
        {mode === "percent" ? (
          <label className="flex items-center gap-1.5 text-sm">
            <Input
              type="number" min={0} max={100} step={1} className="h-9 w-20" aria-label="Spare parts, percent" value={spares}
              onChange={(event) => { const next = Number(event.target.value); if (event.target.value !== "" && Number.isFinite(next) && next >= 0 && next <= 100) onChange(String(next)); }}
            />
            %
          </label>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Extra parts on top of what the boards use, in the project's costing, its daily cost and the costing file. By package uses the figures for small passives and other parts in Supply settings.</p>
    </section>
  );
}
