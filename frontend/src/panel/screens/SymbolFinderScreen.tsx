import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import type { PanelCategory, PanelComponent } from "@/panel/lib/panel-api";
import {
  getCategories,
  searchComponents,
  isAuthError,
} from "@/panel/lib/panel-api";

import type { FinderViewState } from "@/panel/lib/view-state";

interface SymbolFinderScreenProps {
  viewState: FinderViewState;
  onViewStateChange: React.Dispatch<React.SetStateAction<FinderViewState>>;
  onSelectCategory: (category: string) => void;
  onSelectComponent: (component: PanelComponent) => void;
  onAuthRequired: () => void;
  appendLog: (msg: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  Resistors: "Ω",
  Capacitors: "⊣⊢",
  Inductors: "⏁",
  Diodes: "▷|",
  Transistors: "⏚",
  ICs: "⬡",
  Connectors: "⊞",
  Crystals: "◇",
};

function categoryIcon(name: string): string {
  if (!name) return "📦";
  return CATEGORY_ICONS[name] || "⬡";
}

export function SymbolFinderScreen({
  viewState,
  onViewStateChange,
  onSelectCategory,
  onSelectComponent,
  onAuthRequired,
  appendLog,
}: SymbolFinderScreenProps) {
  const { query, searchResults } = viewState;
  const setQuery = (value: string) =>
    onViewStateChange((prev) => ({ ...prev, query: value }));
  const setSearchResults = (items: PanelComponent[]) =>
    onViewStateChange((prev) => ({ ...prev, searchResults: items }));
  const [categories, setCategories] = useState<PanelCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories on mount
  useEffect(() => {
    const controller = new AbortController();
    getCategories(controller.signal)
      .then((cats) => {
        if (!controller.signal.aborted) {
          setCategories(cats);
          setLoadingCategories(false);
          appendLog(`Loaded ${cats.length} categories`);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onAuthRequired();
          return;
        }
        appendLog(`Failed to load categories: ${(err as Error).message}`);
        setLoadingCategories(false);
      });
    return () => controller.abort();
  }, [appendLog, onAuthRequired]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      searchComponents(trimmed, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return;
          setSearchResults(items);
          setSearching(false);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (isAuthError(err)) {
            onAuthRequired();
            return;
          }
          appendLog(`Search failed: ${(err as Error).message}`);
          setSearching(false);
        });
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, appendLog, onAuthRequired]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="sticky top-0 z-10 bg-background/95 pb-2 pt-1 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by value, MPN, manufacturer, description…"
            className="h-9 bg-secondary/50 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Category Grid (shown when not searching) */}
      {!isSearching && (
        <div className="flex flex-col gap-0.5">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Categories
          </p>
          {loadingCategories ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded border border-dashed border-border/50 px-3 py-6 text-center text-xs text-muted-foreground">
              No categories found in the catalog.
            </div>
          ) : (
            categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => onSelectCategory(cat.name)}
                className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary/60"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary text-xs font-bold text-muted-foreground">
                  {categoryIcon(cat.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {cat.name || "Uncategorized"}
                  </span>
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {cat.count}
                </Badge>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))
          )}
        </div>
      )}

      {/* Search results (shown when searching) */}
      {isSearching && (
        <div className="flex flex-col gap-0.5">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Search Results
          </p>
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          ) : searchResults.length === 0 ? (
            <div className="rounded border border-dashed border-border/50 px-3 py-6 text-center text-xs text-muted-foreground">
              No matching components found.
            </div>
          ) : (
            searchResults.map((comp) => (
              <button
                key={comp.id}
                onClick={() => onSelectComponent(comp)}
                className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {comp.name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {comp.manufacturer || "Unknown"} · {comp.mpn || "—"} · {comp.package_name || "—"}
                  </span>
                </span>
                <StockDot quantity={comp.stock_quantity} />
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StockDot({ quantity }: { quantity: number }) {
  const inStock = quantity > 0;
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${inStock ? "bg-emerald-500" : "bg-red-500"}`}
      title={inStock ? `In stock (${quantity})` : "Out of stock"}
    />
  );
}
