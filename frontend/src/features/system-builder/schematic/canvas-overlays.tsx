/** What the canvas draws over the sheet: the paper grid, the connect band, the drag box and the hints. */
import type { SystemDocument } from "../model/types";
import type { PinRef } from "./edits";
import { normalizeRect, selectionMode, type Point } from "./geometry";
import type { Drag } from "./gestures";
import type { Scene } from "./scene";
import { COLOURS, FONT } from "./sheet-style";
import { toScreen, type View } from "./viewport";

/** KiCad's dot grid at 2.54 mm, in screen space; hidden when the dots would crowd. */
export function PaperGrid({ view }: { view: View }) {
  const grid = 2.54 * view.scale;
  const origin = toScreen(view, { x: 0, y: 0 });
  if (grid < 6) return null;
  return (
    <>
      <defs>
        <pattern id="sb-grid" width={grid} height={grid} patternUnits="userSpaceOnUse" x={origin.x % grid} y={origin.y % grid}>
          <circle cx={0.75} cy={0.75} r={Math.min(0.9, Math.max(0.4, grid / 30))} fill={COLOURS.grid} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#sb-grid)" />
    </>
  );
}

/** The rubber band from the first connector to the pointer, and the drag selection box (sheet space). */
export function GestureOverlay({ scene, connectFrom, pointer, drag, kind }: { scene: Scene; connectFrom: PinRef | null; pointer: Point | null; drag: Drag | null; kind: "mate" | "harness" }) {
  const from = connectFrom
    ? scene.symbols.find((symbol) => symbol.id === connectFrom.item)?.ports.find((port) => port.key === connectFrom.key)?.point
    : undefined;
  const box = drag?.kind === "box" ? normalizeRect(drag.start, drag.current) : null;
  const crossing = drag?.kind === "box" && selectionMode(drag.start, drag.current) === "crossing";
  return (
    <>
      {from && pointer && (
        <line
          x1={from.x / 1e6}
          y1={from.y / 1e6}
          x2={pointer.x / 1e6}
          y2={pointer.y / 1e6}
          stroke={COLOURS.ink}
          strokeWidth={kind === "mate" ? 0.45 : 0.3}
          strokeDasharray={kind === "mate" ? undefined : "1 0.6"}
          pointerEvents="none"
        />
      )}
      {box && (
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
      )}
    </>
  );
}

function labelOf(document: SystemDocument, pin: PinRef): string {
  const label = document.occurrences.find((item) => item.id === pin.item)?.label ?? pin.item;
  return `${label}.${pin.key}`;
}

/** The empty-sheet note and the connect tools' instructions (screen space). */
export function CanvasHints({ empty, tool, connectFrom, document }: { empty: boolean; tool: "select" | "mate" | "harness"; connectFrom: PinRef | null; document: SystemDocument }) {
  return (
    <>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm" style={{ color: COLOURS.muted, fontFamily: FONT.body }}>
          No boards yet. Use Add board to place one.
        </div>
      )}
      {tool !== "select" && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-xs"
          style={{ background: COLOURS.white, border: `1.4px solid ${COLOURS.ink}`, borderRadius: 3, color: COLOURS.ink, fontFamily: FONT.body }}
        >
          {connectFrom ? `From ${labelOf(document, connectFrom)}: click the other connector` : tool === "mate" ? "Mate: click a connector" : "Harness: click a connector"} · Esc to stop
        </div>
      )}
    </>
  );
}
