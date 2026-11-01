import { cn } from "@/lib/utils";
import { vendorColor } from "./vendor-colors";

interface VendorNameProps {
  provider: string | null | undefined;
  name: string;
  className?: string;
}

/** A distributor's name with its colour as a small square before it. The text keeps the normal colour, so it reads in both themes. */
export function VendorName({ provider, name, className }: VendorNameProps) {
  const color = vendorColor(provider);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {color ? <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} /> : null}
      {name}
    </span>
  );
}
