/**
 * Draws a `BoardScene` as the harness documents draw a sheet (mockup 11): the
 * generated board symbol as a white card with a header band, connector buses
 * and hierarchical labels in ink, and, for an unfolded connector, its bus
 * entries and wires in their own colours. Pure rendering; hit targets carry
 * `data-hit` with the connector (`data-id`) and pad (`data-key`).
 */
import { memo } from "react";

import { NORMAL, type Point } from "../schematic/geometry";
import { CardHeader, SelectionHalo } from "../schematic/sheet-parts";
import { CARD, COLOURS, FONT, mm, wireColour } from "../schematic/sheet-style";
import { wireKey, type BoardConnector, type BoardScene, type BoardWire } from "./board-scene";

const TEXT = 1.27;
const S = 0.635;

export const BOARD_COLOURS = {
  symbol: COLOURS.ink,
  symbolFill: COLOURS.white,
  wire: COLOURS.ink,
  netLabel: COLOURS.ink,
  hierLabel: COLOURS.ink,
  group: COLOURS.select,
  power: COLOURS.warning,
};

const DIRECTION: Record<number, Point> = { 0: { x: 1, y: 0 }, 90: { x: 0, y: -1 }, 180: { x: -1, y: 0 }, 270: { x: 0, y: 1 } };

function directionOf(rotationDeg: number): Point {
  return DIRECTION[((Math.round(rotationDeg / 90) * 90) % 360 + 360) % 360] ?? DIRECTION[0];
}

const points = (list: readonly Point[]) => list.map((point) => `${mm(point.x)},${mm(point.y)}`).join(" ");

/** KiCad's bidirectional hierarchical label, its point on the bus end, pointing away. */
function HierLabel({ connector, selected }: { connector: BoardConnector; selected: boolean }) {
  const { point, rotationDeg, text } = connector.label;
  const d = directionOf(rotationDeg);
  const q = { x: -d.y, y: d.x };
  const at = (a: number, b: number) => `${mm(point.x) + d.x * a + q.x * b},${mm(point.y) + d.y * a + q.y * b}`;
  const shape = [at(0, 0), at(S, S), at(3 * S, S), at(4 * S, 0), at(3 * S, -S), at(S, -S)].join(" ");
  const tx = mm(point.x) + d.x * (4 * S + 0.6);
  const ty = mm(point.y) + d.y * (4 * S + 0.6);
  const vertical = d.y !== 0;
  const anchor = (vertical ? d.y < 0 : d.x > 0) ? "start" : "end";
  return (
    <g data-hit="label" data-id={connector.refdes} style={{ cursor: "move" }} fontFamily={FONT.body}>
      {selected && <polygon points={shape} fill={COLOURS.select} opacity={0.25} stroke={COLOURS.select} strokeWidth={0.4} />}
      <polygon points={shape} fill={COLOURS.white} stroke={BOARD_COLOURS.hierLabel} strokeWidth={0.16} />
      <text
        x={tx}
        y={vertical ? ty : ty + TEXT * 0.35}
        fontSize={TEXT * 0.95}
        fontWeight={600}
        fill={BOARD_COLOURS.hierLabel}
        textAnchor={anchor}
        dominantBaseline={vertical ? "central" : undefined}
        transform={vertical ? `rotate(-90 ${tx} ${ty})` : undefined}
      >
        {text}
      </text>
    </g>
  );
}

function WireView({ wire, edge, selected }: { wire: BoardWire; edge: BoardConnector["edge"]; selected: boolean }) {
  const n = NORMAL[edge];
  const vertical = n.y !== 0;
  const labelAt = { x: mm(wire.end.x) + n.x * 0.5, y: mm(wire.end.y) + n.y * 0.5 };
  const anchor = vertical ? (n.y < 0 ? "start" : "end") : n.x > 0 ? "start" : "end";
  const transform = vertical ? `rotate(-90 ${labelAt.x} ${labelAt.y})` : undefined;
  const padAt = { x: mm(wire.start.x) + n.x * 0.4, y: mm(wire.start.y) + n.y * 0.4 - (vertical ? 0 : 0.4) };
  const colour = wire.power ? COLOURS.warning : wireColour(wire.net ?? wire.pad);
  const path = points([wire.tap, wire.start]);
  return (
    <g data-hit="wire" data-id={wire.connector} data-key={wire.pad} style={{ cursor: "pointer" }} fontFamily={FONT.body}>
      <polyline points={points([wire.tap, wire.start, wire.end])} fill="none" stroke="transparent" strokeWidth={1.4} />
      {selected && <polyline points={points([wire.start, wire.end])} fill="none" stroke={COLOURS.select} strokeWidth={0.9} opacity={0.45} />}
      <polyline points={path} fill="none" stroke={COLOURS.ink} strokeWidth={0.3} pointerEvents="none" />
      <polyline points={path} fill="none" stroke={colour} strokeWidth={0.16} pointerEvents="none" />
      <polyline points={points([wire.start, wire.end])} fill="none" stroke={COLOURS.ink} strokeWidth={0.3} pointerEvents="none" />
      <polyline points={points([wire.start, wire.end])} fill="none" stroke={colour} strokeWidth={0.16} pointerEvents="none" />
      <text x={padAt.x} y={padAt.y} fontSize={TEXT * 0.7} fill={COLOURS.muted} textAnchor={anchor} transform={vertical ? `rotate(-90 ${padAt.x} ${padAt.y})` : undefined} pointerEvents="none">{wire.pad}</text>
      <text x={labelAt.x} y={vertical ? labelAt.y : labelAt.y + TEXT * 0.35} fontSize={TEXT * 0.95} fill={wire.power ? BOARD_COLOURS.power : BOARD_COLOURS.netLabel} textAnchor={anchor} dominantBaseline={vertical ? "central" : undefined} transform={transform} pointerEvents="none">
        {wire.netLabel}
        {wire.groups.length > 0 && <tspan fontSize={TEXT * 0.8} fill={BOARD_COLOURS.group}>{`  ${wire.groups.join(", ")}`}</tspan>}
      </text>
    </g>
  );
}

