// A path-traced still of the 3D view (the Render action): the plain data the
// trace worker builds a MuTracer scene from, and the pure steps between the
// viewer's capture and that scene. Nothing here touches the GPU or MuTracer,
// so it runs in the worker and in node tests alike.
//
// The board is a "texture board": a slab cut to the outline (walls from the
// laminate's contour edges, top and bottom faces alpha-cut by its coverage),
// with each face's look in maps composited from per-layer coverage that the
// analytic renderer drew top-down (trace-capture.js). Copper relief is a
// normal map from layer heights; nothing is displaced.

/** Hole protection flags (the pack's barrel words; analytic-pack.js BARREL_FLAGS). */
export const HOLE_FLAGS = Object.freeze({
  tentedFront: 1 << 2, tentedBack: 1 << 3, coveredFront: 1 << 4, coveredBack: 1 << 5,
  pluggedFront: 1 << 6, pluggedBack: 1 << 7, filled: 1 << 8, capped: 1 << 9,
});
/** Floats per hole in a capture: centre x, y (board mm), half length, angle, radius (mm), flags. */
export const HOLE_FLOATS = 6;

/**
 * How one face shows a plated hole (IPC-4761): "capped" (copper over a
 * filled hole: the pad, whole), "filled" (resin, flush), "plugged" (resin
 * from this side, dipping), "tented" (mask over it, dipping; covered reads
 * the same), else "open".
 */
export function holeFinish(flags, front) {
  if (flags & HOLE_FLAGS.capped) return "capped";
  if (flags & HOLE_FLAGS.filled) return "filled";
  if (flags & (front ? HOLE_FLAGS.pluggedFront : HOLE_FLAGS.pluggedBack)) return "plugged";
  if (flags & (front ? HOLE_FLAGS.tentedFront | HOLE_FLAGS.coveredFront : HOLE_FLAGS.tentedBack | HOLE_FLAGS.coveredBack)) return "tented";
  return "open";
}

/** Layer heights over the laminate, micrometres (the spike's defaults). */
export const RELIEF_UM = { mask: 20, finish: 40, copperUnderMask: 47, silk: 15 };

/** The look of the board's surfaces; colours linear RGB. */
export const BOARD_LOOK = {
  // KiCad's FR4 laminate, as the 3D viewer shows a bare board.
  laminate: [0.28, 0.24, 0.12],
  laminateRoughness: 0.6,
  silk: [0.85, 0.85, 0.83],
  silkRoughness: 0.8,
  maskRoughness: 0.5,
  // Via fill and plug resin.
  resin: [0.42, 0.38, 0.3],
  resinRoughness: 0.45,
  // Copper under the mask shows through it lighter (the mask's colour times this).
  maskOverCopper: 2.1,
  finishRoughness: 0.38,
  coatWeight: 0.6,
  coatRoughness: 0.15,
};

/** Exposed outer copper's metal colour (linear F0) by the stackup's surface finish. */
export function traceFinishColor(finish) {
  const value = String(finish || "").toLowerCase();
  if (/hasl|hal\b|tin|silver|lead/.test(value)) return [0.9, 0.9, 0.88];
  if (/osp|bare/.test(value)) return [0.95, 0.62, 0.48];
  // ENIG when unstated ("None"): the look most boards are made in.
  return [0.8, 0.56, 0.24];
}

// KiCad's named mask colours as a lacquer reads under a path tracer: deeper
// and more saturated than the viewer's flat colours (linear RGB).
const TRACE_MASKS = {
  green: [0.012, 0.072, 0.02],
  red: [0.2, 0.012, 0.01],
  blue: [0.008, 0.03, 0.14],
  yellow: [0.5, 0.36, 0.02],
  white: [0.7, 0.7, 0.68],
  black: [0.008, 0.008, 0.009],
  purple: [0.07, 0.015, 0.12],
};

/** A mask's colour for tracing: a named colour's lacquer, else `fallback` (the viewer's linear look). */
export function traceMaskColor(name, fallback) {
  return TRACE_MASKS[String(name || "").trim().toLowerCase()] || fallback || TRACE_MASKS.green;
}

/** Viewer world (metres, z up) to MuTracer's (y up): (x, y, z) -> (x, z, -y). */
export function toTraceFrame([x, y, z]) {
  return [x, z, -y];
}

