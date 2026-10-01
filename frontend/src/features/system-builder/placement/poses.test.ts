import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type Bounds,
  type PlacedPose,
  type Pose,
  canonicalRotation,
  compose,
  defaultRow,
  matrix,
  place,
  poseFrom,
  transformBounds,
  union,
} from "./poses";

interface Case {
  name: string;
  op: string;
  input: Record<string, unknown>;
  expected: unknown;
}

// The goldens are shared with the Python half (CONTRACTS_P2 §14).
const golden = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../../backend/tests/fixtures/system_builder/placement_cases.json"), "utf8"),
) as { tolerance: { mm: number; unit: number }; poses: Case[] };

type Items = [string, Bounds | null][];

const OPS: Record<string, (input: any) => unknown> = {
  canonicalRotation: (i) => canonicalRotation(i.rotation),
  poseFrom: (i) => poseFrom(i.translationMm, i.rotation),
  compose: (i) => compose(i.parent as Pose, i.child as Pose),
  matrix: (i) => matrix(i.pose as Pose),
  transformBounds: (i) => transformBounds(i.pose as Pose, i.bounds as Bounds),
  defaultRow: (i) => defaultRow(i.items as Items),
  place: (i) => place(i.items as Items, i.stored as Record<string, PlacedPose>),
};

/** Equal structure, numbers within the goldens' tolerance. */
function expectClose(actual: unknown, expected: unknown, path = "") {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(golden.tolerance.unit);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((value, index) => expectClose((actual as unknown[])[index], value, `${path}[${index}]`));
    return;
  }
  if (expected && typeof expected === "object") {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expectClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    return;
  }
  expect(actual, path).toEqual(expected);
}

describe("placement poses (shared goldens)", () => {
  it("covers every operation", () => {
    expect(new Set(golden.poses.map((c) => c.op))).toEqual(new Set(Object.keys(OPS)));
  });

  it.each(golden.poses.map((c) => [c.name, c] as const))("replays %s", (_name, spec) => {
    expectClose(OPS[spec.op](spec.input), spec.expected);
  });

  it("unions boxes and skips the unknown ones", () => {
    expect(union([null, null])).toBeNull();
    expect(union([{ minMm: [0, 0, -1], maxMm: [10, 5, 1] }, null, { minMm: [-2, 3, 0], maxMm: [4, 9, 2] }])).toEqual({
      minMm: [-2, 0, -1],
      maxMm: [10, 9, 2],
    });
  });

  it("refuses what is not a pose", () => {
    expect(() => poseFrom([0, 0], [0, 0, 0, 1])).toThrow();
    expect(() => poseFrom([0, 0, 0], [0, 0, 0, 0])).toThrow();
    expect(() => poseFrom([Number.NaN, 0, 0], [0, 0, 0, 1])).toThrow();
    expect(() => poseFrom([2e6, 0, 0], [0, 0, 0, 1])).toThrow();
  });
});
