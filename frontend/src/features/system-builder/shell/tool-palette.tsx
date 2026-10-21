/**
 * The schematic tab's floating tool palettes, in the documents' paper style:
 * white, an ink border, square buttons, and the current tool filled with ink.
 */
import { ArrowUp, Boxes, Cable, Maximize, MousePointer2, Plus, Unplug } from "lucide-react";

import type { Tool } from "../schematic/root-sheet-canvas";

// Centred in the space left of the title block (340 px wide, 24 px in from the edge).
const PALETTE = "sb-docs absolute z-20 bottom-4 left-[calc((100%-364px)/2)] flex -translate-x-1/2 items-center gap-0.5 rounded-[3px] border-[1.4px] border-[#1d1d1f] bg-white p-1 shadow-lg";

function ToolButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Plus; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-[2px] px-2.5 py-1.5 text-xs ${active ? "bg-[#1d1d1f] text-white" : "text-[#1d1d1f] hover:bg-[#f7f8fa]"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export interface RootPaletteProps {
  tool: Tool;
  canEdit: boolean;
  onTool: (tool: Tool) => void;
  onAddBoard: () => void;
  onPlaceSystem: () => void;
  onFit: () => void;
}

/** The root sheet's palette: Select always, the editing tools when the user may edit. */
export function RootToolPalette({ tool, canEdit, onTool, onAddBoard, onPlaceSystem, onFit }: RootPaletteProps) {
  return (
    <div className={PALETTE} role="toolbar" aria-label="Schematic tools">
      <ToolButton active={tool === "select"} onClick={() => onTool("select")} icon={MousePointer2} label="Select" />
      {canEdit && <ToolButton active={tool === "mate"} onClick={() => onTool("mate")} icon={Unplug} label="Mate" />}
      {canEdit && <ToolButton active={tool === "harness"} onClick={() => onTool("harness")} icon={Cable} label="Harness (H)" />}
      {canEdit && <ToolButton active={false} onClick={onAddBoard} icon={Plus} label="Add board" />}
      {canEdit && <ToolButton active={false} onClick={onPlaceSystem} icon={Boxes} label="Place system" />}
      <ToolButton active={false} onClick={onFit} icon={Maximize} label="Fit" />
    </div>
  );
}

/** A board sheet's palette: back to the root sheet, and fit. */
export function BoardToolPalette({ onUp, onFit }: { onUp: () => void; onFit: () => void }) {
  return (
    <div className={PALETTE} role="toolbar" aria-label="Sheet tools">
      <ToolButton active={false} onClick={onUp} icon={ArrowUp} label="Up (⌥⌫)" />
      <ToolButton active={false} onClick={onFit} icon={Maximize} label="Fit" />
    </div>
  );
}
