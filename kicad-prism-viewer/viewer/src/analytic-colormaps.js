/**
 * Colour ramps for analytic result overlays, as sRGB hex stops spaced
 * evenly from 0 to 1. The copper field and the arrows each take one; hosts
 * read the same stops to draw their legends (`analyticColormaps()`).
 */
export const COLORMAPS = Object.freeze({
  viridis: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
  inferno: ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
  magma: ["#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f", "#cd4071", "#f1605d", "#fd9668", "#feca8d", "#fcfdbf"],
  plasma: ["#0d0887", "#46039f", "#7201a8", "#9c179e", "#bd3786", "#d8576b", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8678", "#a59c74", "#c3b369", "#e1cc55", "#fee838"],
  turbo: ["#30123b", "#4662d7", "#36aaf9", "#1ae4b6", "#72fe5e", "#c8ef34", "#faba39", "#f66b19", "#ca2a04", "#7a0403"],
  coolwarm: ["#3b4cc0", "#6788ee", "#9abbff", "#c9d7f0", "#edd1c2", "#f7a889", "#e26952", "#b40426"],
  ember: ["#e0e3ed", "#ff9e1f", "#db141a"],
  ice: ["#f4f7fb", "#9ecae1", "#2171b5", "#08306b"],
  white: ["#fafaf5", "#fafaf5"],
  greys: ["#f7f7f7", "#bdbdbd", "#737373", "#252525"],
});

/** Entries per ramp on the GPU. */
export const RAMP_SIZE = 256;

/** How result overlays look; every field may be overridden (see `resolveStyle`). */
export const DEFAULT_ANALYTIC_STYLE = Object.freeze({
  // A colormap name, or a list of hex stops.
  fieldColormap: "viridis",
  arrowColormap: "ember",
  // Arrows across the board's longer side.
  arrowDensity: 70,
  // Arrow half width, as a share of the spacing.
  arrowWidth: 0.07,
  // The shortest arrow, as a share of the longest.
  arrowMinLength: 0.3,
  // Outline colour and opacity, linear 0..1.
  arrowOutline: [0.05, 0.05, 0.07, 0.85],
});

function hexColor(hex) {
  const text = String(hex).replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(text)) throw new TypeError(`colour ${hex} is not #rrggbb`);
  return [0, 2, 4].map((at) => Number.parseInt(text.slice(at, at + 2), 16) / 255);
}

/** The hex stops of `colormap`: a name from COLORMAPS or a list of two or more stops. */
export function colormapStops(colormap) {
  if (Array.isArray(colormap)) {
    if (colormap.length < 2) throw new TypeError("a colormap needs two or more stops");
    colormap.forEach(hexColor);
    return [...colormap];
  }
  const stops = COLORMAPS[colormap];
  if (!stops) throw new TypeError(`unknown colormap ${colormap}`);
  return [...stops];
}

/** `colormap` sampled into `size` RGBA entries (alpha 1), linearly between its stops. */
export function sampleColormap(colormap, size = RAMP_SIZE) {
  const stops = colormapStops(colormap).map(hexColor);
  const out = new Float32Array(size * 4);
  for (let k = 0; k < size; k++) {
    const at = (k / (size - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(at));
    const f = at - i;
    for (let c = 0; c < 3; c++) out[k * 4 + c] = stops[i][c] * (1 - f) + stops[i + 1][c] * f;
    out[k * 4 + 3] = 1;
  }
  return out;
}

/** `style` over the defaults, checked. */
export function resolveStyle(style = {}, base = DEFAULT_ANALYTIC_STYLE) {
  const out = { ...base, ...(style || {}) };
  colormapStops(out.fieldColormap);
  colormapStops(out.arrowColormap);
  const positive = (key, max) => {
    if (!(Number(out[key]) > 0 && Number(out[key]) <= max)) throw new RangeError(`${key} must be in (0, ${max}]`);
    out[key] = Number(out[key]);
  };
  positive("arrowDensity", 400);
  positive("arrowWidth", 0.5);
  positive("arrowMinLength", 1);
  if (!Array.isArray(out.arrowOutline) || out.arrowOutline.length !== 4) throw new TypeError("arrowOutline is [r, g, b, a]");
  return out;
}
