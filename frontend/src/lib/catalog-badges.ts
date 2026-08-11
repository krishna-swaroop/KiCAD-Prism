import type { AvailabilityState, CatalogValidationStatus, WorkflowStage } from "@/types/catalog";

type BadgeVariant = "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "outline";

/**
 * Semantic colour for the catalog's state columns.
 *
 * These live in one place so the catalog, release queue, and component views can
 * never disagree about what a stage looks like. The variants map onto existing
 * theme tokens rather than literal colours, so they follow light and dark themes.
 *
 * The scheme is deliberately not "one colour per value": neutral means nothing is
 * owed, amber means someone is owed an action, red means something is wrong. That
 * way a long catalog page can be scanned for problems rather than read.
 */

export const AVAILABILITY_BADGE_VARIANT: Record<AvailabilityState, BadgeVariant> = {
  place_ready: "success",
  files_partial: "warning",
  metadata_only: "outline",
};

export const WORKFLOW_BADGE_VARIANT: Record<WorkflowStage, BadgeVariant> = {
  open: "outline",
  in_progress: "info",
  qa_review: "warning",
  done: "success",
  released: "default",
  archived: "secondary",
};

export const VALIDATION_BADGE_VARIANT: Record<CatalogValidationStatus, BadgeVariant> = {
  passed: "success",
  warning: "warning",
  failed: "destructive",
  skipped: "secondary",
  not_run: "outline",
};

export const WORKFLOW_BADGE_TITLE: Record<WorkflowStage, string> = {
  open: "Not started",
  in_progress: "Being worked on",
  qa_review: "Waiting for a QA reviewer",
  done: "Approved, not yet released",
  released: "Released to the library",
  archived: "Retired from the library",
};

export const AVAILABILITY_BADGE_TITLE: Record<AvailabilityState, string> = {
  place_ready: "Symbol and footprint attached, ready to place",
  files_partial: "Some CAD assets are missing",
  metadata_only: "No CAD assets attached yet",
};

export const VALIDATION_BADGE_TITLE: Record<CatalogValidationStatus, string> = {
  passed: "KiCad Library Convention checks passed",
  warning: "KLC checks raised warnings",
  failed: "KLC checks failed",
  skipped: "KLC checks were skipped",
  not_run: "KLC checks have not been run",
};
