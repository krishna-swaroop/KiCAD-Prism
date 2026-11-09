import { cn } from "@/lib/utils";
import type { SupplyStatus } from "@/types/supply";
import { STATUS_FILL, STATUS_LABEL } from "./supply-format";

/** The status of a part as a dot, with the words for anyone who cannot see the colour. */
export function StatusDot({ status, className }: { status: SupplyStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", STATUS_FILL[status], className)}
    />
  );
}
