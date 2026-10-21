/**
 * Inside a board's sheet (CONTRACTS §14.3): unfold a connector's bus,
 * select its wires with KiCad's window or crossing, press G to group them as
 * a sub-port, fold it back. The board symbol, its pins and labels move;
 * nothing else is editable. Alt/Option+Backspace leaves.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import type { Interior, SubPort, SystemBundle, SystemDocument, SystemOp } from "../model/types";
import { PaperGrid } from "../schematic/canvas-overlays";
import { normalizeRect, selectionMode } from "../schematic/geometry";
import { hitAt, hitOf, toggled } from "../schematic/gestures";
import { COLOURS } from "../schematic/sheet-svg";
import { SheetChrome } from "../schematic/sheet-frame";
import { capture, isPanButton, useSheetView } from "../schematic/use-sheet-view";
import { panBy, toSheet } from "../schematic/viewport";
import { groupOps, groupRefusal, interiorOps, orderedPads } from "./board-edits";
import { boxWires, interiorDrag, storedInterior, type BoardDrag } from "./board-gestures";
import { buildBoardScene, parseWireKey, wireKey, type BoardScene } from "./board-scene";
import { BoardSheetSvg } from "./board-sheet-svg";
import { BoxRect } from "./box-rect";
import { ExportPinsCard } from "../publish/export-pins-card";
import { BoardSidePanel } from "./board-side-panel";
import { GroupPopover } from "./group-popover";

interface Props {
  /** The connectors this user unfolded on this board (kept by the page, §14.1). */
  unfolded: ReadonlySet<string>;
  onUnfoldedChange: (next: Set<string>) => void;
  document: SystemDocument;
  bundle?: SystemBundle;
  occurrence: string;
  canEdit: boolean;
  apply: (ops: SystemOp[]) => Promise<unknown>;
  onLeave: () => void;
  /** The system's name, version and bundle key for the title block. */
  systemName?: string;
  version?: number;
  bundleKey?: string;
}

export interface BoardSheetHandle {
  fit: () => void;
}

const THRESHOLD_PX = 3;
const EMPTY_BOUNDS: BoardScene["bounds"] = { x: 0, y: 0, w: 0, h: 0 };

/** The one connector a wire selection lies on, or null when it spans several. */
function selectionConnector(selected: ReadonlySet<string>): string | null {
  const connectors = new Set([...selected].map((key) => parseWireKey(key).connector));
  return connectors.size === 1 ? [...connectors][0] : null;
}

