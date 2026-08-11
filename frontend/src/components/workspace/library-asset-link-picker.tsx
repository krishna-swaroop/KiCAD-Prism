import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CatalogAssetSummary } from "@/types/catalog";

interface LibraryAssetLinkPickerProps {
  assetType: "symbol" | "footprint" | "3dmodel" | "spice";
  /** Currently linked catalog asset id, if any. */
  value: string;
  /** Shown when nothing is linked - usually the project's own footprint string. */
  placeholder: string;
  /** Seeds the search so the likely match is on screen without typing. */
  suggestQuery?: string;
  disabled?: boolean;
  onChange: (assetId: string, asset: CatalogAssetSummary | null) => void;
}

const RESULT_LIMIT = 20;

/**
 * Choose an existing catalog asset for an import row.
 *
 * Linking is a reference: the component points at the same asset row every other
 * component using that footprint points at, so importing a hundred 0603 resistors
 * does not create a hundred near-identical footprints.
 */
export function LibraryAssetLinkPicker({
  assetType,
  value,
  placeholder,
  suggestQuery = "",
  disabled = false,
  onChange,
}: LibraryAssetLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogAssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState<CatalogAssetSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveQuery = query || (open ? suggestQuery : "");

  const search = useCallback(
    async (term: string, signal: AbortSignal) => {
      setLoading(true);
      try {
        const response = await fetchJson<{ items: CatalogAssetSummary[] }>(
          `/api/catalog/assets/search?asset_type=${assetType}&limit=${RESULT_LIMIT}` +
            `&q=${encodeURIComponent(term)}`,
          { signal },
          "Failed to search catalog assets"
        );
        if (!signal.aborted) setResults(response.items);
      } catch {
        if (!signal.aborted) setResults([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [assetType]
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void search(effectiveQuery, controller.signal), 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [effectiveQuery, open, search]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the label meaningful when a draft is restored and we only know the id.
  useEffect(() => {
    if (!value) {
      setLinked(null);
      return;
    }
    if (linked?.id === value) return;
    const known = results.find((item) => item.id === value);
    if (known) setLinked(known);
  }, [linked, results, value]);

  const label = useMemo(() => {
    if (!value) return placeholder || "Not linked";
    if (linked) return linked.target_name || linked.name;
    return "Linked asset";
  }, [linked, placeholder, value]);

  const select = (asset: CatalogAssetSummary) => {
    setLinked(asset);
    onChange(asset.id, asset);
    setOpen(false);
    setQuery("");
  };

  const clear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setLinked(null);
    onChange("", null);
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-1.5 border-r px-2 text-left text-xs outline-none",
            "focus:ring-1 focus:ring-inset focus:ring-ring disabled:cursor-default",
            value ? "text-foreground" : "text-muted-foreground"
          )}
          title={value ? "Linked to an existing catalog asset" : placeholder}
        >
          {value ? <Link2 className="h-3 w-3 shrink-0 text-primary" /> : null}
          <span className="truncate">{label}</span>
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Remove link"
              onClick={clear}
              className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={suggestQuery ? `Search, e.g. ${suggestQuery}` : "Search catalog assets"}
            className="h-7 border-0 px-0 text-xs shadow-none focus-visible:ring-0"
          />
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No matching {assetType} assets in the catalog yet.
            </p>
          ) : null}
          {results.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => select(asset)}
              className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
            >
              <span className="mt-0.5 w-3.5 shrink-0">
                {asset.id === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {asset.target_name || asset.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {asset.target_library || "—"}
                  {" · used by "}
                  {asset.usage_count} component{asset.usage_count === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          ))}
        </div>
        {value ? (
          <div className="border-t p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                setLinked(null);
                onChange("", null);
                setOpen(false);
              }}
            >
              Import this row&apos;s own asset instead
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
