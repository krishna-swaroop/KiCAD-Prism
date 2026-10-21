/**
 * Shared drawing parts for the document-look sheets: the hatch used on a body
 * header, the card header band, the selection halo and the pill tags that
 * label a connection.
 */
import type { Rect } from "./geometry";
import { CARD, COLOURS, FONT, TAG, roomFor, truncate } from "./sheet-style";

/** The body header's 45° hatch, drawn in the same ink and rule as the sheet. */
export function SheetDefs() {
  return (
    <defs>
      <pattern id="sb-hatch" width={1.2} height={1.2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width={1.2} height={1.2} fill={COLOURS.head} />
        <line x1={0} y1={0} x2={0} y2={1.2} stroke={COLOURS.rule} strokeWidth={0.22} />
      </pattern>
    </defs>
  );
}

/** A header band whose top corners follow the card's radius. */
function headerPath(rect: Rect, height: number): string {
  const r = Math.min(CARD.radius, rect.w / 2, height / 2);
  const { x, y, w } = rect;
  return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + height} H${x} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

export interface CardHeaderProps {
  /** The card, in millimetres. */
  rect: Rect;
  title: string;
  source: string;
  kicker: string;
  hatched?: boolean;
}

/**
 * A board, body or published-system card header: the label in PrismDisplay, a
 * right-aligned kicker and the truncated source under it, all inside the band.
 */
export function CardHeader({ rect, title, source, kicker, hatched = false }: CardHeaderProps) {
  const height = Math.min(CARD.headHeight, Math.max(2.6, rect.h * 0.22));
  const scale = Math.min(1, height / CARD.headHeight);
  const titleSize = 2 * scale;
  const sourceSize = 1.3 * scale;
  const kickerSize = 1.15 * scale;
  const pad = 1.2;
  const kickerX = rect.x + rect.w - pad;
  return (
    <g pointerEvents="none">
      <path d={headerPath(rect, height)} fill={hatched ? "url(#sb-hatch)" : COLOURS.head} stroke={COLOURS.ink} strokeWidth={CARD.stroke} />
      <text
        x={rect.x + pad}
        y={rect.y + height * 0.42}
        fontFamily={FONT.display}
        fontSize={titleSize}
        fill={COLOURS.ink}
      >
        {truncate(title, roomFor(rect.w - 8, titleSize))}
      </text>
      <text x={kickerX} y={rect.y + height * 0.4} fontFamily={FONT.body} fontSize={kickerSize} fontWeight={600} fill={COLOURS.muted} textAnchor="end" letterSpacing="0.08em">
        {kicker}
      </text>
      <text x={rect.x + pad} y={rect.y + height * 0.8} fontFamily={FONT.body} fontSize={sourceSize} fill={COLOURS.muted}>
        {truncate(source, roomFor(rect.w - 2 * pad, sourceSize))}
      </text>
    </g>
  );
}

/** The selection: a rounded 2.5 px-looking halo just outside the card. */
export function SelectionHalo({ rect }: { rect: Rect }) {
  const inset = CARD.haloInset;
  return (
    <rect
      x={rect.x - inset}
      y={rect.y - inset}
      width={rect.w + 2 * inset}
      height={rect.h + 2 * inset}
      rx={CARD.radius + inset}
      fill="none"
      stroke={COLOURS.select}
      strokeWidth={CARD.haloStroke}
      opacity={0.9}
      pointerEvents="none"
    />
  );
}

export interface PillProps {
  /** The pill's centre, in millimetres. */
  x: number;
  y: number;
  text: string;
  size?: number;
}

/** A white tag with a rule border, as the documents caption a connection. */
export function Pill({ x, y, text, size = TAG.text }: PillProps) {
  const width = Math.max(5, text.length * size * 0.62 + 1.6);
  return (
    <g pointerEvents="none">
      <rect x={x - width / 2} y={y - TAG.height / 2} width={width} height={TAG.height} rx={TAG.radius} fill={COLOURS.white} stroke={COLOURS.rule} strokeWidth={TAG.stroke} />
      <text x={x} y={y + size * 0.36} fontFamily={FONT.body} fontSize={size} fill={COLOURS.ink} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
