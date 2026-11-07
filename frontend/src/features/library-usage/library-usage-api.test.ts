import { describe, expect, it } from "vitest";

import { referencesLabel, sortPlacements, versionLabel, type LibraryPlacement } from "./library-usage-api";

function placement(overrides: Partial<LibraryPlacement>): LibraryPlacement {
  return {
    componentId: "c1",
    revisionId: "r1",
    basis: "stamp",
    status: "current",
    references: ["R1"],
    recordedVersion: 1,
    latestRevisionId: "r1",
    latestVersion: 1,
    mixedRevisions: false,
    name: "Resistor",
    manufacturer: "",
    mpn: "",
    ...overrides,
  };
}

describe("library usage helpers", () => {
  it("puts updates, retired and unreleased parts first, then sorts by name", () => {
    const items = [
      placement({ name: "B", status: "current" }),
      placement({ name: "C", status: "retired" }),
      placement({ name: "A", status: "update_available" }),
      placement({ name: "D", status: "unreleased" }),
      placement({ name: "A", status: "current" }),
    ];
    expect(sortPlacements(items).map((item) => `${item.name}:${item.status}`)).toEqual([
      "A:update_available",
      "C:retired",
      "D:unreleased",
      "A:current",
      "B:current",
    ]);
  });

  it("labels the placed and newest released versions", () => {
    expect(versionLabel(placement({ status: "update_available", recordedVersion: 2, latestVersion: 4 }))).toBe("v2 → v4");
    expect(versionLabel(placement({ recordedVersion: 3 }))).toBe("v3");
    expect(versionLabel(placement({ recordedVersion: null, status: "unknown_revision" }))).toBe("?");
  });

  it("shortens long reference lists", () => {
    expect(referencesLabel(["R1", "R2"])).toBe("R1, R2");
    expect(referencesLabel(["R1", "R2", "R3", "R4", "R5"])).toBe("R1, R2, R3 +2");
  });
});