export const BoardSheetCanvas = forwardRef<BoardSheetHandle, Props>(function BoardSheetCanvas(
  { unfolded, onUnfoldedChange, document, bundle, occurrence, canEdit, apply, onLeave, systemName, version, bundleKey },
  handle,
) {
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [labelSelected, setLabelSelected] = useState<string | null>(null);
  const [symbolSelected, setSymbolSelected] = useState(false);
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const [override, setOverride] = useState<Interior | null>(null);
  const [grouping, setGrouping] = useState(false);
  // The export whose pins are open (§15.4); gone when the export is removed.
  const [openExport, setOpenExport] = useState<string | null>(null);
  const openedExport = openExport ? document.exports.find((item) => item.id === openExport) ?? null : null;

  const scene = useMemo(
    () => buildBoardScene(document, bundle, occurrence, { unfolded, interior: override ?? undefined }),
    [document, bundle, occurrence, unfolded, override],
  );
  const { view, setView, fit, screenPoint } = useSheetView(container, scene?.bounds ?? EMPTY_BOUNDS);
  useImperativeHandle(handle, () => ({ fit }));

  const send = (ops: SystemOp[], keep: Interior | null = null) => {
    if (!ops.length) return;
    setOverride(keep);
    apply(ops)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setOverride(null));
  };

  const setFolds = onUnfoldedChange;
  const toggleUnfold = (refdes: string) => setFolds(toggled(unfolded, refdes));

  const selectSubPort = (subPort: SubPort) => {
    if (!unfolded.has(subPort.connector)) setFolds(new Set([...unfolded, subPort.connector]));
    setSelected(new Set(subPort.pins.map((pad) => wireKey(subPort.connector, pad))));
  };

  const groupConnector = selectionConnector(selected);
  const groupPins = (() => {
    if (!scene || !groupConnector) return [];
    const connector = scene.connectors.find((item) => item.refdes === groupConnector);
    const pads = orderedPads([...selected].map((key) => parseWireKey(key).pad));
    return pads.map((pad) => connector?.pins.find((item) => item.pad === pad) ?? { pad });
  })();

  const group = (name: string, fold: boolean) => {
    if (!groupConnector) return;
    send(groupOps(occurrence, groupConnector, groupPins.map((item) => item.pad), name));
    setGrouping(false);
    setSelected(new Set());
    if (fold) setFolds(new Set([...unfolded].filter((refdes) => refdes !== groupConnector)));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    container.current?.focus();
    const screen = screenPoint(event);
    if (isPanButton(event)) {
      capture(event);
      setDrag({ kind: "pan", last: screen });
      return;
    }
    if (event.button !== 0 || !scene) return;
    const at = toSheet(view, screen);
    const hit = hitOf(event.target);
    capture(event);
    setLabelSelected(null);
    setSymbolSelected(false);
    if (hit?.hit === "wire") {
      const key = wireKey(hit.id, hit.key);
      setSelected(event.shiftKey ? toggled(selected, key) : new Set([key]));
      return;
    }
    if (hit?.hit === "label") {
      setLabelSelected(hit.id);
      if (canEdit) setDrag({ kind: "label", refdes: hit.id, active: false, screen });
      return;
    }
    if (hit?.hit === "pin" && canEdit) {
      setDrag({ kind: "pin", refdes: hit.id, active: false, screen });
      return;
    }
    if (hit?.hit === "symbol") {
      setSymbolSelected(true);
      if (canEdit) setDrag({ kind: "symbol", start: at, active: false, screen });
      return;
    }
    if (hit?.hit === "bus") return;
    if (!event.shiftKey) setSelected(new Set());
    setDrag({ kind: "box", start: at, current: at });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !scene) return;
    const screen = screenPoint(event);
    const at = toSheet(view, screen);
    if (drag.kind === "pan") {
      setView(panBy(view, screen.x - drag.last.x, screen.y - drag.last.y));
      setDrag({ ...drag, last: screen });
      return;
    }
    if (drag.kind === "box") {
      setDrag({ ...drag, current: at });
      return;
    }
    if (!drag.active) {
      if (Math.hypot(screen.x - drag.screen.x, screen.y - drag.screen.y) < THRESHOLD_PX) return;
      setDrag({ ...drag, active: true });
    }
    // The drag starts from the stored interior, so the scene's own geometry is the base.
    const base = buildBoardScene(document, bundle, occurrence, { unfolded });
    const next = base && interiorDrag(drag, at, base, storedInterior(document, occurrence));
    if (next) setOverride(next);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ended = drag;
    setDrag(null);
    if (!ended || !scene) return;
    if (ended.kind === "box") {
      const rect = normalizeRect(ended.start, ended.current);
      if (rect.w > 0 || rect.h > 0) {
        const picked = boxWires(scene, rect, selectionMode(ended.start, ended.current));
        setSelected(event.shiftKey ? new Set([...selected, ...picked]) : picked);
      }
      return;
    }
    if (ended.kind === "pan") return;
    if (!ended.active || !override) {
      setOverride(null);
      return;
    }
    send(interiorOps(document, occurrence, override), override);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && event.key === "Backspace") {
      event.preventDefault();
      onLeave();
      return;
    }
    if (event.key === "Escape") {
      if (grouping) setGrouping(false);
      else setSelected(new Set());
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.key === "g" || event.key === "G") && canEdit && selected.size) {
      event.preventDefault();
      if (!groupConnector) toast.error("Select wires of one connector to group them.");
      else setGrouping(true);
      return;
    }
    if (event.key === "Home" || event.key === "f") fit();
  };

  if (!scene) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">This occurrence has no board sheet.</div>;
  }
  const transform = `scale(${view.scale}) translate(${-view.x / 1e6} ${-view.y / 1e6})`;
  const labels = new Set(labelSelected ? [labelSelected] : []);
  const counts = `Board sheet · ${scene.label} · ${scene.connectors.length} ${scene.connectors.length === 1 ? "connector" : "connectors"} · double-click a connector to unfold`;

  return (
    <div
      ref={container}
      tabIndex={0}
      role="application"
      aria-label={`Board sheet ${scene.label}`}
      className="sb-docs relative h-full w-full overflow-hidden outline-none"
      style={{ background: COLOURS.paper, cursor: drag?.kind === "pan" ? "grabbing" : "default", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setOverride(null);
      }}
      onDoubleClick={(event) => {
        const hit = hitAt(event);
        if (hit && (hit.hit === "bus" || hit.hit === "label")) toggleUnfold(hit.id);
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg width="100%" height="100%" className="absolute inset-0 select-none" data-testid="board-sheet">
        <PaperGrid view={view} />
        <g transform={transform}>
          <BoardSheetSvg scene={scene} selectedWires={selected} selectedLabels={labels} symbolSelected={symbolSelected} />
          <BoxRect drag={drag} />
        </g>
      </svg>
      <SheetChrome system={systemName ?? document.name} version={version} sheet={scene.label} bundleKey={bundleKey} counts={counts} />
      {scene.state !== "ready" && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-xs"
          style={{ background: COLOURS.white, border: `1.4px solid ${COLOURS.ink}`, borderRadius: 3, color: COLOURS.ink }}
        >
          {scene.state === "pending" ? "The board's design bundle is building…" : `Board state: ${scene.state}`}
        </div>
      )}
      <div className="absolute bottom-16 right-3 top-3 flex flex-col">
        <BoardSidePanel
          document={document}
          occurrence={occurrence}
          connectors={scene.connectors}
          canEdit={canEdit}
          send={(ops) => send(ops)}
          onToggleUnfold={toggleUnfold}
          onSelectSubPort={selectSubPort}
          onOpenExport={setOpenExport}
        />
      </div>
      {openedExport && (
        <div className="absolute bottom-16 left-3 top-12 flex flex-col justify-end">
          <ExportPinsCard document={document} bundle={bundle} item={openedExport} canEdit={canEdit} send={(ops) => send(ops)} onClose={() => setOpenExport(null)} />
        </div>
      )}
      {grouping && groupConnector && (
        <div className="absolute left-3 top-12">
          <GroupPopover
            key={[...selected].sort().join(",")}
            connector={groupConnector}
            pins={groupPins}
            refusal={(name) => groupRefusal(document, occurrence, groupConnector, groupPins.map((item) => item.pad), name)}
            onGroup={group}
            onCancel={() => setGrouping(false)}
          />
        </div>
      )}
      {selected.size > 0 && !grouping && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-xs"
          style={{ background: COLOURS.white, border: `1.4px solid ${COLOURS.ink}`, borderRadius: 3, color: COLOURS.ink }}
        >
          {selected.size} {selected.size === 1 ? "wire" : "wires"} selected{canEdit ? " · G to group" : ""} · Esc to clear
        </div>
      )}
    </div>
  );
});
