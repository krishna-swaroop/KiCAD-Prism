import { RotateCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useOutdatedCount } from "@/lib/server-state";
import { invalidateSupply, SUPPLY_ROOT } from "./supply-writes";

const SUPPLY = [SUPPLY_ROOT] as const;

/**
 * Shown while any supply figure on screen is from an earlier read because the latest one failed (after a write, or on a
 * return to the page): what is shown may not be current. Retry reads every supply resource on screen again.
 */
export function OutOfDateChip() {
  const outdated = useOutdatedCount(SUPPLY);
  const [busy, setBusy] = useState(false);
  if (outdated === 0) return null;
  const retry = () => {
    setBusy(true);
    void invalidateSupply("").finally(() => setBusy(false));
  };
  return (
    <Button
      size="sm" variant="outline" className="h-7 gap-1 border-warning/60 text-warning" onClick={retry} disabled={busy}
      aria-label="Out of date. Read again"
    >
      <RotateCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Out of date
    </Button>
  );
}
