import { describe, expect, it } from "vitest";

import { componentWorkspacePath } from "./command-palette";

/**
 * The component workspace has no route of its own — it is the workspace shell
 * reading `component` out of the query string. That makes the deep link a
 * contract between the palette and the shell, and worth pinning: a missing
 * `section` lands the user on the project gallery instead, with no error.
 */
describe("componentWorkspacePath", () => {
  it("names every parameter the workspace shell needs", () => {
    const params = new URLSearchParams(componentWorkspacePath("abc-123").slice(2));
    expect(params.get("section")).toBe("library-manager");
    expect(params.get("libraryView")).toBe("catalog");
    expect(params.get("component")).toBe("abc-123");
    expect(params.get("componentTab")).toBe("overview");
  });

  it("targets the workspace root so the link works from a project page", () => {
    expect(componentWorkspacePath("abc-123").startsWith("/?")).toBe(true);
  });

  it("escapes ids that would otherwise break the query string", () => {
    const path = componentWorkspacePath("a&b=c d");
    expect(path).not.toContain("a&b=c d");
    expect(new URLSearchParams(path.slice(2)).get("component")).toBe("a&b=c d");
  });
});
