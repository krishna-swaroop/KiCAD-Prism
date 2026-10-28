import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");
const html = readFileSync(resolve(root, "examples/extensions/quick-pi/index.html"), "utf8");
const model = readFileSync(resolve(root, "examples/extensions/quick-pi/model.js"), "utf8");
const app = readFileSync(resolve(root, "examples/extensions/quick-pi/app.js"), "utf8");

it("passes the independent numerical reference and invalid-input suite", () => {
    const output = execFileSync(process.execPath, ["--test", resolve(root, "examples/extensions/tests/quick-pi.test.mjs")], { encoding: "utf8" });
    expect(output).toMatch(/(?:fail 0|# fail 0)/);
});

beforeEach(() => {
    window.history.replaceState(null, "", "/?prism_project_id=board-1&prism_commit=abc123&prism_branch=main");
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    // Exercise the actual standalone scripts, not a duplicate UI implementation.
    window.eval(model);
    window.eval(app);
});
afterEach(() => { document.body.replaceChildren(); window.history.replaceState(null, "", "/"); });

it("calculates the reference path and reports manual inputs plus revision context", () => {
    expect(screen.getByText(/Project: board-1/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Within the declared");
    const report = JSON.parse((screen.getByLabelText("Inputs, project context and calculated results") as HTMLTextAreaElement).value);
    expect(report.input_source).toBe("manual");
    expect(report.context.prism_commit).toBe("abc123");
    expect(report.results.stages).toHaveLength(3);
    expect(report.results.model).toBe("prism.quick_pi.dc_series.v1");
});

it("invalidates stale results and report on edits and refuses blank dimensions", () => {
    fireEvent.input(screen.getByLabelText("Source voltage · V"), { target: { value: "1.8" } });
    expect(document.getElementById("results")).not.toBeVisible();
    expect((document.getElementById("report") as HTMLTextAreaElement).value).toBe("");
    fireEvent.input(screen.getAllByLabelText("Width · mm")[0], { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByRole("alert")).toHaveTextContent("width is required");
    expect(document.getElementById("results")).not.toBeVisible();
});

it("adds and removes via/resistor stages and never removes the last stage", () => {
    fireEvent.click(screen.getByRole("button", { name: "Add resistor" }));
    expect(screen.getByLabelText("Part resistance · mΩ")).toHaveValue(10);
    for (const button of screen.getAllByRole("button", { name: /^Remove / }).slice(0, 3)) fireEvent.click(button);
    expect(screen.getByRole("button", { name: /^Remove / })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add via group" }));
    expect(screen.getByLabelText("Finished hole diameter · mm")).toHaveValue(0.3);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByRole("status")).toHaveTextContent("Within the declared");
});

it("renders user labels as text, including in reports", () => {
    fireEvent.input(screen.getAllByLabelText("Stage label")[0], { target: { value: "<img src=x onerror=alert(1)>" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
});

it("calculates without native form submission, including Enter in an input", () => {
    const calculate = screen.getByRole("button", { name: "Calculate" });
    expect(calculate).toHaveAttribute("type", "button");
    const current = screen.getByLabelText("Load current · A");
    fireEvent.input(current, { target: { value: "20" } });
    fireEvent.click(calculate);
    expect(screen.getByRole("status")).toHaveTextContent("Exceeds the declared");
    fireEvent.input(current, { target: { value: "2" } });
    fireEvent.keyDown(current, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("Within the declared");
});
