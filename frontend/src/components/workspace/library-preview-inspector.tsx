import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CatalogPreview } from "@/types/catalog";

const previewUrl = (previewId: string) => `/api/catalog/previews/${encodeURIComponent(previewId)}`;

/**
 * Shared pan/zoom frame for every catalog preview. Keeping this separate from
 * the preview selector lets revision comparison use the exact same viewport
 * mechanics as the catalog quick view and Assets tab.
 */
export function LibraryPreviewViewport({
  viewportKey,
  children,
  className,
}: {
  viewportKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden border bg-preview-surface", className)}>
      <TransformWrapper
        key={viewportKey}
        initialScale={1}
        minScale={0.5}
        maxScale={8}
        centerOnInit
        centerZoomedOut
        smooth
        wheel={{ step: 0.12, smoothStep: 0.006 }}
        // Interactive controls supplied inside a preview must not start a
        // pan gesture in the transformed canvas beneath them.
        panning={{ velocityDisabled: false, excluded: ["prism-preview-interaction"] }}
        pinch={{ step: 4 }}
        doubleClick={{ mode: "reset", animationTime: 180 }}
        zoomAnimation={{ animationTime: 180, animationType: "easeOut" }}
        alignmentAnimation={{ animationTime: 180, velocityAlignmentTime: 220 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="absolute right-2 top-2 z-20 flex items-center border bg-background/90 shadow-sm">
              <Button size="icon-sm" variant="ghost" aria-label="Zoom out preview" onClick={() => zoomOut(0.3)}><Minus className="h-3.5 w-3.5" /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Zoom in preview" onClick={() => zoomIn(0.3)}><Plus className="h-3.5 w-3.5" /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Reset preview view" onClick={() => resetTransform()}><RotateCcw className="h-3.5 w-3.5" /></Button>
            </div>
            <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
              {children}
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

export function LibraryPreviewInspector({
  previews,
  kind,
  label,
  compact = false,
}: {
  previews: CatalogPreview[];
  kind: "symbol" | "footprint";
  label: string;
  compact?: boolean;
}) {
  const ready = useMemo(() => {
    // Old revision evidence can coexist with regenerated outputs. The server
    // resolves that overlap, but retain a client-side guard for cached payloads.
    const perUnit = new Map<number, CatalogPreview>();
    previews
      .filter((preview) => preview.kind === kind && preview.status === "ready")
      .sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""))
      .forEach((preview) => {
        if (!perUnit.has(preview.unit)) perUnit.set(preview.unit, preview);
      });
    return [...perUnit.values()].sort((a, b) => a.unit - b.unit);
  }, [kind, previews]);
  const [activeUnit, setActiveUnit] = useState(ready[0]?.unit || 1);
  const active = ready.find((preview) => preview.unit === activeUnit) || ready[0];

  useEffect(() => {
    if (!ready.some((preview) => preview.unit === activeUnit)) setActiveUnit(ready[0]?.unit || 1);
  }, [activeUnit, ready]);

  if (!active) {
    return <div className={cn("flex items-center justify-center border border-dashed text-xs text-muted-foreground", compact ? "h-48" : "h-80")}>No {kind} preview</div>;
  }

  return (
    <div className="min-w-0 space-y-2">
      {kind === "symbol" && ready.length > 1 ? (
        <div className="flex max-w-full gap-1 overflow-x-auto border-b pb-1" role="tablist" aria-label={`${label} symbol units`}>
          {ready.map((preview) => (
            <Button
              key={preview.id}
              size="sm"
              variant={active.id === preview.id ? "secondary" : "ghost"}
              className="h-7 shrink-0"
              role="tab"
              aria-selected={active.id === preview.id}
              onClick={() => setActiveUnit(preview.unit)}
            >
              {preview.unit_label}
            </Button>
          ))}
        </div>
      ) : null}
      <LibraryPreviewViewport viewportKey={active.id} className={compact ? "h-48" : "h-80"}>
        <img
          src={previewUrl(active.id)}
          alt={`${label} ${kind === "symbol" ? active.unit_label : "footprint"} preview`}
          draggable={false}
          className="pointer-events-none h-full w-full select-none object-contain p-3"
        />
      </LibraryPreviewViewport>
    </div>
  );
}
