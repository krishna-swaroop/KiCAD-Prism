import { useState } from "react";
import type { ReactNode } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  symbolUnitLabel,
  type AssetSource,
  type RenderController,
  type RenderNavigationOptions,
} from "@/lib/ecad-renderer";
import { cn } from "@/lib/utils";

import {
  EMBEDDED_PREVIEW_NAVIGATION,
  EXPANDED_PREVIEW_NAVIGATION,
  LibraryAssetRenderer,
} from "./library-asset-renderer";
import {
  LibraryCrossProbeProvider,
  LibraryProbeBadge,
  type LibraryProbeSelection,
  useLibraryCrossProbe,
} from "./library-cross-probe";

function LibraryLivePreviewViewport({
  controller,
  children,
  className,
}: {
  controller: RenderController | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex overflow-hidden border bg-preview-surface",
        className,
      )}
    >
      <div className="absolute right-2 top-2 z-20 flex items-center border bg-background/90 shadow-sm">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom out preview"
          disabled={!controller}
          onClick={() => controller?.zoomBy(0.8)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom in preview"
          disabled={!controller}
          onClick={() => controller?.zoomBy(1.25)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Reset preview view"
          disabled={!controller}
          onClick={() => controller?.resetView()}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {children}
    </div>
  );
}

/**
 * The unit strip for a multi-unit symbol.
 *
 * It sits above the preview frame rather than inside it. The frame's ground is
 * the ECAD canvas white, which is the same in both themes, so a strip drawn on
 * it rendered near-white-on-white in dark mode; and the frame's top-right
 * corner already belongs to the zoom controls, which covered the tail of the
 * strip on a part with many units.
 */
function LivePreviewUnitTabs({
  label,
  units,
  unit,
  onSelect,
}: {
  label: string;
  units: number;
  unit: number;
  onSelect: (unit: number) => void;
}) {
  return (
    <div
      className="flex max-w-full shrink-0 gap-1 overflow-x-auto pb-1"
      role="tablist"
      aria-label={`${label} symbol units`}
    >
      {Array.from({ length: units }, (_, index) => index + 1).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={value === unit ? "secondary" : "ghost"}
          className="h-7 shrink-0"
          role="tab"
          aria-selected={value === unit}
          onClick={() => onSelect(value)}
        >
          {symbolUnitLabel(value)}
        </Button>
      ))}
    </div>
  );
}

function LivePreviewPane({
  assetId,
  kind,
  label,
  source,
  navigation,
  unit = 1,
  onUnitChange,
  className,
  loadAsset,
}: {
  assetId?: string;
  kind: "symbol" | "footprint";
  label: string;
  source: AssetSource;
  navigation: RenderNavigationOptions;
  unit?: number;
  onUnitChange?: (unit: number) => void;
  className?: string;
  loadAsset?: (url: string) => Promise<string>;
}) {
  const [controller, setController] = useState<RenderController | null>(null);
  const [units, setUnits] = useState(1);
  const clearProbe = useLibraryCrossProbe()?.clear;
  if (!assetId) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-dashed text-xs text-muted-foreground",
          className,
        )}
      >
        No {kind}
      </div>
    );
  }
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      {units > 1 ? (
        <LivePreviewUnitTabs
          label={label}
          units={units}
          unit={unit}
          onSelect={(next) => {
            // A latched pin belongs to the unit it was probed on.
            clearProbe?.();
            onUnitChange?.(next);
          }}
        />
      ) : null}
      <LibraryLivePreviewViewport
        controller={controller}
        className="min-h-0 flex-1"
      >
        <LibraryAssetRenderer
          key={assetId}
          assetId={assetId}
          kind={kind}
          label={label}
          source={source}
          navigation={navigation}
          unit={unit}
          onUnitsChange={setUnits}
          onControllerChange={setController}
          loadAsset={loadAsset}
        />
      </LibraryLivePreviewViewport>
    </div>
  );
}

export interface LibraryPreviewPairProps {
  label: string;
  symbolAssetId?: string;
  footprintAssetId?: string;
  source?: AssetSource;
  compact?: boolean;
  stacked?: boolean;
  symbolMeta?: string;
  footprintMeta?: string;
  className?: string;
  loadAsset?: (url: string) => Promise<string>;
}

