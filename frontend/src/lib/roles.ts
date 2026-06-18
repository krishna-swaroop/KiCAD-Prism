import type { CatalogComponent, WorkflowStage } from "@/types/catalog";
import type { UserRole } from "@/types/auth";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  designer: "Designer",
  viewer: "Viewer",
  component_designer: "Component Designer",
  component_qa: "Component QA",
};

export const ROLE_OPTIONS: UserRole[] = ["viewer", "designer", "component_designer", "component_qa", "admin"];

const WORKFLOW_TRANSITIONS: Record<WorkflowStage, WorkflowStage[]> = {
  open: ["in_progress", "archived"],
  in_progress: ["qa_review", "open", "archived"],
  qa_review: ["done", "in_progress", "archived"],
  done: ["released", "qa_review", "archived"],
  released: ["archived", "open"],
  archived: ["open"],
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function canManageProjects(role?: UserRole | null): boolean {
  return role === "admin" || role === "designer";
}

export function canOpenLibraryManager(role?: UserRole | null): boolean {
  return role === "admin" || role === "designer" || role === "component_designer" || role === "component_qa";
}

export function canWriteCatalog(role?: UserRole | null): boolean {
  return role === "admin" || role === "component_designer";
}

export function canReviewCatalogQa(role?: UserRole | null): boolean {
  return role === "admin" || role === "component_qa";
}

export function workflowStage(component: CatalogComponent): WorkflowStage {
  return component.workflow_stage ?? component.release_status;
}

export function allowedWorkflowTransitions(role: UserRole | undefined | null, component: CatalogComponent): WorkflowStage[] {
  const current = workflowStage(component);
  const transitions = WORKFLOW_TRANSITIONS[current] ?? [];
  if (role === "admin") {
    return transitions;
  }
  if (role === "component_designer") {
    return transitions.filter((next) => !(current === "qa_review" && next === "done"));
  }
  if (role === "component_qa" && current === "qa_review") {
    return transitions.filter((next) => next === "done" || next === "in_progress" || next === "archived");
  }
  return [];
}
