/** The board sheet's drag-selection box, in the documents' palette. */
import { normalizeRect, selectionMode } from "../schematic/geometry";
import { COLOURS } from "../schematic/sheet-style";
import type { BoardDrag } from "./board-gestures";

export function BoxRect({ drag }: { drag: BoardDrag | null }) {
  if (drag?.kind !== "box") return null;
  const box = normalizeRect(drag.start, drag.current);
  const crossing = selectionMode(drag.start, drag.current) === "crossing";
  return (
    <rect
      x={box.x / 1e6}
      y={box.y / 1e6}
      width={box.w / 1e6}
      height={box.h / 1e6}
      fill={crossing ? "rgba(180,83,9,0.06)" : "rgba(2,132,199,0.08)"}
      stroke={crossing ? COLOURS.warning : COLOURS.select}
      strokeWidth={0.15}
      strokeDasharray={crossing ? "0.8 0.5" : undefined}
      pointerEvents="none"
    />
  );
}
