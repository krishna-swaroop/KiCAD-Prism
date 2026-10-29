import { test } from "node:test";
import assert from "node:assert/strict";
import "../quick-pi/model.js";

const { solve } = globalThis.QuickPi;
const trace = () => ({ kind: "trace", label: "Strip", length: 10, width: 1, thickness: 35, count: 1 });
const via = () => ({ kind: "via", label: "Via", length: 1.6, diameter: 0.3, plating: 25, count: 1 });
const study = (stages = [trace()]) => ({ voltage: 3.3, current: 2, resistivity: 17.24, budget: 5, stages });
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 1e-12, `${actual} != ${expected}`);
}

test("10×1 mm, 35 µm strip: SI units, drop, Joule loss and average J", () => {
  const result = solve(study());
  const resistance = 1.724e-8 * 0.01 / (0.001 * 35e-6);
  close(result.resistance, resistance);
  close(result.drop, 2 * resistance);
  close(result.loss, 4 * resistance);
  close(result.stages[0].density, 2 / 0.035);
  close(result.loadVoltage, 3.3 - 2 * resistance);
  assert.equal(result.withinBudget, true);
});

test("finished-bore annular barrel and two series strips match analytical fixture", () => {
  // Independent annulus area, not the model's expanded expression.
  const area = Math.PI * ((0.3e-3 / 2 + 25e-6) ** 2 - (0.3e-3 / 2) ** 2);
  const barrel = 1.724e-8 * 1.6e-3 / area;
  const strip = 1.724e-8 * 0.01 / (1e-3 * 35e-6);
  const result = solve(study([trace(), via(), trace()]));
  close(result.resistance, 2 * strip + barrel);
  close(result.drop, 2 * (2 * strip + barrel));
  close(result.loss, result.stages.reduce((sum, row) => sum + row.loss, 0));
  close(result.loss, 3.3 * 2 - result.loadVoltage * 2);
});

test("identical parallel vias reduce R and per-barrel density, not total load current", () => {
  const one = solve(study([via()]));
  const four = solve(study([{ ...via(), count: 4 }]));
  close(four.resistance, one.resistance / 4);
  close(four.stages[0].density, one.stages[0].density / 4);
  close(four.loss, one.loss / 4);
});

test("series lumped resistor retains supply/return contributions and budget failure", () => {
  const input = study([{ kind: "resistor", label: "Feed", milliohms: 100, count: 2 }, { kind: "resistor", label: "Return", milliohms: 50, count: 1 }]);
  const result = solve(input);
  close(result.resistance, 0.1);
  close(result.drop, 0.2);
  close(result.loss, 0.4);
  assert.equal(result.withinBudget, false);
  assert.equal(result.stages[0].density, null);
  assert.equal(input.stages[0].milliohms, 100);
});

test("zero load and explicit ideal resistor are supported", () => {
  const idle = solve({ ...study(), current: 0, budget: 0 });
  assert.equal(idle.drop, 0); assert.equal(idle.loss, 0); assert.equal(idle.loadVoltage, 3.3);
  assert.equal(idle.withinBudget, true);
  const ideal = solve(study([{ kind: "resistor", label: "Ideal", milliohms: 0, count: 1 }]));
  assert.equal(ideal.resistance, 0);
});

test("zero or negative load voltage is explicitly infeasible", () => {
  for (const milliohms of [1650, 2000]) {
    const result = solve(study([{ kind: "resistor", label: "High R", milliohms, count: 1 }]));
    assert.equal(result.feasible, false); assert.equal(result.withinBudget, false);
  }
});

test("resistivity scales all copper R and losses linearly", () => {
  const base = solve(study([trace(), via()]));
  const hot = solve({ ...study([trace(), via()]), resistivity: 34.48 });
  close(hot.resistance, 2 * base.resistance); close(hot.loss, 2 * base.loss);
});

test("rejects incomplete, non-finite, negative, fractional and excessive inputs", () => {
  const bad = [
    { ...study(), voltage: "" }, { ...study(), voltage: 0 }, { ...study(), current: -1 },
    { ...study(), current: NaN }, { ...study(), current: Infinity }, { ...study(), current: true },
    { ...study(), budget: 101 }, { ...study(), resistivity: 0 }, { ...study(), stages: [] },
    { ...study(), stages: Array.from({ length: 33 }, trace) },
    study([{ ...trace(), count: 1.5 }]), study([{ ...trace(), count: 0 }]), study([{ ...trace(), count: 1025 }]),
    study([{ ...trace(), width: -1 }]), study([{ ...trace(), thickness: "" }]),
    study([{ ...via(), diameter: 0 }]), study([{ ...via(), plating: 0 }]),
    study([{ ...trace(), label: " " }]), study([{ ...trace(), kind: "unknown" }]),
    study([{ ...trace(), width: 1e308, thickness: 1e308 }]),
    { ...study(), current: 1e308 },
    { ...study(), resistivity: 1e-320 },
  ];
  for (const input of bad) assert.throws(() => solve(input), Error);
});
