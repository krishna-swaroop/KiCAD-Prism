"use strict";
(() => {
  const form = document.getElementById("study");
  const stageList = document.getElementById("stages");
  const results = document.getElementById("results");
  const error = document.getElementById("error");
  const report = document.getElementById("report");
  const query = new URLSearchParams(location.search);
  const context = Object.fromEntries(["prism_origin", "prism_project_id", "prism_commit", "prism_branch"].map((key) => [key, query.get(key)]));
  document.getElementById("context").textContent = context.prism_project_id
    ? `Project: ${context.prism_project_id} · Revision: ${context.prism_commit || "not supplied"} · Branch: ${context.prism_branch || "not supplied"}`
    : "Standalone study · Open from Prism to attach project and revision context.";
  let sequence = 0;
  const fields = {
    trace: [["length", "Length · mm", 10], ["width", "Width · mm", 1], ["thickness", "Copper thickness · µm", 35]],
    via: [["length", "Barrel length · mm", 1.6], ["diameter", "Finished hole diameter · mm", 0.3], ["plating", "Plating thickness · µm", 25]],
    resistor: [["milliohms", "Part resistance · mΩ", 10]],
  };
  const kindNames = { trace: "Trace", via: "Via group", resistor: "Resistor" };

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function invalidate() {
    results.hidden = true;
    error.hidden = true;
    report.value = "";
  }
  function updateButtons() {
    for (const button of document.querySelectorAll("[data-remove]")) button.disabled = stageList.children.length <= 1;
    for (const kind of Object.keys(fields)) document.getElementById(`add-${kind}`).disabled = stageList.children.length >= 32;
  }
  function addStage(kind, title) {
    if (stageList.children.length >= 32) return;
    invalidate();
    sequence += 1;
    const stage = node("div", undefined, "stage");
    stage.dataset.kind = kind;
    const heading = node("div", undefined, "stage-header");
    const name = title || `${kindNames[kind]} ${sequence}`;
    heading.append(node("h3", name));
    const remove = node("button", "Remove");
    remove.type = "button";
    remove.dataset.remove = "";
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.addEventListener("click", () => {
      if (stageList.children.length > 1) {
        stage.remove(); invalidate(); updateButtons();
        document.getElementById(`add-${kind}`).focus();
      }
    });
    heading.append(remove);
    const grid = node("div", undefined, "fields");
    for (const [key, labelText, value] of [["label", "Stage label", name], ...fields[kind], ["count", "Identical parallel paths", 1]]) {
      const label = node("label", labelText);
      const input = document.createElement("input");
      input.dataset.field = key;
      input.id = `stage-${sequence}-${key}`;
      input.value = value;
      input.required = true;
      input.type = key === "label" ? "text" : "number";
      if (key === "label") input.maxLength = 80;
      else { input.step = key === "count" ? "1" : "any"; input.min = key === "milliohms" ? "0" : "0.000001"; }
      label.append(input); grid.append(label);
    }
    stage.append(heading, grid); stageList.append(stage); updateButtons();
  }
  function studyInputs() {
    return {
      ...Object.fromEntries(["voltage", "current", "resistivity", "budget"].map((key) => [key, form.elements.namedItem(key).value])),
      stages: [...stageList.children].map((stage) => ({
        kind: stage.dataset.kind,
        ...Object.fromEntries([...stage.querySelectorAll("input")].map((input) => [input.dataset.field, input.value])),
      })),
    };
  }
  const formatted = (value) => Number(value).toLocaleString("en", { maximumSignificantDigits: 7 });
  function calculate() {
    invalidate();
    try {
      const inputs = studyInputs();
      const result = globalThis.QuickPi.solve(inputs);
      document.getElementById("status").textContent = !result.feasible
        ? "Infeasible: the declared current leaves no positive load voltage."
        : result.withinBudget ? "Within the declared voltage-drop budget." : "Exceeds the declared voltage-drop budget.";
      const summary = document.getElementById("summary"); summary.replaceChildren();
      for (const [label, value] of [
        ["Path resistance", `${formatted(result.resistance * 1e3)} mΩ`],
        ["Voltage drop", `${formatted(result.drop * 1e3)} mV`],
        ["Drop / source", `${formatted(result.dropPercent)} %`],
        ["Load voltage", result.feasible ? `${formatted(result.loadVoltage)} V` : "Infeasible"],
        ["Path loss", `${formatted(result.loss * 1e3)} mW`],
      ]) {
        const group = node("div"); group.append(node("dt", label), node("dd", value)); summary.append(group);
      }
      const rows = document.getElementById("stage-results"); rows.replaceChildren();
      for (const stage of result.stages) {
        const row = node("tr");
        for (const value of [stage.label, formatted(stage.resistance * 1e3), formatted(stage.drop * 1e3), formatted(stage.loss * 1e3), stage.density === null ? "—" : formatted(stage.density)]) row.append(node("td", value));
        rows.append(row);
      }
      report.value = JSON.stringify({
        schema_version: 1, model: result.model, context, input_source: "manual", inputs,
        units: { voltage: "V", current: "A", resistivity: "nΩ·m", budget: "%", length: "mm", width: "mm", diameter: "mm", thickness: "µm", plating: "µm", milliohms: "mΩ", result_resistance: "Ω", result_drop: "V", result_loss: "W", result_density: "A/mm²" },
        assumptions: ["Fixed user-entered resistivity; no temperature feedback", "Constant current; ideal voltage source", "Equal sharing in identical parallel paths", "Only declared feed/return resistance included", "Uniform average current density; no thermal or current-capacity qualification"],
        results: result,
      }, null, 2);
      results.hidden = false;
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : "Unable to calculate this path.";
      error.hidden = false;
    }
  }
  function reference() {
    for (const [key, value] of Object.entries({ voltage: "3.3", current: "2", resistivity: "17.24", budget: "5" })) form.elements.namedItem(key).value = value;
    stageList.replaceChildren(); sequence = 0;
    addStage("trace", "Supply strip"); addStage("via", "Via barrel"); addStage("trace", "Return strip");
    calculate();
  }
  form.addEventListener("input", invalidate);
  // Native form submission is blocked by Prism's allow-scripts-only sandbox.
  document.getElementById("calculate").addEventListener("click", calculate);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault(); calculate();
    }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); calculate(); });
  for (const kind of Object.keys(fields)) document.getElementById(`add-${kind}`).addEventListener("click", () => addStage(kind));
  document.getElementById("example").addEventListener("click", reference);
  reference();
})();
