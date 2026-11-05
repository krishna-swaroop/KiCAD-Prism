import type { ForecastModelState } from "@/types/supply";
import { chipText } from "./forecast-text";

/** The dashed "Learning" (or "Paused") chip that goes with a forecast whose model has not earned a place. Nothing for a shown one. */
export function ModelChip({ model }: { model: ForecastModelState | undefined }) {
  if (!model || model.state === "shown") return null;
  const { label, title } = chipText(model);
  return (
    <span title={title} className="inline-flex shrink-0 items-center border border-dashed px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}
