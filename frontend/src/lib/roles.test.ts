import { describe, expect, it } from "vitest";

import { ROLE_MATRIX } from "./role-matrix.generated";
import {
  ROLE_AUTHORITIES,
  canAdministerCatalog,
  canAdministerWorkspace,
  canCommentOnProjects,
  canManageProjects,
  canOpenLibraryManager,
  canEditSupply,
  canOpenSupply,
  canReviewCatalogQa,
  canReviewSupply,
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

  it("matches the supply read and review role sets enforced by the backend", () => {
    expect(canOpenSupply("viewer")).toBe(false); // supply reads follow catalog reads, which exclude viewers
    expect(canOpenSupply("designer")).toBe(true);
    expect(canOpenSupply("qa")).toBe(true);
    expect(canOpenSupply("admin")).toBe(true);
    expect(canOpenSupply(null)).toBe(false);

    expect(canEditSupply("designer")).toBe(true);
    expect(canEditSupply("qa")).toBe(false);
    expect(canEditSupply("admin")).toBe(true);
    expect(canEditSupply("viewer")).toBe(false);

    expect(canReviewSupply("designer")).toBe(false);
    expect(canReviewSupply("qa")).toBe(true);
    expect(canReviewSupply("admin")).toBe(true);
  });

  it("matches the catalog read, write, and QA role sets", () => {
    expect(canOpenLibraryManager("viewer")).toBe(true); // D-P2-24: viewers browse the catalog
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

  it("lets every role comment, as the server's comment policy does", () => {
    for (const role of ["viewer", "qa", "designer", "admin"] as const) {
      expect(canCommentOnProjects(role)).toBe(true);
    }
  });

  it("keeps catalog and workspace administration with admins", () => {
    expect(canAdministerCatalog("designer")).toBe(false);
    expect(canAdministerCatalog("admin")).toBe(true);
    expect(canAdministerWorkspace("qa")).toBe(false);
    expect(canAdministerWorkspace("admin")).toBe(true);
  });

  it("describes exactly the authorities the generated matrix carries", () => {
    expect(ROLE_AUTHORITIES.map((authority) => authority.key).sort()).toEqual(
      Object.keys(ROLE_MATRIX.authorities).sort(),
    );
    for (const authority of ROLE_AUTHORITIES) {
      expect(authority.roles).toEqual(ROLE_MATRIX.authorities[authority.key]);
    }
  });
});
