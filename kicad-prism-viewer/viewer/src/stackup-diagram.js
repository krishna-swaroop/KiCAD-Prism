import { escapeHtml } from "./escape-html.js";

/**
 * Stackup cross-section, laid out in CSS pixels for the space it is given.
 *
 * Layer bands share the height (dielectrics by thickness, thin layers at a
 * floor), and each layer's label row is placed as close to its band as the
 * rows above and below allow, joined to it by a leader line. Nothing is
 * scaled, so text stays at its CSS size and never overlaps.
 */

const TOP = 30;
const BOTTOM = 8;
const LABEL_GAP = 3;
const PRIMARY_HEIGHT = 16;
const SECONDARY_HEIGHT = 14;
/** Average glyph width as a fraction of font size, for truncation. */
const GLYPH = 0.56;
const NAME_FONT = 13;
const META_FONT = 11;

const DESIRED_HEIGHT = { copper: 16, soldermask: 10, paste: 8, silkscreen: 8 };
const MIN_HEIGHT = { copper: 8, soldermask: 5, paste: 4, silkscreen: 4, dielectric: 12 };
/** Secondary lines are dropped in this order when rows do not fit. */
const SECONDARY_DROP_ORDER = ["paste", "silkscreen", "soldermask", "copper", "dielectric"];

function desiredHeight(layer) {
  if (layer.role === "dielectric") {
    const thickness = Number(layer.thicknessMm) || 0.1;
    return Math.max(36, Math.min(200, thickness * 300));
  }
  return DESIRED_HEIGHT[layer.role] ?? 8;
}

function minHeight(layer) {
  return MIN_HEIGHT[layer.role] ?? 4;
}

function bandHeights(layers, available) {
  const desired = layers.map(desiredHeight);
  const total = desired.reduce((sum, value) => sum + value, 0);
  if (total <= available) {
    // Grow dielectrics into spare room, up to 2.5x, so labels get space too.
    const dielectric = desired.reduce((sum, value, index) => sum + (layers[index].role === "dielectric" ? value : 0), 0);
    if (!dielectric) return desired;
    const grow = Math.min(2.5, 1 + (available - total) / dielectric);
    return desired.map((value, index) => (layers[index].role === "dielectric" ? value * grow : value));
  }
  // Shrink dielectrics toward their floor first, then everything evenly.
  const excess = total - available;
  const shrinkable = desired.reduce(
    (sum, value, index) => sum + (layers[index].role === "dielectric" ? value - minHeight(layers[index]) : 0),
    0,
  );
  const factor = shrinkable > 0 ? Math.min(1, excess / shrinkable) : 0;
  const shrunk = desired.map((value, index) => (
    layers[index].role === "dielectric" ? value - factor * (value - minHeight(layers[index])) : value
  ));
  const shrunkTotal = shrunk.reduce((sum, value) => sum + value, 0);
  if (shrunkTotal <= available) return shrunk;
  return shrunk.map((value) => (value * available) / shrunkTotal);
}

function labelHeight(showSecondary) {
  return PRIMARY_HEIGHT + (showSecondary ? SECONDARY_HEIGHT : 0);
}

/**
 * Place rows of the given heights as near their desired centres as possible,
 * in order, without overlap, inside [top, bottom]. Returns row tops.
 */
export function placeLabelRows(rows, top, bottom, gap = LABEL_GAP) {
  const tops = [];
  let cursor = top;
  for (const row of rows) {
    const y = Math.max(row.center - row.height / 2, cursor);
    tops.push(y);
    cursor = y + row.height + gap;
  }
  let limit = bottom;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    tops[index] = Math.min(tops[index], limit - rows[index].height);
    limit = tops[index] - gap;
  }
  // If the rows cannot fit at all, keep the top ones on screen.
  cursor = top;
  for (let index = 0; index < rows.length; index += 1) {
    tops[index] = Math.max(tops[index], cursor);
    cursor = tops[index] + rows[index].height + gap;
  }
  return tops;
}

