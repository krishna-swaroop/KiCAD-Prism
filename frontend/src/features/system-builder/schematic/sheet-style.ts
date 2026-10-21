/**
 * The palette and type of the schematic surfaces in the harness documents'
 * look (mockup 11, the Release Studio sheet style). Geometry still owns every
 * coordinate; these are only the colours, sizes and truncation rules the
 * drawing uses.
 */
/** The documents' ink, paper and the few accents the mockup allows. */
export const COLOURS = {
  ink: "#1d1d1f",
  muted: "#6b6b70",
  rule: "#9a9aa0",
  head: "#eef0f3",
  stripe: "#f7f8fa",
  sheath: "#c4c8cf",
  paper: "#fbfbf9",
  grid: "#d9dbe0",
  white: "#ffffff",
  select: "#0284c7",
  warning: "#b45309",
  // The scene's older names, kept so callers do not each learn the palette.
  sheet: "#1d1d1f",
  sheetFill: "#ffffff",
  sheetName: "#1d1d1f",
  sheetFile: "#6b6b70",
  pin: "#1d1d1f",
  bus: "#1d1d1f",
  harness: "#1d1d1f",
  harnessFill: "#c4c8cf",
  harnessText: "#1d1d1f",
  module: "#1d1d1f",
  moduleFill: "#ffffff",
  dangling: "#b45309",
  exported: "#1d1d1f",
} as const;

/**
 * Wire colours are the harness document's swatches (`drawing.py` SWATCHES):
 * a wire keeps one of these, chosen deterministically from its id.
 */
export const WIRE_COLOURS = [
  "#232323",
  "#f5d000",
  "#c0c0c0",
  "#e0322d",
  "#2f9e44",
  "#2b6fd6",
  "#8b5a2b",
  "#8a4fd1",
  "#30c5c0",
  "#c9a227",
] as const;

export function wireColour(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return WIRE_COLOURS[hash % WIRE_COLOURS.length];
}

/** The two families the CSS declares; the fallbacks keep SVG legible before the font loads. */
export const FONT = {
  display: "PrismDisplay, PrismBody, ui-monospace, monospace",
  body: "PrismBody, ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const MM = 1_000_000;
export const mm = (nm: number) => nm / MM;

/** Text that is not part of a card's header band. */
export const TEXT = 1.27;
export const PORT_GLYPH = 0.65;

/** A card: the header band, its outline and the selection halo. */
export const CARD = {
  headHeight: 7,
  radius: 0.5,
  stroke: 0.24,
  haloStroke: 0.42,
  haloInset: 0.8,
} as const;

export const TAG = {
  height: 2.6,
  radius: 0.6,
  stroke: 0.14,
  text: 1.25,
} as const;

export const WIRE = {
  plain: 0.34,
  mate: 0.75,
  edge: 0.16,
} as const;

/** A one-character allowance for the ellipsis; text is monospaced. */
export function truncate(value: string, room: number): string {
  if (room < 2) return "";
  return value.length <= room ? value : `${value.slice(0, room - 1)}…`;
}

/** How many PrismBody characters fit in `width` mm at `size` mm. */
export function roomFor(width: number, size: number): number {
  return Math.max(0, Math.floor(width / (size * 0.6)));
}

/** A card's ports are labelled inward from the glyph. */
export const PORT_LABEL_INSET = 1.8;
