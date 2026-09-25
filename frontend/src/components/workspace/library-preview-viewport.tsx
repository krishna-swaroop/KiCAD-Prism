import type { ReactNode } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared pan/zoom frame for every catalog preview. Keeping this separate from
 * the preview selector lets revision comparison use the exact same viewport
 * mechanics as the catalog quick view and Assets tab.
 *
 * `wheelZoom` opts out of wheel handling so a scrolling page (e.g. the narrow
 * remote-provider panel) keeps its scroll; zoom is then available through the
 * buttons, pinch, and an expanded lightbox where wheel zoom re-enables.
 */
export function LibraryPreviewViewport({
  viewportKey,
  children,
  className,
  wheelZoom = true,
  onExpand,
}: {
  viewportKey: string;
  children: ReactNode;
  className?: string;
  wheelZoom?: boolean;
  onExpand?: () => void;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border bg-preview-surface",
        className,
      )}
    >
      <TransformWrapper
        key={viewportKey}
        initialScale={1}
        minScale={0.5}
        maxScale={8}
        centerOnInit
        centerZoomedOut
        smooth
        wheel={
          wheelZoom ? { step: 0.12, smoothStep: 0.006 } : { disabled: true }
        }
        // Interactive controls supplied inside a preview must not start a
        // pan gesture in the transformed canvas beneath them.
        panning={{
          velocityDisabled: false,
          excluded: ["prism-preview-interaction"],
        }}
        pinch={{ step: 4 }}
        doubleClick={{ mode: "reset", animationTime: 180 }}
        zoomAnimation={{ animationTime: 180, animationType: "easeOut" }}
        alignmentAnimation={{ animationTime: 180, velocityAlignmentTime: 220 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="absolute right-2 top-2 z-20 flex items-center border bg-background/90 shadow-sm">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Zoom out preview"
                onClick={() => zoomOut(0.3)}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Zoom in preview"
                onClick={() => zoomIn(0.3)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Reset preview view"
                onClick={() => resetTransform()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              {onExpand ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Expand preview"
                  onClick={onExpand}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <TransformComponent
              wrapperClass="!h-full !w-full"
              contentClass="!h-full !w-full"
            >
              {children}
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
