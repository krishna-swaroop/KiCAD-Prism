import type { PanelComponent } from "@/panel/lib/panel-api";

export type FinderViewState = {
  query: string;
  searchResults: PanelComponent[];
};
