import { describe, expect, it } from "vitest";
import type { EcadSchematicPageState } from "@/types/ecad-viewer";
import { buildComparisonSchematicPages } from "./schematic-comparison-navigator";

function page(
  projectPath: string,
  sheetPath: string,
  filename: string,
  parentProjectPath?: string,
): EcadSchematicPageState {
  return {
    projectPath,
    sheetPath,
    filename,
    parentProjectPath,
    depth: parentProjectPath ? 1 : 0,
    active: false,
  };
}

describe("buildComparisonSchematicPages", () => {
  it("matches stable instances and retains both revisions' exact paths", () => {
    const baseRoot = page("base.kicad_sch:/root", "/root", "base.kicad_sch");
    const baseChild = page(
      "base-child.kicad_sch:/root/shared",
      "/root/shared",
      "base-child.kicad_sch",
      baseRoot.projectPath,
    );
    const compareRoot = page(
      "compare.kicad_sch:/root",
      "/root",
      "compare.kicad_sch",
    );
    const compareChild = page(
      "compare-child.kicad_sch:/root/shared",
      "/root/shared",
      "compare-child.kicad_sch",
      compareRoot.projectPath,
    );
    const compareOnly = page(
      "new.kicad_sch:/root/new",
      "/root/new",
      "new.kicad_sch",
      compareRoot.projectPath,
    );

    const pages = buildComparisonSchematicPages(
      [baseRoot, baseChild],
      [compareRoot, compareChild, compareOnly],
    );
    const shared = pages.find(
      (candidate) => candidate.sheetPath === "/root/shared",
    );
    const added = pages.find(
      (candidate) => candidate.sheetPath === "/root/new",
    );

    expect(shared).toMatchObject({
      referenceSheetPath: baseChild.projectPath,
      comparisonSheetPath: compareChild.projectPath,
      statusLabel: undefined,
      parentNavigatorKey: "sheet:/root",
    });
    expect(added).toMatchObject({
      comparisonSheetPath: compareOnly.projectPath,
      statusLabel: "Compare only",
      parentNavigatorKey: "sheet:/root",
    });
  });

  it("labels pages that exist only in Base", () => {
    const baseOnly = page(
      "legacy.kicad_sch:/legacy",
      "/legacy",
      "legacy.kicad_sch",
    );
    expect(buildComparisonSchematicPages([baseOnly], [])[0]).toMatchObject({
      referenceSheetPath: baseOnly.projectPath,
      comparisonSheetPath: undefined,
      statusLabel: "Base only",
    });
  });
});
