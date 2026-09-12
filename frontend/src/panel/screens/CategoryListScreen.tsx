import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { PanelComponent } from "@/panel/lib/panel-api";
import { getComponentsByCategory, isAuthError, primaryLocalSource } from "@/panel/lib/panel-api";

interface CategoryListScreenProps {
  category: string;
  onBack: () => void;
  onSelectComponent: (component: PanelComponent) => void;
  onAuthRequired: () => void;
  appendLog: (msg: string) => void;
}

export function CategoryListScreen({
  category,
  onBack,
  onSelectComponent,
  onAuthRequired,
  appendLog,
}: CategoryListScreenProps) {
  const [components, setComponents] = useState<PanelComponent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    getComponentsByCategory(category, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setComponents(items);
          setLoading(false);
          appendLog(`Loaded ${items.length} parts in "${category}"`);
        }
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
  }, [category, appendLog, onAuthRequired]);

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{category || "Uncategorized"}</h2>
          {!loading && (
            <p className="text-[10px] text-muted-foreground">
              {components.length} part{components.length !== 1 ? "s" : ""}
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
              />
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockBadge({
  quantity,
  known,
  mixedUnits,
}: {
  quantity: number;
  known: boolean;
  mixedUnits?: boolean;
}) {
  const inStock = !mixedUnits && quantity > 0;
  return (
    <Badge
      variant={!known || mixedUnits ? "secondary" : inStock ? "default" : "destructive"}
      className={`text-[9px] ${inStock ? "bg-emerald-600/90 text-white" : ""}`}
      title={mixedUnits ? "Mixed units" : undefined}
    >
      {!known ? "?" : mixedUnits ? "mix" : inStock ? quantity : "0"}
    </Badge>
  );
}
