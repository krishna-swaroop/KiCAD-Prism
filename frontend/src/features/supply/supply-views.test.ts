import { describe, expect, it } from "vitest";

import { resolvePlace } from "./supply-views";

describe("where a Supply address leads", () => {
  it("opens the four tabs as asked", () => {
    for (const tab of ["dashboard", "tracking", "projects", "insights"] as const) expect(resolvePlace(tab, null).tab).toBe(tab);
  });

  it("sends the old addresses to the tab that took them over", () => {
    expect(resolvePlace("overview", null).tab).toBe("dashboard");
    expect(resolvePlace("inbox", null).tab).toBe("dashboard");
    expect(resolvePlace("market", null)).toEqual({ tab: "insights", tool: null });
    expect(resolvePlace("planning", null)).toEqual({ tab: "insights", tool: null });
    expect(resolvePlace("bom-file", null)).toEqual({ tab: "tracking", tool: "bom-file" });
    expect(resolvePlace("parts", null).tab).toBe("tracking");
    expect(resolvePlace("part", null).tab).toBe("tracking");
  });

  it("falls back to the dashboard, and keeps the tool to Parts", () => {
    expect(resolvePlace(null, null).tab).toBe("dashboard");
    expect(resolvePlace("nonsense", null).tab).toBe("dashboard");
    expect(resolvePlace("tracking", "bom-file").tool).toBe("bom-file");
    expect(resolvePlace("insights", "bom-file").tool).toBeNull();
  });
});
