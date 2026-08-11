import { describe, expect, it } from "vitest";

import { importReviewTitle } from "./import-dialog";

describe("importReviewTitle", () => {
  it("reports an empty analysis instead of claiming multiple projects", () => {
    expect(importReviewTitle({ import_type: "type2", projects: [] })).toBe(
      "No Projects Detected",
    );
  });

  it("preserves the single and multiple project titles", () => {
    const project = {
      name: "Power",
      relative_path: ".",
      has_schematic: true,
      has_pcb: true,
    };
    expect(importReviewTitle({ import_type: "type1", projects: [project] })).toBe(
      "Single Project Detected",
    );
    expect(importReviewTitle({ import_type: "type2", projects: [project] })).toBe(
      "Multiple Projects Detected",
    );
  });
});
