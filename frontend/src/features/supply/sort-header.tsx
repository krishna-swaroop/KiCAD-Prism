import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** A column name that sorts the list when clicked, with the two arrows, one lit for the direction it is on. */
export function SortHeader({ label, direction, onSort, align = "left" }: {
  label: string;
  /** The direction the list is sorted by this column in, or null when it is not. */
  direction: "asc" | "desc" | null;
  onSort: () => void;
  align?: "left" | "right";
}) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse", direction && "text-foreground")}
      aria-label={`Sort by ${label}`}
      onClick={onSort}
    >
      {label}
      <Icon className={cn("h-3 w-3", !direction && "opacity-50")} aria-hidden />
    </button>
  );
}

/** The `aria-sort` of a header. */
export function ariaSort(direction: "asc" | "desc" | null): "ascending" | "descending" | "none" {
  return direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";
}
