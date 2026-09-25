import { describe, expect, it } from "vitest";

import {
  importReviewTitle,
  isProjectAlreadyImported,
  projectKeyOf,
  projectsPerDirectory,
  selectableProjectKeys,
  type DiscoveredProject,
} from "./import-dialog";

const project = (
  overrides: Partial<DiscoveredProject> & Pick<DiscoveredProject, "name">,
): DiscoveredProject => ({
  relative_path: ".",
  has_schematic: true,
  has_pcb: true,
  ...overrides,
});

describe("importReviewTitle", () => {
  it("reports an empty analysis instead of claiming multiple projects", () => {
    expect(importReviewTitle({ import_type: "type2", projects: [] })).toBe(
      "No Projects Detected",
    );
  });

  it("preserves the single and multiple project titles", () => {
    const power = project({ name: "Power" });
    expect(importReviewTitle({ import_type: "type1", projects: [power] })).toBe(
      "Single Project Detected",
    );
    expect(importReviewTitle({ import_type: "type2", projects: [power] })).toBe(
      "Multiple Projects Detected",
    );
  });
});

describe("selecting projects that share a directory", () => {
  // Two KiCad projects in a repository root both report "." as their location.
  // Selection used to be keyed on that, so ticking one ticked both and only one
  // of the two could ever be imported.
  const base = project({
    name: "base",
    project_key: ".::base.kicad_pro",
    project_file: "base.kicad_pro",
  });
  const top = project({
    name: "top",
    project_key: ".::top.kicad_pro",
    project_file: "top.kicad_pro",
  });

  it("gives each project its own key", () => {
    expect(projectKeyOf(base)).not.toBe(projectKeyOf(top));
  });

  it("offers both projects for import", () => {
    expect(selectableProjectKeys([base, top], new Set())).toEqual([
      ".::base.kicad_pro",
      ".::top.kicad_pro",
    ]);
  });

  it("marks only the imported one as done", () => {
    const imported = new Set([".::base.kicad_pro"]);
    const perDirectory = projectsPerDirectory([base, top]);
    expect(isProjectAlreadyImported(base, imported, perDirectory)).toBe(true);
    expect(isProjectAlreadyImported(top, imported, perDirectory)).toBe(false);
    expect(selectableProjectKeys([base, top], imported)).toEqual([
      ".::top.kicad_pro",
    ]);
  });

  it("keeps a selection of one project to one project", () => {
    const selected = new Set<string>();
    selected.add(projectKeyOf(top));
    expect(selected.has(projectKeyOf(top))).toBe(true);
    expect(selected.has(projectKeyOf(base))).toBe(false);
    expect(selected.size).toBe(1);
  });
});

describe("projects registered before Prism recorded project files", () => {
  it("still counts as imported when it is alone in its directory", () => {
    const only = project({ name: "board", relative_path: "hardware/board" });
    const perDirectory = projectsPerDirectory([only]);
    expect(
      isProjectAlreadyImported(only, new Set(["hardware/board"]), perDirectory),
    ).toBe(true);
  });

  it("does not mark a sibling that shares its directory as imported", () => {
    const base = project({ name: "base", project_key: ".::base.kicad_pro" });
    const top = project({ name: "top", project_key: ".::top.kicad_pro" });
    const perDirectory = projectsPerDirectory([base, top]);
    expect(isProjectAlreadyImported(top, new Set(["."]), perDirectory)).toBe(false);
  });

  it("falls back to the directory when the backend sends no key", () => {
    const legacy = project({ name: "board", relative_path: "hardware/board" });
    expect(projectKeyOf(legacy)).toBe("hardware/board");
  });
});
