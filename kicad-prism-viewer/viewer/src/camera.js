import {
  add,
  boundsCenter,
  boundsRadius,
  clamp,
  cross,
  lookAt,
  mat4Multiply,
  mix,
  normalize,
  orthographic,
  perspective,
  scale,
} from "./math.js";

export class CameraController {
  constructor(bounds) {
    const center = boundsCenter(bounds);
    const radius = boundsRadius(bounds);
    this.focus = [...center];
    this.targetFocus = [...center];
    this.azimuth = -0.62;
    this.targetAzimuth = this.azimuth;
    this.polar = 0.72;
    this.targetPolar = this.polar;
    this.distance = radius * 2.8;
    this.targetDistance = this.distance;
    this.orthoScale = radius * 2.15;
    this.targetOrthoScale = this.orthoScale;
    this.sceneRadius = radius;
    this.fov = Math.PI / 4;
  }

  update(dt) {
    const amount = 1 - Math.exp(-dt * 14);
    this.focus = this.focus.map((value, index) => mix(value, this.targetFocus[index], amount));
    this.azimuth = mixAngle(this.azimuth, this.targetAzimuth, amount);
    this.polar = mix(this.polar, this.targetPolar, amount);
    this.distance = mix(this.distance, this.targetDistance, amount);
    this.orthoScale = mix(this.orthoScale, this.targetOrthoScale, amount);
  }

  snap() {
    this.focus = [...this.targetFocus];
    this.azimuth = this.targetAzimuth;
    this.polar = this.targetPolar;
    this.distance = this.targetDistance;
    this.orthoScale = this.targetOrthoScale;
  }

  basis() {
    const sine = Math.sin(this.polar);
    const cosine = Math.cos(this.polar);
    const back = normalize([
      sine * Math.sin(this.azimuth),
      -sine * Math.cos(this.azimuth),
      cosine,
    ]);
    const right = normalize([Math.cos(this.azimuth), Math.sin(this.azimuth), 0]);
    const up = normalize(cross(back, right));
    return { right, up, back };
  }

  matrix(width, height, orthographicMode = false, scaleMultiplier = 1) {
    const aspect = Math.max(0.01, width / Math.max(1, height));
    const { up, back } = this.basis();
    const eye = add(this.focus, scale(back, this.distance));
    const view = lookAt(eye, this.focus, up);
    const projection = orthographicMode
      ? orthographic(
          this.orthoScale * scaleMultiplier * aspect,
          this.orthoScale * scaleMultiplier,
          -this.sceneRadius * 40,
          this.sceneRadius * 40,
        )
      : perspective(
          this.fov,
          aspect,
          Math.max(this.sceneRadius * 0.0005, this.distance - this.sceneRadius * 3.5),
          this.distance + this.sceneRadius * 4.5,
        );
    return mat4Multiply(projection, view);
  }

  orbit(dx, dy) {
    this.targetAzimuth -= dx * 0.006;
    this.targetPolar = clamp(this.targetPolar - dy * 0.006, 0.015, Math.PI - 0.015);
  }

  pan(dx, dy, viewportHeight, orthographicMode = false) {
    const { right, up } = this.basis();
    const worldPerPixel = orthographicMode
      ? this.targetOrthoScale / Math.max(1, viewportHeight)
      : (2 * this.targetDistance * Math.tan(this.fov / 2)) / Math.max(1, viewportHeight);
    const movement = add(scale(right, -dx * worldPerPixel), scale(up, dy * worldPerPixel));
    this.targetFocus = add(this.targetFocus, movement);
  }

  dolly(delta, orthographicMode = false) {
    const factor = Math.exp(delta * 0.0032);
    if (orthographicMode) {
      this.targetOrthoScale = clamp(
        this.targetOrthoScale * factor,
        this.sceneRadius * 0.008,
        this.sceneRadius * 24,
      );
    } else {
      this.targetDistance = clamp(
        this.targetDistance * factor,
        this.sceneRadius * 0.01,
        this.sceneRadius * 48,
      );
    }
  }

  frame(bounds) {
    if (!bounds) return;
    const radius = boundsRadius(bounds);
    this.targetFocus = boundsCenter(bounds);
    this.targetDistance = Math.max(radius * 2.8, this.sceneRadius * 0.02);
    this.targetOrthoScale = Math.max(radius * 2.15, this.sceneRadius * 0.02);
  }

  setFocus(point) {
    this.targetFocus = [...point];
  }

  setAxis(axis, opposite = false) {
    if (axis === "z") {
      this.targetAzimuth = 0;
      this.targetPolar = opposite ? Math.PI - 0.015 : 0.015;
    } else if (axis === "x") {
      this.targetAzimuth = opposite ? -Math.PI / 2 : Math.PI / 2;
      this.targetPolar = Math.PI / 2;
    } else {
      this.targetAzimuth = opposite ? 0 : Math.PI;
      this.targetPolar = Math.PI / 2;
    }
  }

  rotateZ(direction = 1) {
    this.targetAzimuth += direction * Math.PI / 2;
  }

  flip() {
    this.targetPolar = Math.PI - this.targetPolar;
  }
}

function mixAngle(current, target, amount) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}
