/**
 * The cards of the root sheet in the documents' look: a white board, body or
 * published-system card with a header band, the harness sheath, and their edge
 * ports. Pure rendering: `data-hit` targets are unchanged, so gestures and
 * hit-testing behave exactly as before.
 */
import { NORMAL } from "./geometry";
import { CardHeader, SelectionHalo } from "./sheet-parts";
import {
  CARD,
  COLOURS,
  FONT,
  PORT_GLYPH,
  PORT_LABEL_INSET,
  TEXT,
  mm,
} from "./sheet-style";
import type { ScenePort, SceneSymbol } from "./scene";

function rectMm(rect: { x: number; y: number; w: number; h: number }) {
  return { x: mm(rect.x), y: mm(rect.y), w: mm(rect.w), h: mm(rect.h) };
}

function PortView({ port, colour, selected }: { port: ScenePort; colour: string; selected: boolean }) {
  const n = NORMAL[port.edge];
  const x = mm(port.point.x);
  const y = mm(port.point.y);
  const vertical = port.edge === "top" || port.edge === "bottom";
  // The label runs inward from the glyph; on top and bottom edges it reads upward.
  const lx = x - n.x * PORT_LABEL_INSET;
  const ly = y - n.y * PORT_LABEL_INSET;
  const anchor = port.edge === "left" || port.edge === "bottom" ? "start" : "end";
  const transform = vertical ? `rotate(-90 ${lx} ${ly})` : undefined;
  const textY = vertical ? ly : ly + TEXT * 0.35;
  const labelColour = port.missing ? COLOURS.warning : colour;
  return (
    <g data-hit="port" data-id={port.item} data-key={port.key} style={{ cursor: "grab" }} fontFamily={FONT.body}>
      {/* A larger invisible target than the glyph. */}
      <circle cx={x} cy={y} r={1.8} fill="transparent" />
      <circle
        cx={x}
        cy={y}
        r={PORT_GLYPH}
        fill={selected ? COLOURS.select : COLOURS.white}
        stroke={selected ? COLOURS.select : COLOURS.ink}
        strokeWidth={0.22}
      />
      {(port.label || port.detail) && (
        <text x={lx} y={textY} fontSize={TEXT * 0.95} fill={labelColour} textAnchor={anchor} dominantBaseline={vertical ? "central" : undefined} transform={transform}>
          <tspan fontWeight={600}>{port.label}</tspan>
          {port.detail && <tspan fontSize={TEXT * 0.78} fill={COLOURS.muted}>{`  ${port.detail}`}</tspan>}
        </text>
      )}
      {port.back && (
        <text x={x + n.x * 1.8 + (vertical ? 1 : 0)} y={y + n.y * 1.8 + (vertical ? 0 : -0.8)} fontSize={TEXT * 0.8} fontWeight={600} fill={COLOURS.ink} textAnchor="middle">B</text>
      )}
      {port.missing && (
        <path d={`M${x - 0.6} ${y - 0.6} L${x + 0.6} ${y + 0.6} M${x + 0.6} ${y - 0.6} L${x - 0.6} ${y + 0.6}`} stroke={COLOURS.warning} strokeWidth={0.2} />
      )}
      {port.exports && <ExportLabel port={port} />}
    </g>
  );
}

const EXPORT_REACH = 5.08; // mm from the port to the label's point
const LABEL_H = 1.8;

/**
 * A port's exports as a hierarchical label outside the sheet (§15.4, mockup
 * 05): a short wire out along the edge's normal, then the pointed box with the
 * export's name, captioned "exported".
 */
function ExportLabel({ port }: { port: ScenePort }) {
  const n = NORMAL[port.edge];
  const x = mm(port.point.x);
  const y = mm(port.point.y);
  const text = (port.exports ?? []).join(", ");
  const width = Math.max(4, text.length * TEXT * 0.62 + 2);
  // Laid out along +x from the tip, then turned to face the edge's normal.
  const angle = Math.atan2(n.y, n.x) * (180 / Math.PI);
  const flipped = port.edge === "left";
  const box = `0,0 ${LABEL_H / 2},${-LABEL_H / 2} ${width},${-LABEL_H / 2} ${width},${LABEL_H / 2} ${LABEL_H / 2},${LABEL_H / 2}`;
  const textX = LABEL_H / 2 + 0.6;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} data-testid="export-label">
      <line x1={0} y1={0} x2={EXPORT_REACH} y2={0} stroke={COLOURS.ink} strokeWidth={0.25} />
      <g transform={`translate(${EXPORT_REACH} 0)`}>
        <polygon points={box} fill={COLOURS.white} stroke={COLOURS.ink} strokeWidth={0.18} />
        <g transform={flipped ? `rotate(180 ${width / 2} 0)` : undefined}>
          <text x={flipped ? width - textX : textX} y={TEXT * 0.35} fontSize={TEXT} fill={COLOURS.ink} textAnchor={flipped ? "end" : "start"}>{text}</text>
          <text x={flipped ? width - textX : textX} y={LABEL_H / 2 + TEXT * 0.9} fontSize={TEXT * 0.7} fontStyle="italic" fill={COLOURS.muted} textAnchor={flipped ? "end" : "start"}>exported</text>
        </g>
      </g>
    </g>
  );
}

