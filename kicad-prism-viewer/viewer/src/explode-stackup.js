// Exploded stackup (the separation control). Copper layers move apart while
// the board context (solder mask, silkscreen, paste) stays on the board. Outer
// copper starts under that context and ends above it; sliding through it would
// put copper and a context surface at the same height for some separation,
// where the two z-fight in bands that crawl as the view turns. So the outer
// copper steps clear of the context as soon as the board separates, then
// spreads as before.

// Context faces sit a few microns off the copper; these lifts keep their
// depth order on the assembled board.
const CONTEXT_LIFT = { soldermask: 0.000018, silkscreen: 0.000035 };
const CONTEXT_ROLES = new Set(["soldermask", "silkscreen", "paste"]);
// How far above the highest context face the stepped outer copper lands.
export const EXPLODE_CLEARANCE_MARGIN = 0.00002;

/** The context lift of one draw entry, outward from its side of the board. */
export function boardContextOffset(entry) {
  if (entry.kind !== "board") return 0;
  const lift = CONTEXT_LIFT[entry.boardRole];
  if (!lift) return 0;
  const bounds = entry.bounds;
  const centerZ = bounds ? (bounds[2] + bounds[5]) * 0.5 : 0;
  return (centerZ < 0 ? -1 : 1) * lift;
}

/**
 * How far the outer copper must move out to clear the board context:
 * `copperBounds` is the copper's runtime box (z = [2], [5]), `entries` the
 * renderer's draw entries. 0 when no context face lies outside the copper.
 */
export function explodeClearance(copperBounds, entries, margin = EXPLODE_CLEARANCE_MARGIN) {
  if (!copperBounds) return 0;
  let need = -Infinity;
  for (const entry of entries) {
    if (entry.kind !== "board" || !CONTEXT_ROLES.has(entry.boardRole) || !entry.bounds) continue;
    const offset = boardContextOffset(entry);
    const top = (entry.bounds[2] + entry.bounds[5]) * 0.5 >= 0;
    need = Math.max(need, top
      ? entry.bounds[5] + offset - copperBounds[5]
      : copperBounds[2] - (entry.bounds[2] + offset));
  }
  return need >= 0 ? need + margin : 0;
}

/**
 * The gap between neighbouring copper layers at `separation` (0..1): grows
 * with the square of the separation and the board diagonal, plus, once
 * separated at all, the step that puts the outer layers `clearance` out.
 */
export function explodeGap(separation, diagonalMm, clearance, copperLayerCount) {
  if (!(separation > 0)) return 0;
  const spread = separation * separation * Math.min(25, Math.max(8, diagonalMm * 0.12)) / 1000;
  const outerStep = (copperLayerCount - 1) / 2;
  return outerStep > 0 ? spread + clearance / outerStep : spread;
}