function LibraryPreviewPanes({
  label,
  symbolAssetId,
  footprintAssetId,
  source,
  navigation,
  initialSymbolUnit,
  onSymbolUnitChange,
  paneClassName,
  stacked = false,
  symbolMeta,
  footprintMeta,
  expandedView,
  loadAsset,
}: LibraryPreviewPairProps & {
  source: AssetSource;
  navigation: RenderNavigationOptions;
  initialSymbolUnit: number;
  onSymbolUnitChange?: (unit: number) => void;
  paneClassName: string;
  expandedView: boolean;
}) {
  const [symbolUnit, setSymbolUnit] = useState(initialSymbolUnit);
  return (
    <div
      className={cn(
        "grid min-h-0 gap-3",
        stacked && !expandedView ? "grid-cols-1" : "sm:grid-cols-2",
        expandedView && "flex-1",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <p className="text-xs font-medium">{symbolMeta || "Symbol"}</p>
        <LivePreviewPane
          assetId={symbolAssetId}
          kind="symbol"
          label={label}
          source={source}
          navigation={navigation}
          unit={symbolUnit}
          onUnitChange={(next) => {
            setSymbolUnit(next);
            onSymbolUnitChange?.(next);
          }}
          className={expandedView ? "min-h-0 flex-1" : paneClassName}
          loadAsset={loadAsset}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <p className="text-xs font-medium">{footprintMeta || "Footprint"}</p>
        <LivePreviewPane
          assetId={footprintAssetId}
          kind="footprint"
          label={label}
          source={source}
          navigation={navigation}
          className={expandedView ? "min-h-0 flex-1" : paneClassName}
          loadAsset={loadAsset}
        />
      </div>
    </div>
  );
}

function LibraryPreviewPairSession({
  label,
  symbolAssetId,
  footprintAssetId,
  source = "catalog",
  compact = false,
  stacked = false,
  symbolMeta,
  footprintMeta,
  className,
  loadAsset,
}: LibraryPreviewPairProps) {
  const [expanded, setExpanded] = useState(false);
  const [latchedProbe, setLatchedProbe] =
    useState<LibraryProbeSelection | null>(null);
  const [symbolUnit, setSymbolUnit] = useState(1);
  const resetKey = `${symbolAssetId ?? "-"}:${footprintAssetId ?? "-"}`;
  const paneClassName = compact ? "h-48" : "h-80";

  return (
    <>
      <LibraryCrossProbeProvider
        resetKey={resetKey}
        onLatchedChange={setLatchedProbe}
        className={cn("space-y-2", className)}
      >
        <div className="flex min-h-7 items-center gap-2">
          {/* The badge slot is always laid out, empty or not. Left to
              `justify-between`, the expand control was the row's only child
              until a probe latched, so it sat left and then jumped right the
              moment the badge appeared. */}
          <div className="min-w-0 flex-1">
            <LibraryProbeBadge />
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Expand paired preview"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <LibraryPreviewPanes
          label={label}
          symbolAssetId={symbolAssetId}
          footprintAssetId={footprintAssetId}
          source={source}
          navigation={EMBEDDED_PREVIEW_NAVIGATION}
          initialSymbolUnit={1}
          onSymbolUnitChange={setSymbolUnit}
          paneClassName={paneClassName}
          stacked={stacked}
          symbolMeta={symbolMeta}
          footprintMeta={footprintMeta}
          expandedView={false}
          loadAsset={loadAsset}
        />
      </LibraryCrossProbeProvider>
      {/* The lightbox gets its own probe session rather than nesting inside
          the one above. Sharing it registered all four viewers with one
          controller registry, so every pointer move also repainted the two
          canvases sitting behind the modal -- and latching a pin in here
          changed the badge on the page underneath. The dialog unmounts its
          children when closed, so nothing here is registered until it opens. */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[85vh] max-w-6xl flex-col overflow-hidden p-0">
          <LibraryCrossProbeProvider
            resetKey={resetKey}
            initialLatched={latchedProbe}
            className="flex min-h-0 flex-1 flex-col gap-4 p-6"
          >
            <DialogHeader className="shrink-0 pr-8">
              <DialogTitle>{label} · Pin↔pad inspection</DialogTitle>
              <DialogDescription>
                Hover to preview a mapping. Click to latch it; press Escape or
                click empty space to clear.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-7 shrink-0">
              <LibraryProbeBadge />
            </div>
            <LibraryPreviewPanes
              label={label}
              symbolAssetId={symbolAssetId}
              footprintAssetId={footprintAssetId}
              source={source}
              navigation={EXPANDED_PREVIEW_NAVIGATION}
              initialSymbolUnit={symbolUnit}
              paneClassName={paneClassName}
              stacked={stacked}
              symbolMeta={symbolMeta}
              footprintMeta={footprintMeta}
              expandedView
              loadAsset={loadAsset}
            />
          </LibraryCrossProbeProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LibraryPreviewPair(props: LibraryPreviewPairProps) {
  const resetKey = `${props.symbolAssetId ?? "-"}:${props.footprintAssetId ?? "-"}`;
  return <LibraryPreviewPairSession key={resetKey} {...props} />;
}
