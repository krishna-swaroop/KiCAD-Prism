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
    expect(canManageProjects("qa")).toBe(false);
    expect(canManageProjects("designer")).toBe(true);
    expect(canManageProjects("admin")).toBe(true);
  });

  it("matches the catalog read, write, and QA role sets", () => {
    expect(canOpenLibraryManager("viewer")).toBe(false);
    expect(canOpenLibraryManager("designer")).toBe(true);
    expect(canOpenLibraryManager("qa")).toBe(true);
    expect(canOpenLibraryManager("admin")).toBe(true);

    expect(canWriteCatalog("designer")).toBe(true);
    expect(canWriteCatalog("qa")).toBe(false);
    expect(canWriteCatalog("admin")).toBe(true);

    expect(canReviewCatalogQa("designer")).toBe(false);
    expect(canReviewCatalogQa("qa")).toBe(true);
    expect(canReviewCatalogQa("admin")).toBe(true);
  });

  it("matches the project-release sign-off matrix", () => {
    expect(roleHasAuthority("viewer", "inspect_release_studio")).toBe(true);
    expect(roleHasAuthority("viewer", "start_release_builds")).toBe(false);
    expect(roleHasAuthority("designer", "start_release_builds")).toBe(true);
    expect(roleHasAuthority("qa", "start_release_builds")).toBe(false);
    expect(roleHasAuthority("qa", "approve_project_releases")).toBe(true);
    expect(roleHasAuthority("qa", "publish_project_releases")).toBe(true);
    expect(roleHasAuthority("designer", "publish_project_releases")).toBe(true);
  });

  it("allows only admins to administer the workspace", () => {
    expect(roleHasAuthority("designer", "administer_workspace")).toBe(false);
    expect(roleHasAuthority("admin", "administer_workspace")).toBe(true);
  });
});
