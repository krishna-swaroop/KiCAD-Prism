/*
    Inset views (IN-60, IN-61): a small view of the loaded board through a
    camera of its own, for the Visualizer's PCB/schematic insets.

    The camera is the 2D inset camera from ecad-viewer, in KiCad board
    millimetres (x right, y down), plus a tilt:

      center    [x, y] mm shown at the middle of the inset
      zoom      CSS pixels per mm
      rotation  radians, clockwise on screen
      mirror    view from below (bottom side), mirrored like KiCad's flip
      tilt      radians the view leans back from straight down (0 = top view)

    With tilt 0 the projection is orthographic straight down, so a board
    point lands exactly where the 2D inset puts it and leaders stay right.
    Tilt keeps the projection orthographic: one scale, no foreshortening of
    the leader geometry beyond the lean itself.

    The runtime frame is metres: x = board right, y = board up (KiCad y
    negated), z = stackup up.
*/

import { lookAt, mat4Multiply, orthographic } from "./math.js";

/** KiCad millimetres (y down) to runtime metres (y up). */
export function mmToRuntime(x, y, z = 0) {
  return [x / 1000, -y / 1000, z];
}

/**
 * Camera basis for an inset view: screen right, screen up and back (towards
 * the eye), in runtime metres. See the header for the conventions.
 */
export function insetBasis({ rotation = 0, mirror = false, tilt = 0 }) {
  // Straight down: right = +x, up = +y, back = +z. From below the board
  // mirrors left to right: right = -x, back = -z.
  const r0 = mirror ? [-1, 0, 0] : [1, 0, 0];
  const u0 = [0, 1, 0];
  const b0 = mirror ? [0, 0, -1] : [0, 0, 1];
  // Content turns clockwise on screen: the camera's right and up turn the
  // other way about the view axis.
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const r1 = r0.map((v, i) => c * v + s * u0[i]);
  const u1 = u0.map((v, i) => -s * r0[i] + c * v);
  // Lean back about screen right: the eye moves towards screen-down.
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const back = b0.map((v, i) => ct * v - st * u1[i]);
  const up = u1.map((v, i) => st * b0[i] + ct * v);
  return { right: r1, up, back };
}

/**
 * projection · view for an inset of `width`×`height` CSS pixels. `radius` is
 * the scene radius in metres (depth range); `focusZ` the height the view
 * pivots about (the board surface on the inset's side).
 */
export function insetMatrix(view, width, height, radius, focusZ = 0) {
  const { up, back } = insetBasis(view);
  const focus = mmToRuntime(view.center[0], view.center[1], focusZ);
  const distance = radius * 3;
  const eye = focus.map((v, i) => v + back[i] * distance);
  const metresPerPixel = 1 / (view.zoom * 1000);
  const projection = orthographic(
    width * metresPerPixel,
    height * metresPerPixel,
    -radius * 40,
    radius * 40,
  );
  return mat4Multiply(projection, lookAt(eye, focus, up));
}

/** A runtime point (metres) to inset CSS pixels, or null behind the eye. */
export function projectInset(matrix, width, height, point) {
  const [x, y, z] = point;
  const cx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const cy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const cw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (!(cw > 0)) return null;
  return [((cx / cw + 1) / 2) * width, ((1 - cy / cw) / 2) * height];
}

/**
 * The world box of a feature (runtime metres, [x0,y0,z0,x1,y1,z1]) as a KiCad
 * millimetre box {x, y, w, h} and its side.
 */
export function runtimeBoundsToMm(bounds) {
  const x0 = bounds[0] * 1000;
  const x1 = bounds[3] * 1000;
  const y0 = -bounds[4] * 1000;
  const y1 = -bounds[1] * 1000;
  return {
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    bottom: bounds[2] + bounds[5] < 0,
  };
}
