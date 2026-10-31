import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplyConnector, TrackingPreview } from "@/types/supply";
import { TrackCostBars } from "./track-cost-bars";
import { TrackSpares } from "./track-spares";

export type ProjectPackaging = "cut_tape" | "custom_reel" | "tape_reel" | "tube_tray" | "smallest";

interface ChooseProps {
  designs: readonly string[];
  followed: ReadonlySet<string>;
  allDesigns: boolean;
  onDesign: (name: string, on: boolean) => void;
  onAllDesigns: (on: boolean) => void;
  regular: readonly SupplyConnector[];
  assembly: readonly SupplyConnector[];
  bought: ReadonlySet<string>;
  onConnector: (id: string, on: boolean) => void;
  packaging: ProjectPackaging;
  onPackaging: (next: ProjectPackaging) => void;
  buildQuantity: number;
  onBuildQuantity: (next: number) => void;
  /** "" the workspace's setting, "auto" by package, else a percent. */
  spares: string;
  onSpares: (next: string) => void;
  preview: TrackingPreview | null;
  onRaise?: (connectorId: string) => void;
}

function Row({ id, label, checked, disabled, onChange, note }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void; note?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 hover:bg-muted/30">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(on) => onChange(on === true)} />
      <Label htmlFor={id} className="flex-1 font-medium">{label}</Label>
      {note ? <span className="bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}

const PACKAGING: ReadonlyArray<{ id: ProjectPackaging; label: string; hint: string }> = [
  { id: "cut_tape", label: "Cut tape", hint: "Any quantity, the usual for prototypes" },
  { id: "custom_reel", label: "Custom reel (Digi-Reel, MouseReel)", hint: "A reel cut to your quantity, with a reeling fee" },
  { id: "tape_reel", label: "Full reel", hint: "The whole reel, the usual for production" },
  { id: "tube_tray", label: "Tube or tray", hint: "As the maker packs it" },
  { id: "smallest", label: "Smallest order (any)", hint: "Whatever has the smallest minimum order" },
];

/** The choices that start tracking a project, each preselected to the usual answer, and what they cost. */
export function TrackChooseStep(props: ChooseProps) {
  const { designs, followed, allDesigns, regular, assembly, bought, packaging, preview } = props;
  return (
    <div className="space-y-4">
      {designs.length > 1 ? (
        <section aria-label="Designs" className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Designs</h3>
          <div className="divide-y border">
            {designs.map((name) => (
              <Row key={name || "base"} id={`var-${name || "base"}`} label={name || "Base design"} checked={allDesigns || followed.has(name)} disabled={allDesigns} onChange={(on) => props.onDesign(name, on)} />
            ))}
            <Row id="var-all" label="Also designs added later" checked={allDesigns} onChange={props.onAllDesigns} note="all" />
          </div>
        </section>
      ) : null}

      <section aria-label="Bought from" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Bought from</h3>
        <div className="divide-y border">
          {regular.map((item) => <Row key={item.id} id={`con-${item.id}`} label={item.display_name} checked={bought.has(item.id)} onChange={(on) => props.onConnector(item.id, on)} />)}
          {assembly.map((item) => <Row key={item.id} id={`con-${item.id}`} label={`Built at ${item.display_name}`} checked={bought.has(item.id)} onChange={(on) => props.onConnector(item.id, on)} note="assembly" />)}
        </div>
      </section>

      <section aria-label="Packaging" className="space-y-1">
        <Label htmlFor="track-packaging" className="text-xs font-medium text-muted-foreground">Packaging</Label>
        <select
          id="track-packaging" value={packaging} onChange={(event) => props.onPackaging(event.target.value as ProjectPackaging)}
          className="h-9 w-full border bg-background px-3 text-sm"
        >
          {PACKAGING.map((option) => <option key={option.id} value={option.id} title={option.hint}>{option.label}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{PACKAGING.find((option) => option.id === packaging)?.hint}. Where a distributor does not offer it, the nearest is followed.</p>
      </section>

      <section aria-label="Usual build" className="space-y-1">
        <Label htmlFor="track-build" className="text-xs font-medium text-muted-foreground">Usual build, in boards</Label>
        <Input
          id="track-build" type="number" min={1} max={1_000_000} className="h-9 w-32" value={props.buildQuantity}
          onChange={(event) => { const next = Math.floor(Number(event.target.value)); if (Number.isFinite(next) && next >= 1 && next <= 1_000_000) props.onBuildQuantity(next); }}
        />
        <p className="text-xs text-muted-foreground">The project's cost is worked out for this many boards each day, and its page opens on it.</p>
      </section>

      <TrackSpares spares={props.spares} onChange={props.onSpares} />

      {preview ? (
        <section aria-label="Cost" className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Daily call limit</h3>
          <TrackCostBars connectors={preview.connectors} onRaise={props.onRaise} />
          {preview.fits_nowhere ? <p className="text-sm text-destructive">Nothing fits at any distributor.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