/** The same as a column-major matrix, for transforms. */
export const TRACE_FRAME = Object.freeze([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
/** Its inverse (its transpose): (x, y, z) -> (x, -z, y). */
export const TRACE_FRAME_INVERSE = Object.freeze([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]);

/** `a * b`, column-major 4×4. */
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** A placement's three rows (gltf-loader `placementRows`, board frame) as a column-major 4×4. */
export function rowsToMatrix(rows) {
  return new Float32Array([
    rows[0], rows[4], rows[8], 0,
    rows[1], rows[5], rows[9], 0,
    rows[2], rows[6], rows[10], 0,
    rows[3], rows[7], rows[11], 1,
  ]);
}

const srgb = (linear) => {
  const value = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
};

/**
 * One face's maps from its layers' coverage (0 or 255 per pixel, rows along
 * board +y): `color` (sRGB, alpha = the board body or the mask over it), `data` (linear: R coat,
 * G roughness, B metalness) and `normal` (tangent space, from layer heights).
 * `pitchMm` is a pixel's size; `mask` and `finish` are linear RGB.
 */
export function composeFaceMaps({ width, height, pitchMm, originMm = [0, 0], copper, mask, silk, body, holes = null, front = true }, { maskColor, finishColor, look = BOARD_LOOK }) {
  const count = width * height;
  const color = new Uint8Array(count * 4);
  const data = new Uint8Array(count * 4);
  const heights = new Float32Array(count);
  const maskSrgb = maskColor.map(srgb);
  const lifted = maskColor.map((value) => srgb(value * look.maskOverCopper + 0.004));
  const finishSrgb = finishColor.map(srgb);
  const silkSrgb = look.silk.map(srgb);
  const laminateSrgb = look.laminate.map(srgb);
  const byte = (value) => Math.round(255 * value);
  const roughness = {
    silk: byte(look.silkRoughness), mask: byte(look.maskRoughness), finish: byte(look.finishRoughness), laminate: byte(look.laminateRoughness),
  };
  for (let index = 0; index < count; index += 1) {
    const cu = copper?.[index] > 127;
    const coated = mask?.[index] > 127;
    const printed = silk?.[index] > 127;
    const at = index * 4;
    let rgb;
    let coat = 0;
    let rough;
    let metal = 0;
    let h = 0;
    if (coated) {
      rgb = cu ? lifted : maskSrgb;
      coat = 255;
      rough = roughness.mask;
      h = cu ? RELIEF_UM.copperUnderMask : RELIEF_UM.mask;
    } else if (cu) {
      rgb = finishSrgb;
      rough = roughness.finish;
      metal = 255;
      h = RELIEF_UM.finish;
    } else {
      rgb = laminateSrgb;
      rough = roughness.laminate;
    }
    if (printed) {
      rgb = silkSrgb;
      coat = 0;
      rough = roughness.silk;
      metal = 0;
      h += RELIEF_UM.silk;
    }
    color[at] = rgb[0];
    color[at + 1] = rgb[1];
    color[at + 2] = rgb[2];
    // A hole the mask tents stays covered: the mask spans it.
    color[at + 3] = !body || body[index] > 127 || coated ? 255 : 0;
    data[at] = coat;
    data[at + 1] = rough;
    data[at + 2] = metal;
    data[at + 3] = 255;
    heights[index] = h;
  }
  if (holes?.length) {
    paintHoles({ width, height, pitchMm, originMm, holes, front, color, data, heights }, {
      mask: maskSrgb, finish: finishSrgb, resin: look.resin.map(srgb),
      maskRough: roughness.mask, finishRough: roughness.finish, resinRough: byte(look.resinRoughness),
    });
  }
  return { width, height, color, data, normal: normalMap(boxBlur(heights, width, height), width, height, pitchMm * 1000) };
}

/**
 * Each plated hole into one face's maps by its protection (`holeFinish`):
 * the drill's pixels (a disk, or a slot's capsule) made opaque and given
 * the look of what closes the hole on this side, a dip where it sags. An
 * open hole is left as the body's coverage cut it.
 */
export function paintHoles({ width, height, pitchMm, originMm, holes, front, color, data, heights }, looks) {
  for (let h = 0; h + HOLE_FLOATS <= holes.length; h += HOLE_FLOATS) {
    const [cx, cy, half, angle, radius] = holes.subarray ? holes.subarray(h, h + 5) : holes.slice(h, h + 5);
    const finish = holeFinish(holes[h + 5], front);
    if (finish === "open") continue;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    const reach = radius + half;
    const x0 = Math.max(0, Math.floor((cx - reach - originMm[0]) / pitchMm));
    const x1 = Math.min(width - 1, Math.ceil((cx + reach - originMm[0]) / pitchMm));
    const y0 = Math.max(0, Math.floor((cy - reach - originMm[1]) / pitchMm));
    const y1 = Math.min(height - 1, Math.ceil((cy + reach - originMm[1]) / pitchMm));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const px = originMm[0] + (x + 0.5) * pitchMm - cx;
        const py = originMm[1] + (y + 0.5) * pitchMm - cy;
        // Distance to the slot's axis (a point for a round hole).
        const length2 = dx * dx + dy * dy;
        const t = length2 > 0 ? Math.max(-1, Math.min(1, (px * dx + py * dy) / length2)) : 0;
        const distance = Math.hypot(px - t * dx, py - t * dy);
        if (distance > radius) continue;
        const index = y * width + x;
        const at = index * 4;
        const depth = 1 - (distance / radius) ** 2;
        let rgb = null;
        if (finish === "capped") {
          // The pad's own finish (or the mask over it) carries on: only the hole's shadow goes.
          if (color[at + 3] === 0) {
            rgb = looks.finish;
            data[at] = 0; data[at + 1] = looks.finishRough; data[at + 2] = 255;
            heights[index] = RELIEF_UM.finish;
          }
        } else if (finish === "filled") {
          if (data[at] !== 255) {
            rgb = looks.resin;
            data[at] = 0; data[at + 1] = looks.resinRough; data[at + 2] = 0;
          }
          heights[index] -= 4 * depth;
        } else if (finish === "plugged") {
          if (data[at] !== 255) {
            rgb = looks.resin;
            data[at] = 0; data[at + 1] = looks.resinRough; data[at + 2] = 0;
          }
          heights[index] -= 25 * depth;
        } else {
          // Tented: the mask spans the hole and sags into it, where there is mask
          // (a pad's opening around a via-in-pad leaves it open).
          if (data[at] !== 255) continue;
          rgb = looks.mask;
          heights[index] = Math.max(0, RELIEF_UM.copperUnderMask - 35 * depth);
        }
        if (rgb) {
          color[at] = rgb[0]; color[at + 1] = rgb[1]; color[at + 2] = rgb[2];
        }
        color[at + 3] = 255;
      }
    }
  }
}

