import { describe, expect, it } from "vitest";

import type { PanelComponent } from "./panel-api";
import {
  appendUniquePageItems,
  formatPanelLoadedCount,
  normalizePanelPageSize,
  PANEL_PAGE_SIZE,
  REMOTE_MAX_PAGE_SIZE,
} from "./panel-page";

function item(id: string): PanelComponent {
  return { id } as PanelComponent;
}

describe("normalizePanelPageSize", () => {
  it("keeps the default page size and clamps to the server maximum", () => {
    expect(normalizePanelPageSize()).toBe(PANEL_PAGE_SIZE);
    expect(normalizePanelPageSize(0)).toBe(1);
    expect(normalizePanelPageSize(500)).toBe(REMOTE_MAX_PAGE_SIZE);
  });
});

describe("formatPanelLoadedCount", () => {
  it("distinguishes a known total from an unknown remaining page", () => {
    expect(formatPanelLoadedCount(50, 501, true)).toBe("50 of 501 parts");
    expect(formatPanelLoadedCount(1, 1, false)).toBe("1 of 1 part");
    expect(formatPanelLoadedCount(50, null, true, "result")).toBe("50 results loaded");
    expect(formatPanelLoadedCount(12, null, false, "result")).toBe("12 results");
  });
});

describe("appendUniquePageItems", () => {
  it("appends unseen ids and ignores duplicates from a shifted page", () => {
    expect(appendUniquePageItems([item("a")], [item("a"), item("b")])).toEqual([
      item("a"),
      item("b"),
    ]);
  });
});
