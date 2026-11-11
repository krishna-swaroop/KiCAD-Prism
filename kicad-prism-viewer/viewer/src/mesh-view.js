// The board scene port's mesh members (power-integrity spec 11 §3): the
// packs a host loaded, the one shown, picking, ranking and framing. main.js
// spreads `meshPortMembers(scene)` into the board port; `scene` gives what
// they need of the mounted board, so this file has no DOM or camera of its own.

import { MeshOverlay } from "./mesh-overlay.js";
import { elementAt, elementInfo, meshField, meshPackSummary, openMeshPack, pieceAt, thresholdKeeps, worstElements } from "./mesh-pack.js";

/**
 * @param {object} scene
 * @param {() => object | null} scene.renderer The board's Renderer, or null once disposed.
 * @param {() => Set<number> | null} scene.visibleLayers The 3D view's shown copper layer ids.
 * @param {() => Float32Array} scene.layerOffsets The stackup separation's per-layer offsets (world metres).
 * @param {(clientX: number, clientY: number) => {origin: number[], direction: number[]} | null} scene.worldRay
 * @param {(bounds: number[]) => void} scene.frame Ease the camera onto world bounds [x0, y0, z0, x1, y1, z1].
 * @param {(world: number[]) => {x: number, y: number} | null} scene.project World metres to client pixels.
 */
