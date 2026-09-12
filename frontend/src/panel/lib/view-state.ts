import type { PanelComponent } from "@/panel/lib/panel-api";

export type PagedComponentList = {
  items: PanelComponent[];
  page: number;
  hasMore: boolean;
  total: number | null;
};

export type FinderViewState = {
  query: string;
  fetchedQuery: string;
  search: PagedComponentList;
};

export type CategoryBrowseState = {
  name: string;
} & PagedComponentList;

export function emptyPagedList(total: number | null = null): PagedComponentList {
  return { items: [], page: 0, hasMore: false, total };
}

export function emptyFinderView(): FinderViewState {
  return { query: "", fetchedQuery: "", search: emptyPagedList() };
}

export function emptyCategoryBrowse(
  name: string,
  total: number | null = null,
): CategoryBrowseState {
  return { name, ...emptyPagedList(total) };
}