/** A 3×3 box blur, clamped at the edges: softens the coverage's pixel steps into a bevel. */
export function boxBlur(values, width, height) {
  const across = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const left = values[row + Math.max(0, x - 1)];
      const right = values[row + Math.min(width - 1, x + 1)];
      across[row + x] = (left + values[row + x] + right) / 3;
    }
  }
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) out[row + x] = (across[up + x] + across[row + x] + across[down + x]) / 3;
  }
  return out;
}

/**
 * Tangent-space normals (+u = board +x, +v = board +y, out of the face) of a
 * height field in micrometres over pixels `pitchUm` wide, as RGBA8.
 */
export function normalMap(heights, width, height, pitchUm) {
  const out = new Uint8Array(width * height * 4);
  const span = 2 * pitchUm;
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const dx = (heights[row + Math.min(width - 1, x + 1)] - heights[row + Math.max(0, x - 1)]) / span;
      const dy = (heights[down + x] - heights[up + x]) / span;
      const length = Math.hypot(dx, dy, 1);
      const at = (row + x) * 4;
      out[at] = Math.round(255 * (0.5 - 0.5 * dx / length));
      out[at + 1] = Math.round(255 * (0.5 - 0.5 * dy / length));
      out[at + 2] = Math.round(255 * (0.5 + 0.5 / length));
      out[at + 3] = 255;
    }
  }
  return out;
}

/**
 * A face over the board's bounds (millimetres, KiCad frame) at height `y`
 * (trace frame, metres), its UVs over the bounds (v along board +y) and a
 * tangent along +x whose handedness puts the bitangent along +v.
 */
export function faceGeometry(boundsMm, y, up) {
  const [x0, y0, x1, y1] = boundsMm;
  const corners = [[x0, y0, 0, 0], [x1, y0, 1, 0], [x1, y1, 1, 1], [x0, y1, 0, 1]];
  const position = new Float32Array(12);
  const normal = new Float32Array(12);
  const tangent = new Float32Array(16);
  const uv = new Float32Array(8);
  corners.forEach(([x, z, u, v], index) => {
    position.set([x / 1000, y, z / 1000], index * 3);
    normal.set([0, up ? 1 : -1, 0], index * 3);
    // cross(N, T) is -z on the top face, +z on the bottom: w turns it to +v (+z).
    tangent.set([1, 0, 0, up ? -1 : 1], index * 4);
    uv.set([u, v], index * 2);
  });
  // Counter-clockwise seen from outside.
  const indices = up ? new Uint32Array([0, 3, 2, 0, 2, 1]) : new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { position, normal, tangent, uv, indices };
}

