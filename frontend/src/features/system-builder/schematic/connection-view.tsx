/**
 * Connections in the documents' look: a board-to-board mate as a heavy ink
 * link tagged with its pin count, a harness link as a thin wire in its own
 * colour (an ink edge under it) tagged with where it goes. The route's hit
 * segments are untouched, so dragging a segment works as before.
 */
import { routeMidpoint } from "./geometry";
import { Pill } from "./sheet-parts";
import { COLOURS, WIRE, mm, wireColour } from "./sheet-style";
import type { SceneConnection } from "./scene";

export function ConnectionView({ connection, selected }: { connection: SceneConnection; selected: boolean }) {
  const mate = connection.kind === "mate";
  const colour = mate ? COLOURS.ink : wireColour(connection.id);
  const width = mate ? WIRE.mate : WIRE.plain;
  const points = connection.points.map((point) => `${mm(point.x)},${mm(point.y)}`).join(" ");
  const mark = connection.points.length >= 2 ? routeMidpoint(connection.points) : null;
  const tag = mate ? (connection.pins !== undefined ? `${connection.pins} pins` : connection.label) : connection.label;
  return (
    <g>
      {selected && (
        <polyline
          points={points}
          fill="none"
          stroke={COLOURS.select}
          strokeWidth={width + 0.6}
          opacity={0.35}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {!mate && (
        <polyline points={points} fill="none" stroke={COLOURS.ink} strokeWidth={width + WIRE.edge} strokeLinejoin="round" pointerEvents="none" />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={colour}
        strokeWidth={width}
        strokeLinecap={mate ? "round" : "butt"}
        strokeLinejoin="round"
        strokeDasharray={connection.dangling ? "0.8 0.5" : undefined}
        pointerEvents="none"
      />
      {connection.points.slice(1).map((point, index) => {
        const from = connection.points[index];
        return (
          <line
            key={index}
            x1={mm(from.x)}
            y1={mm(from.y)}
            x2={mm(point.x)}
            y2={mm(point.y)}
            stroke="transparent"
            strokeWidth={1.4}
            data-hit="segment"
            data-id={connection.id}
            data-key={String(index)}
            style={{ cursor: from.y === point.y ? "ns-resize" : "ew-resize" }}
          />
        );
      })}
      {mark && <Pill x={mm(mark.point.x)} y={mm(mark.point.y) - 2.1} text={tag} />}
      {connection.dangling && connection.points.length > 0 && (() => {
        const end = connection.points[connection.points.length - 1];
        return <rect x={mm(end.x) - 0.5} y={mm(end.y) - 0.5} width={1} height={1} fill="none" stroke={COLOURS.warning} strokeWidth={0.18} pointerEvents="none" />;
      })()}
    </g>
  );
}