export function meshPortMembers(scene) {
  const packs = new Map();
  let shown = null;
  // The style a host set, kept while no pack is shown and applied to the next.
  let style = {};
  let selection = -1;

  const overlay = () => {
    const renderer = scene.renderer();
    if (!renderer) return null;
    renderer.meshOverlay ??= new MeshOverlay(renderer);
    return renderer.meshOverlay;
  };
  const current = () => (shown ? packs.get(shown) : null);
  const describe = (key) => {
    const pack = packs.get(key);
    if (!pack) return null;
    const summary = meshPackSummary(pack, key);
    const drawn = overlay();
    return { ...summary, shown: key === shown, unmatchedSlices: key === shown && drawn ? drawn.unmatchedSlices() : null };
  };
  const shownSlices = () => {
    const drawn = overlay();
    const pack = current();
    if (!drawn || !pack) return [];
    const layers = scene.visibleLayers();
    return drawn.slices.filter((key) => drawn.sliceShown(key, layers));
  };
  const kept = (pack) => {
    const drawn = overlay();
    const threshold = drawn?.style.threshold;
    const name = drawn?.thresholdField();
    if (!threshold || !name) return null;
    const values = meshField(pack, name).values;
    return (index) => thresholdKeeps(threshold, values[index]);
  };
  const info = (pack, index, sliceKey = null) => {
    const element = elementInfo(pack, index);
    if (!element) return null;
    return { pack: shown, ...element, ...(sliceKey ? { sliceKey } : {}) };
  };

  const select = (index) => {
    selection = Number.isInteger(index) ? index : -1;
    overlay()?.setSelection(selection);
  };
  const show = (key) => {
    const drawn = overlay();
    shown = key != null && packs.has(String(key)) ? String(key) : null;
    selection = -1;
    if (!drawn) return shown ? describe(shown) : null;
    drawn.setPack(current());
    if (shown) {
      try {
        drawn.setStyle(style);
      } catch {
        // A style naming a field this pack lacks: plain, as a fresh pack shows.
        style = {};
        drawn.setStyle({ colorBy: null, threshold: null, range: null });
      }
    }
    return shown ? describe(shown) : null;
  };

  return {
    /**
     * Read a mesh pack (bytes as written, deflated, or inflated) and keep it
     * under `key` (default: its label); the shown one is replaced in place.
     * Resolves to its summary.
     */
    async loadMeshPack(bytes, { key = null } = {}) {
      const pack = await openMeshPack(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      const name = String(key ?? (pack.header.label || `mesh ${packs.size + 1}`));
      packs.set(name, pack);
      if (name === shown) {
        overlay()?.setPack(pack);
        overlay()?.setStyle(style);
      }
      return describe(name);
    },
    /** Every loaded pack's summary, in load order. */
    meshPacks() {
      return [...packs.keys()].map(describe);
    },
    /** Show the pack under `key`, or no mesh for null; returns its summary (with slices the board lacks) or null. */
    setMeshPack: show,
    /** Change how the mesh looks (mesh-overlay.js DEFAULT_MESH_STYLE); returns the style in force. */
    setMeshStyle(next) {
      style = { ...style, ...(next || {}) };
      const drawn = overlay();
      if (!drawn || !current()) return { ...style };
      return drawn.setStyle(next || {});
    },
    /** Highlight one element of the shown pack, or none (null). */
    setMeshSelection: select,
    /** An element of the shown pack: its corners, centroid, bounds (mm) and fields; null when there is none. */
    meshElement(index) {
      const pack = current();
      return pack ? info(pack, Number(index)) : null;
    },
    /**
     * The element of the shown pack under a client point: on the nearest
     * shown slice whose plane the view ray meets inside a kept element. Adds
     * the slice, the point (mm) and the copper there (`copper`: the layers'
     * nets and pieces the point lies in).
     */
    meshElementAt(clientX, clientY) {
      const pack = current();
      const drawn = overlay();
      const ray = pack && drawn ? scene.worldRay(clientX, clientY) : null;
      if (!ray || Math.abs(ray.direction[2]) < 1e-12) return null;
      const offsets = scene.layerOffsets();
      const hits = shownSlices()
        .map((key) => ({ key, t: (drawn.sliceZ(key, offsets) - ray.origin[2]) / ray.direction[2] }))
        .filter((hit) => hit.t > 0)
        .sort((a, b) => a.t - b.t);
      const accept = kept(pack);
      for (const { key, t } of hits) {
        const x = (ray.origin[0] + t * ray.direction[0]) * 1e9;
        const y = -(ray.origin[1] + t * ray.direction[1]) * 1e9;
        const index = elementAt(pack, x, y, accept);
        if (index < 0) continue;
        const copper = pack.layers
          .filter((layer) => layer.sliceKey === key)
          .map((layer) => ({ netKey: layer.netKey, hit: pieceAt(pack, layer, index, x, y) }))
          .filter((item) => item.hit)
          .map((item) => ({ netKey: item.netKey, piece: item.hit.piece }));
        return { ...info(pack, index, key), pointMm: [x / 1e6, y / 1e6], copper };
      }
      return null;
    },
    /** The shown pack's `count` worst elements by `field` (`order` as mesh-pack.js `worstElements`). */
    meshWorst({ field, count = 20, order = null } = {}) {
      const pack = current();
      return pack ? worstElements(pack, field, { count, order }) : [];
    },
    /** Select an element and ease the camera onto it, with room around; false when it is not there. */
    frameMeshElement(index, { context = 8 } = {}) {
      const pack = current();
      const drawn = overlay();
      const element = pack ? elementInfo(pack, Number(index)) : null;
      const [key] = shownSlices().length ? shownSlices() : drawn?.slices || [];
      const z = key ? drawn.sliceZ(key, scene.layerOffsets()) : null;
      if (!element || z == null) return false;
      const [x0, y0, x1, y1] = element.boundsMm;
      const reach = Math.max(x1 - x0, y1 - y0) * context / 2;
      const [cx, cy] = element.centroidMm;
      scene.frame([(cx - reach) / 1000, -(cy + reach) / 1000, z, (cx + reach) / 1000, -(cy - reach) / 1000, z]);
      select(element.index);
      return true;
    },
    /** The shown pack's markers with where each appears (client px) on its first shown slice; null off screen. */
    meshMarkers() {
      const pack = current();
      const drawn = overlay();
      if (!pack || !drawn) return [];
      const offsets = scene.layerOffsets();
      const visible = new Set(shownSlices());
      return pack.markers.map((marker) => {
        const key = marker.sliceKeys.find((slice) => visible.has(slice));
        const z = key ? drawn.sliceZ(key, offsets) : null;
        return { ...marker, client: z == null ? null : scene.project([marker.x * 1e-9, -marker.y * 1e-9, z]) };
      });
    },
    /** What the overlay holds: the shown pack, its GPU bytes and the style in force. */
    meshStats() {
      const drawn = scene.renderer()?.meshOverlay;
      return {
        packs: packs.size,
        shown,
        selection,
        gpuMemoryBytes: drawn?.gpuMemoryBytes() || 0,
        unmatchedSlices: drawn?.unmatchedSlices() || [],
        style: drawn?.pack ? drawn.style : { ...style },
      };
    },
    /** Forget a pack; the shown one goes from the board. */
    unloadMeshPack(key) {
      const name = String(key);
      packs.delete(name);
      if (name === shown) show(null);
    },
  };
}
