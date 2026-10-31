import { describe, expect, it } from "vitest";

import { alertTitle } from "./alert-text";
import { alertFixture } from "./supply-test-fixtures";

describe("alert titles for notices", () => {
  it("names a new change notice with what it says, and counts the others", () => {
    const one = alertFixture({ kind: "pcn", detail: { new: 1, title: "PCN Assembly/Origin", description: "Assembly Site 10/Mar/2026" } });
    expect(alertTitle(one)).toBe("New change notice: PCN Assembly/Origin, Assembly Site 10/Mar/2026");
    const two = alertFixture({ kind: "pcn", detail: { new: 2, title: "PCN Packaging" } });
    expect(alertTitle(two)).toBe("New change notice: PCN Packaging (2 new notices)");
  });

  it("keeps saying when an ending notice's last time buy is", () => {
    const ending = alertFixture({ kind: "pcn", detail: { kind_label: "End of life", title: "PCN-1234", last_time_buy: "2026-09-01" } });
    expect(alertTitle(ending)).toBe("End of life: PCN-1234, last time buy 2026-09-01");
  });
});