/**
 * The board's walls: each contour edge (x0, y0, x1, y1 millimetres) as a quad
 * between `bottom` and `top` (trace frame metres), facing along its normal in
 * the plane. Drill holes are contours too, so they get walls.
 */
export function wallGeometry(edges, bottom, top) {
  const count = Math.floor(edges.length / 4);
  const position = new Float32Array(count * 12);
  const normal = new Float32Array(count * 12);
  const indices = new Uint32Array(count * 6);
  for (let e = 0; e < count; e += 1) {
    const [ax, ay, bx, by] = [edges[e * 4] / 1000, edges[e * 4 + 1] / 1000, edges[e * 4 + 2] / 1000, edges[e * 4 + 3] / 1000];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    // Outward: contours keep the material on their left (board y down).
    const [nx, nz] = [-(by - ay) / length, (bx - ax) / length];
    position.set([ax, bottom, ay, bx, bottom, by, bx, top, by, ax, top, ay], e * 12);
    for (let k = 0; k < 4; k += 1) normal.set([nx, 0, nz], e * 12 + k * 3);
    const base = e * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], e * 6);
  }
  return { position, normal, indices };
}

/**
 * The viewer's camera as the trace frame's: `{ eye, target, up }` (viewer
 * world) and the vertical field of view (radians) to a MuTracer camera's
 * parameters (degrees).
 */
export function traceCamera({ eye, target, up, fovY, sceneRadius }) {
  const distance = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
  return {
    position: toTraceFrame(eye),
    target: toTraceFrame(target),
    up: toTraceFrame(up),
    fov: (fovY * 180) / Math.PI,
    near: Math.max(distance * 1e-3, 1e-5),
    far: distance + (sceneRadius || distance) * 8,
  };
}

/**
 * A dark studio as an equirectangular radiance map (linear RGBA float, rows
 * from the zenith down, +y up, MuTracer's mapping: u = atan2(-z, -x) / 2π),
 * set around the camera so a product shot's lighting follows the view: a dim
 * gradient and soft boxes, each `[azimuth°, elevation°, width°, height°,
 * radiance]` with azimuth 0 behind the camera and positive to its right.
 * None sits where a flat board facing the camera mirrors it.
 */
export const STUDIO_SOFTBOXES = [
  [-55, 58, 50, 28, 4],
  [75, 24, 46, 24, 1.2],
  [165, 32, 70, 20, 3],
];

export function studioEnvironment(camera, width = 512, height = 256, softboxes = STUDIO_SOFTBOXES) {
  const data = new Float32Array(width * height * 4);
  // The camera's horizontal frame: `toward` from the subject to the camera, `right` its right.
  const dx = camera.position[0] - camera.target[0];
  const dz = camera.position[2] - camera.target[2];
  const length = Math.hypot(dx, dz) || 1;
  const toward = [dx / length, dz / length];
  const right = [toward[1], -toward[0]];
  const smooth = (edge, value) => Math.min(1, Math.max(0, (edge - value) / Math.max(edge * 0.35, 1e-6)));
  const degrees = 180 / Math.PI;
  for (let row = 0; row < height; row += 1) {
    const theta = ((row + 0.5) / height) * Math.PI;
    const across = Math.sin(theta);
    const elevation = 90 - theta * degrees;
    const base = elevation >= 0 ? 0.03 + 0.02 * (elevation / 90) : 0.01;
    for (let column = 0; column < width; column += 1) {
      const phi = ((column + 0.5) / width) * 2 * Math.PI;
      const x = -Math.cos(phi) * across;
      const z = -Math.sin(phi) * across;
      const azimuth = Math.atan2(x * right[0] + z * right[1], x * toward[0] + z * toward[1]) * degrees;
      let radiance = base;
      for (const [az, el, w, h, power] of softboxes) {
        const da = Math.abs(((azimuth - az + 540) % 360) - 180) * Math.cos(elevation / degrees);
        const de = Math.abs(elevation - el);
        radiance += power * smooth(w / 2, da) * smooth(h / 2, de);
      }
      const at = (row * width + column) * 4;
      data[at] = radiance;
      data[at + 1] = radiance * 0.98;
      data[at + 2] = radiance * 0.95;
      data[at + 3] = 1;
    }
  }
  return { data, width, height };
}
