import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("./supply-api", () => ({ buildSupplyUsageIndexes: vi.fn() }));

import { indexBuildSummary } from "./index-build-summary";
import { ReadProjectBomsButton } from "./read-project-boms-button";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("indexBuildSummary", () => {
  it("says what was queued, and what is left", () => {
    expect(indexBuildSummary({ projects: 4, missing: 0, queued: 0 })).toBe("Every project's BOM has been read already.");
    expect(indexBuildSummary({ projects: 4, missing: 1, queued: 1 })).toBe("Reading 1 project in the background. Come back in a few minutes.");
    expect(indexBuildSummary({ projects: 90, missing: 40, queued: 25 })).toBe(
      "Reading 25 projects in the background. Come back in a few minutes. 15 more are waiting: click again after these finish.",
    );
  });
});

describe("ReadProjectBomsButton", () => {
  it("queues the BOMs and reports it", async () => {
    mocked.buildSupplyUsageIndexes.mockResolvedValue({ projects: 3, missing: 2, queued: 2 });
    render(<ReadProjectBomsButton />);
    fireEvent.click(screen.getByRole("button", { name: /Read project BOMs/ }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Reading 2 projects in the background. Come back in a few minutes."));
  });

  it("shows a failure", async () => {
    mocked.buildSupplyUsageIndexes.mockRejectedValue(new Error("Could not queue the project BOMs"));
    render(<ReadProjectBomsButton />);
    fireEvent.click(screen.getByRole("button", { name: /Read project BOMs/ }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Could not queue the project BOMs"));
  });
});
