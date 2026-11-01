// Classic script: module scripts require CORS in an opaque-origin sandbox.
// Independent analytical model; no WayriCAD implementation code is embedded.
"use strict";
(() => {
  const MODEL_VERSION = "prism.quick_pi.dc_series.v1";

  function number(value, name, { zero = false, integer = false } = {}) {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
      throw new Error(`${name} is required.`);
    }
    const result = Number(value);
    if (!Number.isFinite(result) || (zero ? result < 0 : result <= 0) || (integer && !Number.isInteger(result))) {
      throw new Error(`${name} must be a finite ${zero ? "non-negative" : "positive"}${integer ? " integer" : ""} number.`);
    }
    return result;
  }

  function solve(study) {
    const voltage = number(study.voltage, "Source voltage");
    const current = number(study.current, "Load current", { zero: true });
    const resistivity = number(study.resistivity, "Copper resistivity"); // nÎ©Â·m, at declared temperature
    const budget = number(study.budget, "Drop budget", { zero: true }); // percent of source voltage
    if (budget > 100) throw new Error("Drop budget must be between 0 and 100%.");
    if (!Array.isArray(study.stages) || study.stages.length < 1 || study.stages.length > 32) {
      throw new Error("Declare between 1 and 32 series stages.");
    }
    let remaining = voltage;
    const stages = study.stages.map((stage, index) => {
      const label = typeof stage.label === "string" ? stage.label.trim() : "";
      if (!label || label.length > 80) throw new Error(`Stage ${index + 1} needs a label of 1â€“80 characters.`);
      const count = number(stage.count, `${label}: parallel count`, { integer: true });
      if (count > 1024) throw new Error(`${label}: at most 1,024 identical parallel paths are supported.`);
      let area = null;
      let resistance;
      if (stage.kind === "trace") {
        const length = number(stage.length, `${label}: length`) * 1e-3;
        const width = number(stage.width, `${label}: width`) * 1e-3;
        const thickness = number(stage.thickness, `${label}: thickness`) * 1e-6;
        area = width * thickness;
        resistance = resistivity * 1e-9 * length / area / count;
      } else if (stage.kind === "via") {
        const length = number(stage.length, `${label}: barrel length`) * 1e-3;
        const diameter = number(stage.diameter, `${label}: finished hole diameter`) * 1e-3;
        const plating = number(stage.plating, `${label}: plating thickness`) * 1e-6;
        // Finished bore diameter d; barrel area Ï€[(d/2+p)Â²-(d/2)Â²] = Ï€p(d+p).
        area = Math.PI * plating * (diameter + plating);
        resistance = resistivity * 1e-9 * length / area / count;
      } else if (stage.kind === "resistor") {
        resistance = number(stage.milliohms, `${label}: resistance`, { zero: true }) * 1e-3 / count;
      } else {
        throw new Error(`${label}: unknown stage type.`);
      }
      const drop = current * resistance;
      const loss = current * drop;
      const density = area === null ? null : current / count / area / 1e6; // A/mmÂ², uniform average
      remaining -= drop;
      if ((stage.kind !== "resistor" && resistance <= 0)
          || ![resistance, drop, loss, remaining, ...(density === null ? [] : [density])].every(Number.isFinite)
          || (area !== null && (!Number.isFinite(area) || area <= 0))) {
        throw new Error(`${label}: dimensions exceed the numerical range.`);
      }
      return { label, kind: stage.kind, resistance, drop, loss, loadVoltage: remaining, density };
    });
    const resistance = stages.reduce((sum, stage) => sum + stage.resistance, 0);
    const drop = current * resistance;
    const loss = current * drop;
    const dropPercent = 100 * drop / voltage;
    if (![resistance, drop, loss, dropPercent].every(Number.isFinite)) throw new Error("Study exceeds the numerical range.");
    const loadVoltage = voltage - drop;
    const feasible = loadVoltage > 0;
    const withinBudget = feasible && dropPercent <= budget;
    return { model: MODEL_VERSION, resistance, drop, dropPercent, loss, loadVoltage, feasible, withinBudget, stages };
  }
  globalThis.QuickPi = Object.freeze({ MODEL_VERSION, solve });
})();
