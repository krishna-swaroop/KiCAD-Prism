export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const mix = (a, b, t) => a + (b - a) * t;

export function v3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a, value) {
  return [a[0] * value, a[1] * value, a[2] * value];
}

export function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a) {
  const size = length(a) || 1;
  return scale(a, 1 / size);
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function quatIdentity() {
  return [0, 0, 0, 1];
}

export function quatAxis(axis, angle) {
  const half = angle / 2;
  const sine = Math.sin(half);
  const unit = normalize(axis);
  return [unit[0] * sine, unit[1] * sine, unit[2] * sine, Math.cos(half)];
}

export function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatNormalize(q) {
  const size = Math.hypot(...q) || 1;
  return q.map((value) => value / size);
}

export function quatRotate(q, point) {
  const vector = [point[0], point[1], point[2], 0];
  const inverse = [-q[0], -q[1], -q[2], q[3]];
  const result = quatMultiply(quatMultiply(q, vector), inverse);
  return result.slice(0, 3);
}

export function quatSlerp(a, b, t) {
  let cosine = dot4(a, b);
  let target = b;
  if (cosine < 0) {
    target = b.map((value) => -value);
    cosine = -cosine;
  }
  if (cosine > 0.9995) {
    return quatNormalize(a.map((value, index) => mix(value, target[index], t)));
  }
  const theta = Math.acos(clamp(cosine, -1, 1));
  const sine = Math.sin(theta);
  return a.map(
    (value, index) =>
      (Math.sin((1 - t) * theta) / sine) * value +
      (Math.sin(t * theta) / sine) * target[index],
  );
}

function dot4(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function mat4Multiply(a, b) {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return output;
}

export function lookAt(eye, target, up) {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ]);
}

export function orthographic(width, height, near, far) {
  return new Float32Array([
    2 / width, 0, 0, 0,
    0, 2 / height, 0, 0,
    0, 0, 1 / (near - far), 0,
    0, 0, 0, 1,
  ]);
}

export function boundsCenter(bounds) {
  return [
    (bounds[0] + bounds[3]) / 2,
    (bounds[1] + bounds[4]) / 2,
    (bounds[2] + bounds[5]) / 2,
  ];
}

export function boundsRadius(bounds) {
  return Math.max(
    0.001,
    Math.hypot(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]) / 2,
  );
}
