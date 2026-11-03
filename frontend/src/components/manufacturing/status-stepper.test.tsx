import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusStepper, nextRunStatus } from "./status-stepper";

describe("nextRunStatus", () => {
    it("walks the lifecycle and stops at closed", () => {
        expect(nextRunStatus("draft")).toBe("ordered");
        expect(nextRunStatus("ordered")).toBe("in_production");
        expect(nextRunStatus("in_production")).toBe("received");
        expect(nextRunStatus("received")).toBe("closed");
        expect(nextRunStatus("closed")).toBeNull();
        // Cancelled is not a stage, so nothing follows it.
        expect(nextRunStatus("cancelled")).toBeNull();
    });
});

describe("StatusStepper", () => {
    afterEach(cleanup);

    it("lists all five stages and marks the current one", () => {
        render(<StatusStepper status="in_production" />);
        const stages = screen.getAllByRole("listitem");
        expect(stages).toHaveLength(5);
        expect(stages.map((s) => s.getAttribute("aria-current"))).toEqual([null, null, "step", null, null]);
        expect(screen.getByText("In production").textContent).toContain("(current)");
    });

    it("never lists cancelled as a stage", () => {
        render(<StatusStepper status="ordered" />);
        expect(screen.queryByText("Cancelled")).toBeNull();
    });
});
