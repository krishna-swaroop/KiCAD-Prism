import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelComponent, PanelPageResult } from "@/panel/lib/panel-api";
import {
  getCategories,
  getComponentsByCategory,
  searchComponents,
} from "@/panel/lib/panel-api";
import { emptyCategoryBrowse, emptyFinderView, type FinderViewState } from "@/panel/lib/view-state";

import { CategoryListScreen } from "./CategoryListScreen";
import { SymbolFinderScreen } from "./SymbolFinderScreen";

vi.mock("@/panel/lib/panel-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/panel/lib/panel-api")>(),
  getCategories: vi.fn(),
  getComponentsByCategory: vi.fn(),
  searchComponents: vi.fn(),
}));

const noop = () => {};

function component(overrides: Partial<PanelComponent> = {}): PanelComponent {
  return {
    id: "part",
    slug: "part",
    name: "Inventory test",
    identity_kind: "mpn",
    manufacturer: "Prism",
    mpn: "P-1",
    description: "Pagination fixture",
    package_name: "",
    category: "Parts",
    datasheet_url: "",
    summary: "",
    version: "1",
    library_name: "",
    symbol_name: "",
    representations: [],
    assets: [],
    missing_assets: [],
    availability_state: "metadata_only",
    place_enabled: false,
    default_representation_id: "",
    effective_representation_id: "",
    preview_status: {},
    symbol_preview_url: "",
    footprint_preview_url: "",
    manifest_url: "",
    inline_url: "",
    ...overrides,
  };
}

function pageOf(
  items: PanelComponent[],
  overrides: Partial<PanelPageResult> = {},
): PanelPageResult {
  return {
    items,
    total: null,
    has_more: false,
    page: 1,
    pages: null,
    page_size: 50,
    ...overrides,
  };
}

function CategoryHarness({
  total = 501,
  initial = emptyCategoryBrowse("Parts", total),
}: {
  total?: number | null;
  initial?: ReturnType<typeof emptyCategoryBrowse>;
}) {
  const [view, setView] = useState(initial);
  return (
    <CategoryListScreen
      category="Parts"
      viewState={view}
      onViewStateChange={setView}
      onBack={noop}
      onSelectComponent={noop}
      onAuthRequired={noop}
      appendLog={noop}
    />
  );
}

function FinderHarness({ initial = emptyFinderView() }: { initial?: FinderViewState }) {
  const [view, setView] = useState(initial);
  return (
    <SymbolFinderScreen
      viewState={view}
      onViewStateChange={setView}
      onSelectCategory={noop}
      onSelectComponent={noop}
      onAuthRequired={noop}
      appendLog={noop}
    />
  );
}

beforeEach(() => {
  vi.mocked(getCategories).mockReset();
  vi.mocked(getComponentsByCategory).mockReset();
  vi.mocked(searchComponents).mockReset();
});

