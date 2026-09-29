import assert from "node:assert/strict";
import test from "node:test";

import { layoutStackup, placeLabelRows, stackupDiagramMarkup } from "./stackup-diagram.js";

function sixLayerStack() {
  const layer = (name, role, thicknessMm, secondary = "") => ({
    id: name,
    name,
    role,
    color: "#888",
    thicknessMm,
    thicknessLabel: `${thicknessMm.toFixed(4)} mm`,
    primary: `${name} · ${role}`,
    secondary,
    copperIndex: 0,
    description: name,
  });
  return [
    layer("F.SilkS", "silkscreen", 0.01),
    layer("F.Paste", "paste", 0.01),
    layer("F.Mask", "soldermask", 0.01),
    layer("F.Cu", "copper", 0.035),
    layer("dielectric 1", "dielectric", 0.2, "FR4 · εr 4.5 · tan δ 0.02"),
    layer("In1.Cu", "copper", 0.035),
    layer("dielectric 2", "dielectric", 1.0, "FR4 · εr 4.5 · tan δ 0.02"),
    layer("In2.Cu", "copper", 0.035),
    layer("dielectric 3", "dielectric", 0.2, "FR4 · εr 4.5 · tan δ 0.02"),
    layer("B.Cu", "copper", 0.035),
    layer("B.Mask", "soldermask", 0.01),
    layer("B.Paste", "paste", 0.01),
    layer("B.SilkS", "silkscreen", 0.01),
  ];
}

function assertNoOverlap(labels) {
  for (let index = 1; index < labels.length; index += 1) {
    const previous = labels[index - 1];
    assert.ok(
      labels[index].top >= previous.top + previous.height,
      `label ${index} overlaps label ${index - 1}`,
    );
  }
}

test("bands fit the given height", () => {
  for (const height of [220, 400, 900]) {
    const layout = layoutStackup(sixLayerStack(), { width: 700, height });
    assert.ok(layout.bottom <= height, `bottom ${layout.bottom} exceeds ${height}`);
  }
});

test("label rows never overlap and stay inside the diagram when they fit", () => {
  const height = 600;
  const layout = layoutStackup(sixLayerStack(), { width: 700, height });
  assertNoOverlap(layout.labels);
  const last = layout.labels.at(-1);
  assert.ok(last.top + last.height <= height);
});

test("secondary lines are dropped when rows would not fit", () => {
  const roomy = layoutStackup(sixLayerStack(), { width: 700, height: 900 });
  assert.ok(roomy.labels.some((label) => label.secondary));
  const tight = layoutStackup(sixLayerStack(), { width: 700, height: 260 });
  assert.ok(tight.labels.every((label) => !label.secondary));
  assertNoOverlap(tight.labels);
});

test("placeLabelRows keeps rows at their centre when there is room", () => {
  const tops = placeLabelRows([{ center: 50, height: 10 }, { center: 150, height: 10 }], 0, 300);
  assert.deepEqual(tops, [45, 145]);
});

test("placeLabelRows pushes crowded rows apart", () => {
  const rows = [{ center: 50, height: 16 }, { center: 52, height: 16 }, { center: 54, height: 16 }];
  const tops = placeLabelRows(rows, 0, 300, 2);
  assert.ok(tops[1] >= tops[0] + 18);
  assert.ok(tops[2] >= tops[1] + 18);
});

test("long names are truncated to the label column", () => {
  const layers = sixLayerStack();
  layers[4].primary = "x".repeat(400);
  const layout = layoutStackup(layers, { width: 500, height: 600 });
  assert.ok(layout.labels[4].primary.endsWith("…"));
  assert.ok(stackupDiagramMarkup(layout).includes("stackup-layer-leader"));
});
