import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DefectSummary } from "./defect-summary";
import { YieldBar } from "./yield-bar";
import { makeRun } from "./test-fixtures";

describe("DefectSummary", () => {
    afterEach(cleanup);

    it("shows a dash when nothing was logged", () => {
        render(<DefectSummary run={makeRun({ defect_severity_counts: {}, open_defect_count: 0 })} />);
        expect(screen.getByText("—")).toBeTruthy();
    });

    it("splits the logged defects by severity, worst first, and says how many are open", () => {
        render(
            <DefectSummary
                run={makeRun({ defect_severity_counts: { minor: 3, critical: 1, major: 2 }, open_defect_count: 2 })}
            />,
        );
        const pills = screen.getAllByTitle(/defect\(s\) logged/).map((el) => el.textContent);
        expect(pills).toEqual(["1 critical", "2 major", "3 minor"]);
        expect(screen.getByText("2 open")).toBeTruthy();
    });

    it("says when every defect is closed", () => {
        render(<DefectSummary run={makeRun({ defect_severity_counts: { major: 1 }, open_defect_count: 0 })} />);
        expect(screen.getByText("all closed")).toBeTruthy();
    });

    it("still reports open defects when the severity split is missing", () => {
        render(<DefectSummary run={makeRun({ defect_severity_counts: undefined, open_defect_count: 4 })} />);
        expect(screen.getByText("4 open")).toBeTruthy();
        expect(screen.queryByTitle(/defect\(s\) logged/)).toBeNull();
    });
});

describe("YieldBar", () => {
    afterEach(cleanup);

    it("prints the counts by default and the percentage on request", () => {
        const { unmount } = render(<YieldBar good={48} ordered={50} />);
        expect(screen.getByText("48/50")).toBeTruthy();
        unmount();
        render(<YieldBar good={48} ordered={50} format="percent" />);
        expect(screen.getByText("96%")).toBeTruthy();
    });

    it("shows a dash when nothing was ordered", () => {
        render(<YieldBar good={0} ordered={0} format="percent" />);
        expect(screen.getByText("—")).toBeTruthy();
    });
});