const STATE_NOTE: Partial<Record<SceneSymbol["state"], string>> = {
  pending: "design bundle building…",
  absent: "not in the project at this commit",
  unsupported: "not read until stage 3",
  redacted: "no access to this board",
  unknown: "loading…",
};

const KICKER: Record<SceneSymbol["kind"], string> = {
  board: "BOARD",
  body: "BODY",
  entry: "SYSTEM",
  harness: "HARNESS",
};

function HarnessLabel({ symbol, rect }: { symbol: SceneSymbol; rect: ReturnType<typeof rectMm> }) {
  const room = Math.max(1, Math.floor((rect.h - 4.2) / 1.5));
  return (
    <g pointerEvents="none" fontFamily={FONT.body}>
      <text x={rect.x + 1.4} y={rect.y + 3.4} fontFamily={FONT.display} fontSize={2.4} fill={COLOURS.ink}>{symbol.label}</text>
      <text x={rect.x + 1.4} y={rect.y + 5.6} fontSize={1.25} fill={COLOURS.ink}>{symbol.caption}</text>
      {symbol.lines.slice(0, room).map((line, index) => (
        <text key={line + index} x={rect.x + 1.4} y={rect.y + 7.4 + index * 1.5} fontSize={1.1} fill={COLOURS.muted}>{line}</text>
      ))}
      <text x={rect.x + 1.4} y={rect.y + rect.h - 1.3} fontSize={1.05} fill={COLOURS.muted} letterSpacing="0.12em">HARNESS</text>
    </g>
  );
}

function SymbolView({ symbol, selected, selectedPorts }: { symbol: SceneSymbol; selected: boolean; selectedPorts: ReadonlySet<string> }) {
  const rect = rectMm(symbol.rect);
  const harness = symbol.kind === "harness";
  const body = symbol.kind === "body";
  const note = STATE_NOTE[symbol.state];
  const dashed = symbol.state === "pending" || symbol.state === "unknown";
  return (
    <g data-symbol={symbol.id}>
      {selected && <SelectionHalo rect={rect} />}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={harness ? 1 : CARD.radius}
        fill={harness ? COLOURS.sheath : COLOURS.white}
        stroke={COLOURS.ink}
        strokeWidth={harness ? 0.35 : CARD.stroke}
        strokeDasharray={dashed ? "1.2 0.7" : undefined}
        data-hit="symbol"
        data-id={symbol.id}
        style={{ cursor: "move" }}
      />
      {symbol.kind === "entry" && (
        <rect x={rect.x + 0.55} y={rect.y + 0.55} width={rect.w - 1.1} height={rect.h - 1.1} rx={CARD.radius * 0.6} fill="none" stroke={COLOURS.ink} strokeWidth={0.12} pointerEvents="none" />
      )}
      {harness ? (
        <HarnessLabel symbol={symbol} rect={rect} />
      ) : (
        <>
          <CardHeader rect={rect} title={symbol.label} source={symbol.caption} kicker={KICKER[symbol.kind]} hatched={body} />
          {note && (
            <text
              x={rect.x + rect.w / 2}
              y={rect.y + rect.h / 2 + 1}
              fontFamily={FONT.body}
              fontSize={TEXT}
              fill={symbol.state === "absent" ? COLOURS.warning : COLOURS.muted}
              textAnchor="middle"
              fontStyle="italic"
              pointerEvents="none"
            >
              {note}
            </text>
          )}
        </>
      )}
      {symbol.ports.map((port) => (
        <PortView key={port.key} port={port} colour={COLOURS.ink} selected={selectedPorts.has(`${port.item}\u0000${port.key}`)} />
      ))}
    </g>
  );
}

const HANDLE = 0.9;
export const HANDLES = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

function Handles({ symbol }: { symbol: SceneSymbol }) {
  const r = rectMm(symbol.rect);
  const corners: Record<(typeof HANDLES)[number], [number, number, string]> = {
    "top-left": [r.x, r.y, "nwse-resize"],
    "top-right": [r.x + r.w, r.y, "nesw-resize"],
    "bottom-left": [r.x, r.y + r.h, "nesw-resize"],
    "bottom-right": [r.x + r.w, r.y + r.h, "nwse-resize"],
  };
  return (
    <g>
      {HANDLES.map((handle) => {
        const [x, y, cursor] = corners[handle];
        return (
          <rect
            key={handle}
            x={x - HANDLE / 2}
            y={y - HANDLE / 2}
            width={HANDLE}
            height={HANDLE}
            rx={0.12}
            fill={COLOURS.white}
            stroke={COLOURS.select}
            strokeWidth={0.18}
            data-hit="handle"
            data-id={symbol.id}
            data-key={handle}
            style={{ cursor }}
          />
        );
      })}
    </g>
  );
}

export { Handles, SymbolView, rectMm };
