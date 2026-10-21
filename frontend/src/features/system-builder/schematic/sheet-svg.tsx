/**
 * Draws a `Scene` the way the harness documents draw a sheet (mockup 11):
 * paper, ink cards and the documents' type, in the palette of
 * `backend/app/release_studio`'s PDFs. Pure rendering: everything a gesture
 * needs to hit is tagged with `data-hit` and its ids, and the canvas does the
 * rest.
 *
 * Coordinates inside are millimetres (the scene's nanometres / 10⁶), so text
 * and strokes scale with zoom as in KiCad.
 */
import { memo } from "react";

import { ConnectionView } from "./connection-view";
import { SheetDefs } from "./sheet-parts";
import { FONT } from "./sheet-style";
import { Handles, SymbolView } from "./symbol-view";
import type { Scene } from "./scene";

export { COLOURS } from "./sheet-style";

export interface SheetSvgProps {
  scene: Scene;
  /** Selected symbol and connection ids. */
  selected: ReadonlySet<string>;
  /** Selected pins, `${item}\0${key}`. */
  selectedPorts?: ReadonlySet<string>;
  /** Draw resize handles on these symbols. */
  resizable?: ReadonlySet<string>;
}

/** The scene's drawing, without paper or viewport (the canvas supplies both). */
export const SheetSvg = memo(function SheetSvg({ scene, selected, selectedPorts = new Set(), resizable = new Set() }: SheetSvgProps) {
  return (
    <g fontFamily={FONT.body}>
      <SheetDefs />
      {scene.connections.map((connection) => (
        <ConnectionView key={connection.id} connection={connection} selected={selected.has(connection.id)} />
      ))}
      {scene.symbols.map((symbol) => (
        <SymbolView key={symbol.id} symbol={symbol} selected={selected.has(symbol.id)} selectedPorts={selectedPorts} />
      ))}
      {scene.symbols.flatMap((symbol) => (resizable.has(symbol.id) ? [<Handles key={symbol.id} symbol={symbol} />] : []))}
    </g>
  );
});
