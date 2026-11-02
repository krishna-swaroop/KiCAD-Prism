import { CATALOG_WORKFLOW_POLICY } from "@/lib/catalog-workflow-policy.generated";
import { ROLE_MATRIX } from "@/lib/role-matrix.generated";
import type { CatalogComponent, WorkflowStage } from "@/types/catalog";
import type { UserRole } from "@/types/auth";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  designer: "Designer",
  viewer: "Viewer",
  qa: "QA",
};

export const ROLE_OPTIONS: UserRole[] = ["viewer", "designer", "qa", "admin"];

export type RoleAuthorityKey = keyof typeof ROLE_MATRIX.authorities;

export interface RoleAuthority {
  key: RoleAuthorityKey;
  category: "Projects" | "Project releases" | "Component library" | "Administration";
  label: string;
  description: string;
  roles: readonly UserRole[];
}

const AUTHORITY_ROLES: Readonly<Record<RoleAuthorityKey, readonly UserRole[]>> = ROLE_MATRIX.authorities;

/**
 * Which roles hold each authority comes from the server's caller policy
 * (backend/app/core/policy.py) through the generated ROLE_MATRIX; only the
 * wording lives here. The server still authorizes every request.
 */
export const ROLE_AUTHORITIES: readonly RoleAuthority[] = [
  {
    key: "view_projects",
    category: "Projects",
    label: "View available projects",
    description: "Browse projects, schematics, boards, and existing comments.",
    roles: AUTHORITY_ROLES.view_projects,
  },
  {
    key: "manage_projects",
    category: "Projects",
    label: "Manage projects",
    description: "Import, sync, configure, move, and delete projects.",
    roles: AUTHORITY_ROLES.manage_projects,
  },
  {
    key: "comment_on_projects",
    category: "Projects",
    label: "Write project comments",
    description: "Create and reply to comments, and edit or delete your own. Resolving and publishing need Designer.",
    roles: AUTHORITY_ROLES.comment_on_projects,
  },
  {
    key: "inspect_release_studio",
    category: "Project releases",
    label: "Inspect Release Studio",
    description: "Open a project's Source-to-Publish rail, inspect outputs, and read build history.",
    roles: AUTHORITY_ROLES.inspect_release_studio,
  },
  {
    key: "start_release_builds",
    category: "Project releases",
    label: "Start a project release build",
    description: "Choose Source, Identity, and Manufacturing, then enqueue the KiCad pipeline.",
    roles: AUTHORITY_ROLES.start_release_builds,
  },
  {
    key: "approve_project_releases",
    category: "Project releases",
    label: "Approve a project release",
    description: "Cast the Designer or QA sign-off on a succeeded build. QA cannot skip the Designer's slot; admin may fill either with a written override.",
    roles: AUTHORITY_ROLES.approve_project_releases,
  },
  {
    key: "publish_project_releases",
    category: "Project releases",
    label: "Publish to GitHub or GitLab",
    description: "Create the forge Release after both sign-offs, clear DRC/ERC errors, and ready vendor packs.",
    roles: AUTHORITY_ROLES.publish_project_releases,
  },
  {
    key: "view_catalog",
    category: "Component library",
    label: "View component library",
    description: "Browse components, revisions, validation, and release queues.",
    roles: AUTHORITY_ROLES.view_catalog,
  },
  {
    key: "edit_catalog",
    category: "Component library",
    label: "Edit component library",
    description: "Create components, edit metadata, and attach library assets.",
    roles: AUTHORITY_ROLES.edit_catalog,
  },
  {
    key: "review_catalog_qa",
    category: "Component library",
    label: "Review component QA",
    description: "Approve or return components that are in QA review.",
    roles: AUTHORITY_ROLES.review_catalog_qa,
  },
  {
    key: "administer_catalog",
    category: "Component library",
    label: "Administer component library",
    description: "Manage metadata fields, run artifact maintenance, and override two-person approval.",
    roles: AUTHORITY_ROLES.administer_catalog,
  },
  {
    key: "view_supply",
    category: "Component library",
    label: "View supply data",
    description: "See distributor stock, prices, connectors, and the matching review queue.",
    roles: AUTHORITY_ROLES.view_supply,
  },
  {
    key: "edit_supply",
    category: "Component library",
    label: "Watch parts",
    description: "Watch parts for stock, and change their thresholds and polling priority.",
    roles: AUTHORITY_ROLES.edit_supply,
  },
  {
    key: "review_supply",
    category: "Component library",
    label: "Decide supply matches",
    description: "Map manufacturer spellings and confirm or reject distributor listings.",
    roles: AUTHORITY_ROLES.review_supply,
  },
  {
    key: "administer_workspace",
    category: "Administration",
    label: "Administer workspace",
    description: "Manage users, sessions, Git access, and workspace settings.",
    roles: AUTHORITY_ROLES.administer_workspace,
  },
];

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function roleHasAuthority(role: UserRole | null | undefined, authority: RoleAuthorityKey): boolean {
  if (!role) return false;
  return AUTHORITY_ROLES[authority].includes(role);
}

