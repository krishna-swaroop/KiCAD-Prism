import { Box, Disc3, Layers, LayoutGrid, Package, Scissors, SlidersHorizontal } from "lucide-react";
import type { ComponentType } from "react";

import { packagingName } from "./supply-format";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  cut_tape: Scissors,
  custom_reel: SlidersHorizontal,
  tape_reel: Disc3,
  tray: LayoutGrid,
  tube: Box,
  bulk: Package,
  several: Layers,
};

/** A listing's packaging as an icon and the word ("Cut tape / Custom reel" when it is sold both ways on the same terms), with the reel size when it is a reel. A guess is italic and says so on hover. */
export function PackagingChip({ packaging, reelSize, inferred, also = [] }: { packaging: string; reelSize?: number | null; inferred?: boolean; also?: readonly string[] }) {
  const name = [packagingName(packaging, reelSize ?? null), ...also.map((item) => packagingName(item))].filter(Boolean).join(" / ");
  if (!name) return null;
  const Icon = ICONS[packaging] ?? Package;
  return (
    <span className={`inline-flex items-center gap-1 ${inferred ? "italic" : ""}`} title={inferred ? "Guessed from the number and the order terms" : undefined}>
      <Icon className="h-3 w-3 shrink-0" />{name}
    </span>
  );
}