function truncate(text, width, fontSize) {
  const value = String(text || "");
  const max = Math.max(4, Math.floor(width / (fontSize * GLYPH)));
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Height the diagram needs when it is not given one (stacked narrow layout). */
export function naturalStackupHeight(layers) {
  const bands = layers.reduce((sum, layer) => sum + desiredHeight(layer), 0);
  const labels = layers.reduce(
    (sum, layer) => sum + labelHeight(Boolean(layer.secondary)) + LABEL_GAP,
    0,
  );
  return TOP + Math.max(bands, labels) + BOTTOM;
}

/**
 * @param {Array<{id: string, name: string, role: string, color: string, thicknessMm: number,
 *   thicknessLabel: string, primary: string, secondary: string, copperIndex: number,
 *   description: string}>} layers  top to bottom
 */
export function layoutStackup(layers, { width, height }) {
  const available = Math.max(40, height - TOP - BOTTOM);
  const heights = bandHeights(layers, available);
  let y = TOP;
  const bands = layers.map((layer, index) => {
    const band = { ...layer, y, h: heights[index] };
    y += heights[index];
    return band;
  });
  const bottom = y;

  const boardX = 100;
  const boardWidth = Math.max(110, Math.min(240, Math.round(width * 0.26)));
  const dimensionX = boardX + boardWidth + 12;
  const labelX = dimensionX + 34;
  const thicknessWidth = 80;
  const nameX = labelX + thicknessWidth;
  const nameWidth = Math.max(60, width - nameX - 8);

  const show = bands.map((band) => Boolean(band.secondary));
  const need = () => show.reduce((sum, value) => sum + labelHeight(value) + LABEL_GAP, -LABEL_GAP);
  const room = height - TOP - BOTTOM;
  for (const role of SECONDARY_DROP_ORDER) {
    if (need() <= room) break;
    bands.forEach((band, index) => {
      if (band.role === role) show[index] = false;
    });
  }

  const rows = bands.map((band, index) => ({
    center: band.y + band.h / 2,
    height: labelHeight(show[index]),
  }));
  const tops = placeLabelRows(rows, TOP, TOP + room);
  const labels = bands.map((band, index) => ({
    top: tops[index],
    height: rows[index].height,
    primary: truncate(band.primary, nameWidth, NAME_FONT),
    secondary: show[index] ? truncate(band.secondary, nameWidth, META_FONT) : "",
  }));

  return {
    width,
    height,
    bands,
    labels,
    bottom,
    columns: { boardX, boardWidth, dimensionX, labelX, nameX },
  };
}

export function stackupDiagramMarkup(layout, { spans = [], totalLabel = "" } = {}) {
  const { bands, labels, bottom, columns } = layout;
  const { boardX, boardWidth, dimensionX, labelX, nameX } = columns;
  const layersHtml = bands.map((band, index) => {
    const label = labels[index];
    const center = band.y + band.h / 2;
    const primaryY = label.top + PRIMARY_HEIGHT / 2;
    const bracket = band.h >= 4
      ? `M ${dimensionX + 6} ${band.y + 1} H ${dimensionX} V ${band.y + band.h - 1} H ${dimensionX + 6}`
      : `M ${dimensionX} ${center} H ${dimensionX + 6}`;
    const leader = `M ${dimensionX + 2} ${center} H ${dimensionX + 12} L ${labelX - 6} ${primaryY}`;
    return `
      <g class="stackup-svg-layer" data-layer-id="${escapeHtml(band.id)}" data-layer-name="${escapeHtml(band.name)}">
        <title>${escapeHtml(band.description)}</title>
        <rect x="${boardX}" y="${band.y}" width="${boardWidth}" height="${Math.max(0.5, band.h)}" fill="${band.color}" opacity="0.85" rx="1"/>
        ${band.copperIndex ? `<text class="stackup-layer-index" x="${boardX - 8}" y="${center}" text-anchor="end">${band.copperIndex}</text>` : ""}
        <path class="stackup-layer-dimension" d="${bracket}" />
        <path class="stackup-layer-leader" d="${leader}" />
        <text class="stackup-layer-thickness" x="${labelX}" y="${primaryY}">${escapeHtml(band.thicknessLabel)}</text>
        <text class="stackup-layer-name" x="${nameX}" y="${primaryY}">${escapeHtml(label.primary)}</text>
        ${label.secondary ? `<text class="stackup-layer-metadata" x="${nameX}" y="${primaryY + (PRIMARY_HEIGHT + SECONDARY_HEIGHT) / 2}">${escapeHtml(label.secondary)}</text>` : ""}
      </g>`;
  }).join("");

  const copperBands = bands.filter((band) => band.role === "copper");
  const viasHtml = spans.map((span, spanIndex) => {
    const top = bands.find((band) => band.name === span.startName);
    const end = bands.find((band) => band.name === span.endName);
    if (!top || !end) return "";
    const yStart = top.y;
    const yEnd = end.y + end.h;
    const x = boardX + ((spanIndex + 1) * boardWidth) / (spans.length + 1);
    const label = span.type === "thru" ? "Thru" : span.type === "blind" ? "Blind" : "Buried";
    const color = `var(--stackup-via-${span.type})`;
    const pads = copperBands
      .filter((band) => band.y >= top.y && band.y <= end.y)
      .map((band) => `<rect x="${x - 5}" y="${band.y}" width="10" height="${band.h}" fill="${color}" rx="0.5" />`)
      .join("");
    return `
      <g class="stackup-svg-via" data-via-type="${span.type}">
        <title>${label}: ${escapeHtml(span.startName)} → ${escapeHtml(span.endName)}</title>
        ${pads}
        <rect x="${x - 2}" y="${yStart}" width="4" height="${yEnd - yStart}" fill="${color}" opacity="0.95" />
        <rect x="${x - 0.75}" y="${yStart - 1}" width="1.5" height="${yEnd - yStart + 2}" fill="var(--panel)" opacity="0.9" />
      </g>`;
  }).join("");

  const bracketX = boardX - 32;
  return `
    <g class="stackup-svg-column-headings" aria-hidden="true">
      <text x="${labelX}" y="14">Thickness</text>
      <text x="${nameX}" y="14">Layer / material properties</text>
    </g>
    <g class="stackup-total-dimension">
      <path d="M ${bracketX + 8} ${TOP} H ${bracketX} V ${bottom} H ${bracketX + 8}" />
      <text x="${bracketX}" y="14">${escapeHtml(totalLabel)}</text>
    </g>
    ${layersHtml}
    ${viasHtml}`;
}