export function canManageProjects(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "manage_projects");
}

export function canCommentOnProjects(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "comment_on_projects");
}

export function canAdministerWorkspace(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "administer_workspace");
}

export function canAdministerCatalog(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "administer_catalog");
}

export function canOpenLibraryManager(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "view_catalog");
}

export function canOpenSupply(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "view_supply");
}

export function canEditSupply(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "edit_supply");
}

/** Following parts, components and projects: anyone who opens Supply (the server's `supply_follow`). */
export function canFollowSupply(role?: UserRole | null): boolean {
  return canOpenSupply(role);
}

export function canReviewSupply(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "review_supply");
}

export function canWriteCatalog(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "edit_catalog");
}

export function canReviewCatalogQa(role?: UserRole | null): boolean {
  return roleHasAuthority(role, "review_catalog_qa");
}

const WORKFLOW_STAGES: readonly string[] = CATALOG_WORKFLOW_POLICY.stages;
const LEGACY_WORKFLOW_ALIASES: Readonly<Record<string, string>> = CATALOG_WORKFLOW_POLICY.legacyAliases;

/**
 * The current stage name a component reports, with the server's legacy aliases
 * applied so older stored values (`draft`, `in_review`, ...) offer the same
 * transitions the server would accept for them.
 */
export function normalizeWorkflowStage(stage: string | null | undefined): WorkflowStage | null {
  const trimmed = (stage ?? "").trim().toLowerCase();
  const normalized = LEGACY_WORKFLOW_ALIASES[trimmed] ?? trimmed;
  return WORKFLOW_STAGES.includes(normalized) ? (normalized as WorkflowStage) : null;
}

export function workflowStage(component: CatalogComponent): WorkflowStage {
  const raw = component.workflow_stage ?? component.release_status;
  return normalizeWorkflowStage(raw) ?? raw;
}

/**
 * Transitions to offer for a role from a stage, straight from the generated
 * server contract. The server still authorizes the request; this only decides
 * what the client shows. Unknown roles and stages offer nothing.
 */
export function allowedWorkflowTransitionsFrom(role: UserRole | undefined | null, stage: string): WorkflowStage[] {
  const current = normalizeWorkflowStage(stage);
  if (!role || !current) return [];
  const byStage = CATALOG_WORKFLOW_POLICY.allowed[role as keyof typeof CATALOG_WORKFLOW_POLICY.allowed];
  if (!byStage) return [];
  return [...(byStage[current] as readonly WorkflowStage[])];
}

export function allowedWorkflowTransitions(role: UserRole | undefined | null, component: CatalogComponent): WorkflowStage[] {
  return allowedWorkflowTransitionsFrom(role, workflowStage(component));
}
