import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { SupplyPartGroup } from "@/types/supply";
import { ProjectRowSummary } from "./project-row-summary";

afterEach(cleanup);

const group = (stats: SupplyPartGroup["stats"]) => ({ project_id: "prj", project_name: "Board", count: 3, statuses: {}, tracked: true, stats }) as SupplyPartGroup;

describe("a project row's summary", () => {
  it("says how many boards can be built only when every line is checked", () => {
    const { rerender } = render(<ProjectRowSummary group={group({ boards: 4703, unchecked: 0 } as SupplyPartGroup["stats"])} />);
    expect(screen.getByText("can build 4,703")).toBeTruthy();
    rerender(<ProjectRowSummary group={group({ boards: 4703, unchecked: 1 } as SupplyPartGroup["stats"])} />);
    expect(screen.getByText("unconfirmed · 1 unchecked")).toBeTruthy();
    expect(screen.queryByText(/can build/)).toBeNull();
  });
});
