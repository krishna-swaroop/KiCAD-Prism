import { AlertTriangle, Ban, Layers, Star, Hourglass, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { JlcClass, SupplyLifecycle } from "@/types/supply";
import { LIFECYCLE_LABEL } from "./supply-format";

/** One vocabulary of small icons for lists, tables, bars and cards. Each carries its words as the accessible name and tooltip. */
function Glyph({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return <Icon role="img" aria-label={label} className={cn("inline h-4 w-4 shrink-0", className)}><title>{label}</title></Icon>;
}

const LIFECYCLE_ICON: Record<Exclude<SupplyLifecycle, "active" | "unknown">, { icon: LucideIcon; tone: string }> = {
  nrnd: { icon: AlertTriangle, tone: "text-warning" },
  last_time_buy: { icon: Hourglass, tone: "text-warning" },
  obsolete: { icon: Ban, tone: "text-destructive" },
};

/** Lifecycle as an icon. Active and unknown show nothing. */
export function LifecycleIcon({ lifecycle }: { lifecycle: SupplyLifecycle }) {
  if (lifecycle === "active" || lifecycle === "unknown") return null;
  const { icon, tone } = LIFECYCLE_ICON[lifecycle];
  return <Glyph icon={icon} label={LIFECYCLE_LABEL[lifecycle]} className={tone} />;
}

/** A BOM row holds several different parts. */
export function MixedIcon() {
  return <Glyph icon={Layers} label="Mixed: several different parts" className="text-muted-foreground" />;
}

/** JLCPCB's class of a part: Basic parts carry no setup fee, Extended ones do; a star marks the preferred list. Nothing when JLCPCB has no answer. */
export function JlcIcon({ jlc }: { jlc: JlcClass | null | undefined }) {
  if (!jlc || (!jlc.library && !jlc.preferred)) return null;
  const label = `JLCPCB ${jlc.library ? jlc.library.toLowerCase() : "listed"}${jlc.preferred ? ", preferred" : ""}`;
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 items-center gap-0.5 rounded border px-1 text-[10px] font-semibold leading-4 text-muted-foreground">
      {jlc.library === "Basic" ? "B" : jlc.library === "Extended" ? "E" : "J"}
      {jlc.preferred ? <Star aria-hidden className="h-2.5 w-2.5 fill-current" /> : null}
    </span>
  );
}

/** A number with an icon; the words are its tooltip and its text for screen readers. */
export function StatChip({ icon: Icon, value, text, className }: { icon: LucideIcon; value: string; text: string; className?: string }) {
  return (
    <span title={text} className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      <span aria-hidden>{value}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
