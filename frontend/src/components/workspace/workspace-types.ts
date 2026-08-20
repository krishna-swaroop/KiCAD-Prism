export type WorkspaceSection = "projects" | "library-manager" | "manufacturing";
export type ViewMode = "gallery" | "list";

// Full-width gallery uses breakpoint columns so cards stay large. When the
// properties panel opens, switch to auto-fill with a fixed minimum so cards
// wrap instead of shrinking.
export const PROJECT_GRID_CLASS =
  "grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";
export const PROJECT_GRID_CLASS_COMPACT =
  "grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]";

export const FOLDER_GRID_CLASS =
  "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";
export const FOLDER_GRID_CLASS_COMPACT =
  "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]";
