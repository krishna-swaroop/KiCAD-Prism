export type WorkspaceSection = "projects" | "library-manager";
export type ViewMode = "gallery" | "list";

// auto-fill with a fixed minimum column width, so the number of columns is
// derived from the available width rather than pinned per breakpoint. When the
// properties panel opens and the grid area narrows, cards keep their size and
// the overflowing column wraps onto the next row instead of every card getting
// squeezed thinner.
export const PROJECT_GRID_CLASS =
  "grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]";
