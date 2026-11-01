import { describe, expect, it } from "vitest";

import { clickColumn, columnOf, sortFromParam } from "./parts-sort";

describe("parts sort", () => {
  it("knows the sorts an address can ask for", () => {
    expect(sortFromParam("runout")).toBe("runout");
    expect(sortFromParam("price:asc")).toBe("price:asc");
    expect(sortFromParam("price:sideways")).toBe("");
    expect(sortFromParam("colour:asc")).toBe("");
    expect(sortFromParam(null)).toBe("");
  });

  it("goes most first, then the other way, then lets go; a part number starts at A", () => {
    expect(clickColumn("", "stock")).toBe("stock:desc");
    expect(clickColumn("stock:desc", "stock")).toBe("stock:asc");
    expect(clickColumn("stock:asc", "stock")).toBe("");
    expect(clickColumn("", "part")).toBe("part:asc");
    expect(clickColumn("part:asc", "part")).toBe("part:desc");
    expect(clickColumn("runout", "price")).toBe("price:desc");
  });

  it("says which column a sort is on", () => {
    expect(columnOf("stock:asc")).toEqual({ column: "stock", direction: "asc" });
    expect(columnOf("runout")).toBeNull();
  });
});
