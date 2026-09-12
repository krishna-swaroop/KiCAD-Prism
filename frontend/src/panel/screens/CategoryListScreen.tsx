import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { inventoryWarnings } from "@/lib/inventory-presentation";

import type { PanelComponent } from "@/panel/lib/panel-api";
import { getComponentsByCategory, isAuthError, primaryLocalSource } from "@/panel/lib/panel-api";
import { appendUniquePageItems, formatPanelLoadedCount } from "@/panel/lib/panel-page";
import type { CategoryBrowseState } from "@/panel/lib/view-state";

interface CategoryListScreenProps {
  category: string;
  viewState: CategoryBrowseState;
  onViewStateChange: React.Dispatch<React.SetStateAction<CategoryBrowseState>>;
  onBack: () => void;
  onSelectComponent: (component: PanelComponent) => void;
  onAuthRequired: () => void;
  appendLog: (msg: string) => void;
}

export function CategoryListScreen({
  category,
  viewState,
  onViewStateChange,
  onBack,
  onSelectComponent,
  onAuthRequired,
  appendLog,
}: CategoryListScreenProps) {
  const restored = viewState.name === category && viewState.page > 0;
  const [loading, setLoading] = useState(!restored);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (viewState.name === category && viewState.page > 0) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    getComponentsByCategory(category, { page: 1, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        onViewStateChange((prev) => ({
          name: category,
          items: page.items,
          page: page.page,
          hasMore: page.has_more,
          total: page.total ?? (prev.name === category ? prev.total : null),
        }));
        setLoading(false);
        appendLog(`Loaded ${page.items.length} parts in "${category}"`);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onAuthRequired();
          return;
        }
        appendLog(`Failed to load category: ${(err as Error).message}`);
        setLoading(false);
      });
    return () => controller.abort();
  }, [category, viewState.name, viewState.page, appendLog, onAuthRequired, onViewStateChange]);

  useEffect(() => () => loadMoreAbortRef.current?.abort(), []);

  const loadMore = () => {
    if (!viewState.hasMore || loadingMore) return;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    setLoadingMore(true);
    getComponentsByCategory(category, { page: viewState.page + 1, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        onViewStateChange((prev) => ({
          name: category,
          items: appendUniquePageItems(prev.name === category ? prev.items : [], page.items),
          page: page.page,
          hasMore: page.has_more,
          total: page.total ?? (prev.name === category ? prev.total : null),
        }));
        setLoadingMore(false);
        appendLog(`Loaded ${page.items.length} more parts in "${category}"`);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onAuthRequired();
          return;
        }
        appendLog(`Failed to load more: ${(err as Error).message}`);
        setLoadingMore(false);
      });
  };

  const components = viewState.name === category ? viewState.items : [];

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onBack}
          className="shrink-0"
          aria-label="Back to categories"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{category || "Uncategorized"}</h2>
          {!loading && (
            <p className="text-[10px] text-muted-foreground">
              {formatPanelLoadedCount(components.length, viewState.total, viewState.hasMore)}
            </p>
          )}
        </div>
      </div>

      {/* Part List */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : components.length === 0 ? (
        <div className="rounded border border-dashed border-border/50 px-3 py-8 text-center text-xs text-muted-foreground">
          No parts found in this category.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {components.map((comp) => {
            const local = primaryLocalSource(comp);
            return (
            <button
              key={comp.id}
              onClick={() => onSelectComponent(comp)}
              className="group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {comp.name}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {comp.manufacturer || "Unknown"} · {comp.package_name || "—"}
                </span>
              </span>
              <StockBadge
                quantity={local?.stock ?? 0}
                known={local !== null}
                mixedUnits={Boolean(local?.mixed_units)}
                warning={inventoryWarnings(local).join(" · ")}
              />
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </button>
            );
          })}
          {viewState.hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StockBadge({
  quantity,
  known,
  mixedUnits,
  warning,
}: {
  quantity: number;
  known: boolean;
  mixedUnits?: boolean;
  warning: string;
}) {
  const inStock = known && !warning && quantity > 0;
  return (
    <Badge
      variant={!known || warning ? "secondary" : inStock ? "default" : "destructive"}
      className={`text-[9px] ${inStock ? "bg-emerald-600/90 text-white" : ""}`}
      title={warning || undefined}
    >
      {!known ? "?" : mixedUnits ? "mix" : warning ? "!" : inStock ? quantity : "0"}
    </Badge>
  );
}
