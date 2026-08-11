import { describe, expect, it } from "vitest";

import {
  canManageProjects,
  canOpenLibraryManager,
  canReviewCatalogQa,
  canWriteCatalog,
  roleHasAuthority,
} from "./roles";

describe("role authorities", () => {
  it("matches the project mutation roles enforced by the backend", () => {
    expect(canManageProjects("viewer")).toBe(false);
    expect(canManageProjects("component_designer")).toBe(false);
    expect(canManageProjects("component_qa")).toBe(false);
    expect(canManageProjects("designer")).toBe(true);
    expect(canManageProjects("admin")).toBe(true);
  });

  it("matches the catalog read, write, and QA role sets", () => {
    expect(canOpenLibraryManager("viewer")).toBe(false);
    expect(canOpenLibraryManager("designer")).toBe(true);
    expect(canOpenLibraryManager("component_designer")).toBe(true);
    expect(canOpenLibraryManager("component_qa")).toBe(true);
    expect(canOpenLibraryManager("admin")).toBe(true);

    expect(canWriteCatalog("designer")).toBe(false);
    expect(canWriteCatalog("component_designer")).toBe(true);
    expect(canWriteCatalog("component_qa")).toBe(false);
    expect(canWriteCatalog("admin")).toBe(true);

    expect(canReviewCatalogQa("component_designer")).toBe(false);
    expect(canReviewCatalogQa("component_qa")).toBe(true);
    expect(canReviewCatalogQa("admin")).toBe(true);
  });

  it("allows only admins to administer the workspace", () => {
    expect(roleHasAuthority("designer", "administer_workspace")).toBe(false);
    expect(roleHasAuthority("admin", "administer_workspace")).toBe(true);
  });
});
