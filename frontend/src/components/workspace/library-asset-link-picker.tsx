import { useMemo, useState } from "react";
import { Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CatalogAssetSummary } from "@/types/catalog";
import { AsyncSearchPicker } from "./async-search-picker";

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
 *
 * This searches registered asset *rows*. The workspace's stored-file picker
 * searches *files* on disk, including ones no asset row points at yet - different
 * sources, same search shell.
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
  // The last summary we have seen for the linked id, so a restored draft that
  // carries only an id can still show a name. Resolved in the search response
  // that produces it rather than in an effect watching for it afterwards, and
  // read only when it still matches `value`, so it cannot mislabel a stale id.
  const [linked, setLinked] = useState<CatalogAssetSummary | null>(null);

  const label = useMemo(() => {
    if (!value) return placeholder || "Not linked";
    if (linked?.id === value) return linked.target_name || linked.name;
    return "Linked asset";
  }, [linked, placeholder, value]);

  const clear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange("", null);
  };

  return (
    <div className="flex w-full min-w-0">
      <AsyncSearchPicker<CatalogAssetSummary>
      id={`asset-link-${assetType}-${value || "none"}`}
      open={open}
      onOpenChange={disabled ? () => undefined : setOpen}
      contentClassName="w-80"
      fetchKey={assetType}
      suggestQuery={suggestQuery}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-1.5 border-r px-2 text-left text-xs outline-none",
            "focus:ring-1 focus:ring-inset focus:ring-ring disabled:cursor-default",
            value ? "text-foreground" : "text-muted-foreground"
          )}
          title={value ? "Linked to an existing catalog asset" : placeholder}
        >
          {value ? <Link2 className="h-3 w-3 shrink-0 text-primary" /> : null}
          <span className="truncate">{label}</span>
        </button>
      }
      fetchPage={(query, signal) =>
        fetchJson<{ items: CatalogAssetSummary[] }>(
          `/api/catalog/assets/search?asset_type=${assetType}&limit=${RESULT_LIMIT}` +
            `&q=${encodeURIComponent(query)}`,
          { signal },
          "Failed to search catalog assets"
        ).then((response) => {
          const known = response.items.find((item) => item.id === value);
          if (known) setLinked(known);
          return { items: response.items };
        })
      }
      getKey={(asset) => asset.id}
      isSelected={(asset) => asset.id === value}
      onSelect={(asset) => {
        setLinked(asset);
        onChange(asset.id, asset);
      }}
      searchPlaceholder={suggestQuery ? `Search, e.g. ${suggestQuery}` : "Search catalog assets"}
      listLabel={`Catalog ${assetType} assets`}
      emptyMessage={`No matching ${assetType} assets in the catalog yet.`}
      renderItem={(asset) => (
        <>
          <span className="mt-0.5 w-3.5 shrink-0">
            {asset.id === value ? <Link2 className="h-3.5 w-3.5 text-primary" /> : null}
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
        </>
      )}
      renderFooter={() =>
        value ? (
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
        ) : null
      }
      />
      {value ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remove ${assetType} link`}
          onClick={clear}
          className="flex h-9 shrink-0 items-center border-r px-2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-inset focus:ring-ring disabled:cursor-default"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