describe("category pagination", () => {
  it("loads one page, then appends the next without walking the catalog", async () => {
    vi.mocked(getComponentsByCategory)
      .mockResolvedValueOnce(pageOf([component({ id: "a", name: "First part" })], {
        has_more: true,
        total: null,
      }))
      .mockResolvedValueOnce(pageOf([component({ id: "b", name: "Last part" })], {
        page: 2,
        has_more: false,
        total: null,
      }));

    render(<CategoryHarness />);

    expect(await screen.findByText("First part")).toBeInTheDocument();
    expect(screen.getByText("1 of 501 parts")).toBeInTheDocument();
    expect(getComponentsByCategory).toHaveBeenCalledTimes(1);
    expect(getComponentsByCategory).toHaveBeenNthCalledWith(
      1,
      "Parts",
      expect.objectContaining({ page: 1 }),
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(await screen.findByText("Last part")).toBeInTheDocument();
    expect(screen.getByText("2 of 501 parts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(getComponentsByCategory).toHaveBeenCalledTimes(2);
    expect(getComponentsByCategory).toHaveBeenNthCalledWith(
      2,
      "Parts",
      expect.objectContaining({ page: 2 }),
    );
  });

  it("keeps a restored category page without refetching", async () => {
    render(
      <CategoryHarness
        initial={{
          name: "Parts",
          items: [component({ id: "kept", name: "Kept part" })],
          page: 3,
          hasMore: true,
          total: 501,
        }}
      />,
    );

    expect(await screen.findByText("Kept part")).toBeInTheDocument();
    expect(screen.getByText("1 of 501 parts")).toBeInTheDocument();
    expect(getComponentsByCategory).not.toHaveBeenCalled();
  });

  it("ignores a cancelled first page", async () => {
    let resolvePage: ((value: PanelPageResult) => void) | undefined;
    vi.mocked(getComponentsByCategory).mockImplementation((_category, query) =>
      new Promise((resolve, reject) => {
        query?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
        resolvePage = resolve;
      }),
    );

    const { unmount } = render(<CategoryHarness total={null} />);
    await waitFor(() => expect(getComponentsByCategory).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolvePage?.(pageOf([component({ id: "stale", name: "Stale part" })], { has_more: true }));
    });

    expect(screen.queryByText("Stale part")).not.toBeInTheDocument();
  });
});

describe("search pagination", () => {
  it("searches one page and can continue through later matches", async () => {
    vi.mocked(getCategories).mockResolvedValue([]);
    vi.mocked(searchComponents)
      .mockResolvedValueOnce(pageOf([component({ id: "a", name: "First match" })], {
        has_more: true,
      }))
      .mockResolvedValueOnce(pageOf([component({ id: "b", name: "Last match" })], {
        page: 2,
        has_more: false,
      }));

    render(<FinderHarness initial={{ ...emptyFinderView(), query: "res" }} />);

    expect(await screen.findByText("First match")).toBeInTheDocument();
    expect(screen.getByText("1 result loaded")).toBeInTheDocument();
    expect(searchComponents).toHaveBeenCalledTimes(1);
    expect(searchComponents).toHaveBeenNthCalledWith(
      1,
      "res",
      expect.objectContaining({ page: 1 }),
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(await screen.findByText("Last match")).toBeInTheDocument();
    expect(screen.getByText("2 results")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(searchComponents).toHaveBeenNthCalledWith(
      2,
      "res",
      expect.objectContaining({ page: 2 }),
    );
  });

  it("does not refetch a search that is already in the preserved view", async () => {
    vi.mocked(getCategories).mockResolvedValue([]);

    render(
      <FinderHarness
        initial={{
          query: "res",
          fetchedQuery: "res",
          search: {
            items: [component({ id: "kept", name: "Kept match" })],
            page: 2,
            hasMore: true,
            total: null,
          },
        }}
      />,
    );

    expect(await screen.findByText("Kept match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    expect(searchComponents).not.toHaveBeenCalled();
  });

  it("drops a late page from a superseded query", async () => {
    vi.mocked(getCategories).mockResolvedValue([]);
    let resolveOld: ((value: PanelPageResult) => void) | undefined;
    vi.mocked(searchComponents).mockImplementation((query, pageQuery) => {
      if (query === "old") {
        return new Promise((resolve, reject) => {
          pageQuery?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
          resolveOld = resolve;
        });
      }
      return Promise.resolve(pageOf([component({ id: "new", name: "New match" })]));
    });

    render(<FinderHarness initial={{ ...emptyFinderView(), query: "old" }} />);
    await waitFor(() => expect(searchComponents).toHaveBeenCalledWith(
      "old",
      expect.objectContaining({ page: 1 }),
    ));

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "new" } });
    expect(await screen.findByText("New match")).toBeInTheDocument();

    await act(async () => {
      resolveOld?.(pageOf([component({ id: "stale", name: "Stale match" })], { has_more: true }));
    });

    expect(screen.queryByText("Stale match")).not.toBeInTheDocument();
    expect(screen.getByText("New match")).toBeInTheDocument();
  });
});
