import { useEffect, useRef, useState, useCallback } from "react";
import JSZip from "jszip";
import { Eye, EyeOff, Maximize2 } from "lucide-react";
import { loadGerberLayers, unionViewBox } from "@/lib/gerber/load";
import { svgToImage } from "@/lib/gerber/svg-image";
import type { GerberLayer, GerberSide } from "@/lib/gerber/types";

interface GerberViewerProps {
  projectId: string;
}

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// gerber-to-svg SVGs have Y flipped internally. In draw-space the board
// occupies [boardX, 0, boardW, boardH] regardless of the gerber Y origin.
function gerberToDrawBox(
  vb: [number, number, number, number],
): [number, number, number, number] {
  const [bx, , bw, bh] = vb;
  return [bx, 0, bw, bh];
}

function fitTransform(
  viewBox: [number, number, number, number],
  canvasW: number,
  canvasH: number,
  padding = 24,
): Transform {
  const [vx, vy, vw, vh] = viewBox;
  if (vw === 0 || vh === 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(
    (canvasW - padding * 2) / vw,
    (canvasH - padding * 2) / vh,
  );
  const offsetX = (canvasW - vw * scale) / 2 - vx * scale;
  const offsetY = (canvasH - vh * scale) / 2 - vy * scale;
  return { scale, offsetX, offsetY };
}

function layerVisible(layerSide: GerberSide, viewSide: "top" | "bottom"): boolean {
  if (layerSide === "all" || layerSide === null) return true;
  return layerSide === viewSide;
}

export function GerberViewer({ projectId }: GerberViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<GerberLayer[]>([]);
  const [layerVis, setLayerVis] = useState<Record<string, boolean>>({});
  const [side, setSide] = useState<"top" | "bottom">("top");
  const [transform, setTransform] = useState<Transform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardViewBox = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const isDragging = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLayers([]);
    setLayerVis({});

    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/gerbers`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const blob = await res.blob();
        const zip = await JSZip.loadAsync(blob);
        const zipEntries = Object.keys(zip.files).filter(k => !zip.files[k].dir);

        const files: Record<string, string> = {};
        await Promise.all(zipEntries.map(async (name) => {
          files[name] = await zip.files[name].async("string");
        }));

        const loaded = await loadGerberLayers(files);
        if (cancelled) return;

        const withImages = await Promise.all(loaded.map(async (layer) => {
          try {
            return { ...layer, image: await svgToImage(layer.svg) };
          } catch {
            return layer;
          }
        }));
        if (cancelled) return;

        const vb = unionViewBox(withImages);
        boardViewBox.current = vb;
        setLayers(withImages);
        setLayerVis(Object.fromEntries(withImages.map((l) => [l.id, true])));

        const canvas = canvasRef.current;
        if (canvas) {
          setTransform(fitTransform(gerberToDrawBox(vb), canvas.clientWidth, canvas.clientHeight));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    if (layers.length === 0) return;

    const t = transform;
    const [, boardY, , boardH] = boardViewBox.current;

    for (const layer of layers) {
      if (!layerVis[layer.id]) continue;
      if (!layerVisible(layer.side, side)) continue;
      if (!layer.image) continue;

      const [vx, vy, vw, vh] = layer.viewBox;
      const sx = vx * t.scale + t.offsetX;
      const sy = (boardY + boardH - vy - vh) * t.scale + t.offsetY;
      const sw = vw * t.scale;
      const sh = vh * t.scale;

      ctx.save();
      if (side === "bottom") {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(layer.image, sx, sy, sw, sh);
      ctx.restore();
    }
  }, [layers, layerVis, side, transform]);

  // ── Pan / zoom ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTransform((prev) => ({
      scale: prev.scale * factor,
      offsetX: mx - (mx - prev.offsetX) * factor,
      offsetY: my - (my - prev.offsetY) * factor,
    }));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging.current || !lastPointer.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    // Bottom view mirrors X, so pan direction must be flipped on that axis
    const xDir = side === "bottom" ? -1 : 1;
    setTransform((prev) => ({ ...prev, offsetX: prev.offsetX + dx * xDir, offsetY: prev.offsetY + dy }));
  }, [side]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    lastPointer.current = null;
  }, []);

  const handleFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTransform(fitTransform(gerberToDrawBox(boardViewBox.current), canvas.clientWidth, canvas.clientHeight));
  }, []);

  // ── Layer controls ─────────────────────────────────────────────────────────
  const toggleLayer = useCallback((id: string) => {
    setLayerVis((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const soloLayer = useCallback((id: string) => {
    setLayerVis((prev) => {
      // If already in solo mode for this layer, restore all to visible
      const isSoloed = layers.every((l) => prev[l.id] === (l.id === id));
      if (isSoloed) return Object.fromEntries(layers.map((l) => [l.id, true]));
      return Object.fromEntries(layers.map((l) => [l.id, l.id === id]));
    });
  }, [layers]);

  const showAll = useCallback(() => {
    setLayerVis(() => Object.fromEntries(layers.map((l) => [l.id, true])));
  }, [layers]);

  const hideAll = useCallback(() => {
    setLayerVis(() => Object.fromEntries(layers.map((l) => [l.id, false])));
  }, [layers]);

  const sidebarLayers = layers.filter(
    (l) => l.side === side || l.side === "all" || l.side === null,
  );

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Sidebar — left */}
      <div className="w-52 flex-none border-r border-border flex flex-col bg-background">
        {/* Side + Fit controls */}
        <div className="px-2 py-2 border-b border-border flex items-center gap-1.5">
          <button
            onClick={() => setSide("top")}
            className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${
              side === "top"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted"
            }`}
          >
            Top
          </button>
          <button
            onClick={() => setSide("bottom")}
            className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${
              side === "bottom"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted"
            }`}
          >
            Bottom
          </button>
          <button
            onClick={handleFit}
            title="Fit to view"
            className="p-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Maximize2 size={12} />
          </button>
        </div>

        {/* Layer list header */}
        <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Layers
          </span>
          <div className="flex gap-1">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={showAll}
              title="Show all"
            >
              <Eye size={12} />
            </button>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={hideAll}
              title="Hide all"
            >
              <EyeOff size={12} />
            </button>
          </div>
        </div>

        {/* Layer rows */}
        <div className="flex-1 overflow-y-auto py-1">
          {sidebarLayers.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No layers for this side
            </p>
          )}
          {sidebarLayers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted group"
            >
              <span
                className="w-2.5 h-2.5 rounded-sm flex-none border border-border/60"
                style={{ backgroundColor: layer.color }}
              />
              {/* Clicking label toggles visibility */}
              <span
                className={`flex-1 text-xs truncate cursor-pointer select-none ${
                  layerVis[layer.id]
                    ? "text-foreground"
                    : "text-muted-foreground line-through"
                }`}
                onClick={() => toggleLayer(layer.id)}
                title={layer.label}
              >
                {layer.label}
              </span>
              {/* Eye icon solos the layer */}
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                onClick={() => soloLayer(layer.id)}
                title="Solo this layer"
              >
                <Eye size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-10">
            Loading gerber files…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm z-10 px-8 text-center">
            {error}
          </div>
        )}
        {!loading && !error && layers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-10">
            No gerber layers found
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    </div>
  );
}