function ConnectorView({ connector, selectedWires, selectedLabel }: { connector: BoardConnector; selectedWires: ReadonlySet<string>; selectedLabel: boolean }) {
  const n = NORMAL[connector.edge];
  const vertical = connector.edge === "top" || connector.edge === "bottom";
  const inside = { x: mm(connector.pin.x) - n.x * 0.8, y: mm(connector.pin.y) - n.y * 0.8 };
  const anchor = connector.edge === "left" || connector.edge === "bottom" ? "start" : "end";
  return (
    <g fontFamily={FONT.body}>
      {/* The bus: double-click to unfold or fold. */}
      <g data-hit="bus" data-id={connector.refdes} style={{ cursor: "pointer" }}>
        <polyline points={points(connector.bus)} fill="none" stroke="transparent" strokeWidth={1.6} />
        <polyline points={points(connector.bus)} fill="none" stroke={COLOURS.ink} strokeWidth={0.36} strokeLinejoin="round" pointerEvents="none" />
        {connector.spine.length > 1 && <polyline points={points(connector.spine)} fill="none" stroke={COLOURS.ink} strokeWidth={0.36} pointerEvents="none" />}
        {connector.spine.length > 1 && <circle cx={mm(connector.spine[0].x)} cy={mm(connector.spine[0].y)} r={0.45} fill={COLOURS.ink} pointerEvents="none" />}
      </g>
      {connector.wires.map((wire) => (
        <WireView key={wire.pad} wire={wire} edge={connector.edge} selected={selectedWires.has(wireKey(wire.connector, wire.pad))} />
      ))}
      <g data-hit="pin" data-id={connector.refdes} style={{ cursor: "grab" }} fontFamily={FONT.body}>
        <circle cx={mm(connector.pin.x)} cy={mm(connector.pin.y)} r={1.4} fill="transparent" />
        <circle cx={mm(connector.pin.x)} cy={mm(connector.pin.y)} r={0.55} fill={COLOURS.white} stroke={COLOURS.ink} strokeWidth={0.22} />
        <text
          x={inside.x}
          y={vertical ? inside.y : inside.y + TEXT * 0.35}
          fontSize={TEXT * 0.95}
          fontWeight={600}
          fill={BOARD_COLOURS.symbol}
          textAnchor={anchor}
          dominantBaseline={vertical ? "central" : undefined}
          transform={vertical ? `rotate(-90 ${inside.x} ${inside.y})` : undefined}
        >
          {connector.refdes}
          <tspan fontSize={TEXT * 0.75} fontWeight={400} fill={COLOURS.muted}>{`  ${connector.detail}`}</tspan>
        </text>
        {connector.back && (
          <text x={mm(connector.pin.x) + n.x * 1.4 + (vertical ? 1 : 0)} y={mm(connector.pin.y) + n.y * 1.4 + (vertical ? 0 : -0.8)} fontSize={TEXT * 0.8} fontWeight={600} fill={COLOURS.ink} textAnchor="middle">B</text>
        )}
      </g>
      <HierLabel connector={connector} selected={selectedLabel} />
    </g>
  );
}

export interface BoardSheetSvgProps {
  scene: BoardScene;
  selectedWires: ReadonlySet<string>;
  selectedLabels: ReadonlySet<string>;
  symbolSelected: boolean;
}

export const BoardSheetSvg = memo(function BoardSheetSvg({ scene, selectedWires, selectedLabels, symbolSelected }: BoardSheetSvgProps) {
  const box = { x: mm(scene.symbol.x), y: mm(scene.symbol.y), w: mm(scene.symbol.w), h: mm(scene.symbol.h) };
  const r = { x: box.x, y: box.y, width: box.w, height: box.h };
  return (
    <g fontFamily={FONT.body}>
      {symbolSelected && <SelectionHalo rect={box} />}
      <rect {...r} rx={CARD.radius} fill={BOARD_COLOURS.symbolFill} stroke={BOARD_COLOURS.symbol} strokeWidth={CARD.stroke} data-hit="symbol" style={{ cursor: "move" }} />
      <CardHeader rect={box} title={scene.label} source={`board sheet · ${scene.state === "ready" ? "generated from the bundle · read-only" : scene.state}`} kicker="BOARD" />
      <g pointerEvents="none" fontFamily={FONT.body}>
        <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 1} fontSize={TEXT * 0.9} fill={COLOURS.muted} textAnchor="middle">generated from the bundle · read-only</text>
      </g>
      {scene.connectors.map((connector) => (
        <ConnectorView key={connector.refdes} connector={connector} selectedWires={selectedWires} selectedLabel={selectedLabels.has(connector.refdes)} />
      ))}
    </g>
  );
});
