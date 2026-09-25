import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  assetContentUrl,
  loadAssetText,
  loadEcadRenderer,
  symbolUnitCount,
  type AssetSource,
  type RenderController,
  type RenderHandle,
  type RenderNavigationOptions,
} from "@/lib/ecad-renderer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { useLibraryCrossProbe } from "./library-cross-probe";

/**
 * Wheel is left to the page so a preview embedded in a scrolling column -- the
 * narrow remote-provider panel is one -- does not swallow the scroll; zoom is
 * reached with the modifier, the buttons, or the expanded view. Dragging is how
 * a viewer is panned everywhere else in the product, so it is on in both.
 * Single-finger touch pan stays off for the same reason wheel zoom does.
 */
export const EMBEDDED_PREVIEW_NAVIGATION: RenderNavigationOptions = {
  wheel: "modifier",
  pinch: false,
  touchPan: false,
  drag: true,
};

export const EXPANDED_PREVIEW_NAVIGATION: RenderNavigationOptions = {
  wheel: "direct",
  pinch: true,
  touchPan: false,
  drag: true,
};

/**
 * Live symbol and footprint previews.
 *
 * These replace stored SVG renders. The catalog already keeps the `.kicad_sym`
 * and `.kicad_mod` files, and they are smaller than the SVG a headless KiCad
 * produced from them, because `kicad-cli` inlines every stroke-font glyph as
 * path data. Drawing from the source instead is less to store, less to send,
 * and -- the reason this exists -- something a reviewer can zoom into rather
 * than a flat image.
 *
 * Loading lives in `lib/ecad-renderer`; this component owns only the canvas.
 * A multi-unit part's tab strip belongs to whoever owns the surrounding
 * chrome: it reports the unit count and takes the selected unit back as a
 * prop, so the strip is laid out and themed with the rest of the frame rather
 * than sitting on the preview's own white canvas ground.
 */

export function LibraryAssetRenderer({
  assetId,
  kind,
  label,
  source = "catalog",
  className,
  onUnitsChange,
  unit = 1,
  navigation = EMBEDDED_PREVIEW_NAVIGATION,
  onControllerChange,
  loadAsset = loadAssetText,
}: {
  assetId: string;
  kind: "symbol" | "footprint";
  label: string;
  source?: AssetSource;
  className?: string;
  /** Reports the symbol's unit count so the parent can render its tabs. */
  onUnitsChange?: (units: number) => void;
  /** Which unit of a multi-unit symbol to draw. Defaults to the first. */
  unit?: number;
  navigation?: RenderNavigationOptions;
  onControllerChange?: (controller: RenderController | null) => void;
  loadAsset?: (url: string) => Promise<string>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedRef = useRef<RenderHandle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const crossProbe = useLibraryCrossProbe();
  const registerProbe = crossProbe?.register;
  const handleProbe = crossProbe?.handleProbe;

  const url = useMemo(
    () => assetContentUrl(source, assetId),
    [assetId, source],
  );

  useEffect(() => {
    // A superseded render must not paint over a newer one, and the canvas
    // it drew into may already be gone. Every await below is followed by a
    // cancellation check for that reason.
    let cancelled = false;
    let unregisterProbe: (() => void) | undefined;
    setState("loading");

    (async () => {
      let nextHandle: RenderHandle | null = null;
      try {
        const [renderer, text] = await Promise.all([
          loadEcadRenderer(),
          loadAsset(url),
        ]);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Disposing before the next render releases the previous
        // viewer's resources -- for a footprint that is a WebGL
        // context, and browsers evict the oldest once about a dozen
        // are live.
        renderedRef.current?.dispose();
        renderedRef.current = null;

        if (kind === "symbol") {
          const symbols = renderer.parseSymbolLibrary(text);
          const symbol = symbols[0];
          if (!symbol) throw new Error("The library file has no symbol");
          onUnitsChange?.(symbolUnitCount(symbol));
          nextHandle = await renderer.renderSymbol(symbol, {
            canvas,
            selectable: true,
            navigation,
            onProbe: handleProbe,
            unit,
          });
        } else {
          onUnitsChange?.(1);
          nextHandle = await renderer.renderFootprint(
            renderer.parseFootprint(text),
            { canvas, selectable: true, navigation, onProbe: handleProbe },
          );
        }
        if (cancelled) {
          // Keep the handle local until this effect is known to be current.
          // Otherwise a late render can overwrite the newer effect's handle,
          // dispose itself, and leave the newer WebGL context alive but
          // unreachable at unmount.
          nextHandle.dispose();
          return;
        }
        renderedRef.current = nextHandle;
        unregisterProbe = registerProbe?.(kind, nextHandle.controller);
        onControllerChange?.(nextHandle.controller);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : String(error));
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      unregisterProbe?.();
      onControllerChange?.(null);
    };
  }, [
    url,
    kind,
    unit,
    navigation,
    handleProbe,
    registerProbe,
    onUnitsChange,
    onControllerChange,
    loadAsset,
    retryNonce,
  ]);

  // Unmount is the only place the last render is torn down; the effect above
  // deliberately keeps it alive across re-renders so the canvas is not
  // cleared between a dispose and the next paint.
  useEffect(
    () => () => {
      renderedRef.current?.dispose();
      renderedRef.current = null;
    },
    [],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={cn("relative min-h-0 flex-1", className)}>
        <canvas
          ref={canvasRef}
          aria-label={`${label} ${kind} preview`}
          className={cn("h-full w-full", state === "ready" ? "" : "invisible")}
        />
        {state === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {state === "error" ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
            <span>{message || `Could not render this ${kind}`}</span>
            <Button variant="outline" size="sm" onClick={() => setRetryNonce((nonce) => nonce + 1)}>
              Retry {kind} preview
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
