import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import type { PanelComponent } from "@/panel/lib/panel-api";
import { getComponent } from "@/panel/lib/panel-api";
import {
  sendRpcCommand,
  retry,
  hasSession,
} from "@/panel/lib/kicad-bridge";
import {
  getPartManifest,
  getInlineBundle,
} from "@/panel/lib/panel-api";

interface PartDetailScreenProps {
  componentId: string;
  /** If the component was already loaded (from a list), pass it to avoid re-fetch */
  prefetched?: PanelComponent | null;
  onBack: () => void;
  appendLog: (msg: string) => void;
}

const PARAMETER_ORDER = [
  { label: "Value", key: "name" },
  { label: "Manufacturer", key: "manufacturer" },
  { label: "MPN", key: "mpn" },
  { label: "Package", key: "package_name" },
  { label: "Category", key: "category" },
  { label: "Library", key: "library_name" },
  { label: "Symbol Name", key: "symbol_name" },
  { label: "Version", key: "version" },
  { label: "Availability", key: "availability_state" },
];

function formatAvailability(state: string): string {
  if (state === "place_ready") return "CAD complete";
  if (state === "files_partial") return "Files partial";
  return "Metadata only";
}

export function PartDetailScreen({
  componentId,
  prefetched,
  onBack,
  appendLog,
}: PartDetailScreenProps) {
  const [component, setComponent] = useState<PanelComponent | null>(
    prefetched ?? null
  );
  const [loading, setLoading] = useState(!prefetched);
  const [showAllParams, setShowAllParams] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placingInline, setPlacingInline] = useState(false);

  // Fetch full component details. List screens pass a slim payload, so detail
  // refreshes the component before previews/assets are shown.
  useEffect(() => {
    const controller = new AbortController();
    getComponent(componentId, controller.signal)
      .then((c) => {
        if (!controller.signal.aborted) {
          setComponent(c);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          appendLog(`Failed to load component: ${(err as Error).message}`);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [componentId, prefetched, appendLog]);

  // ─── Place via manifest ────────────────────────────────────────

  async function handlePlace() {
    if (!component || !hasSession()) {
      appendLog("Cannot place: no session or component.");
      return;
    }
    setPlacing(true);
    try {
      const manifest = await getPartManifest(component.id);
      await retry(async () => {
        await sendRpcCommand(
          "PLACE_COMPONENT",
          manifest as Record<string, unknown>
        );
      });
      appendLog(`Placed ${component.name} via manifest.`);
    } catch (err) {
      appendLog(`Placement failed: ${(err as Error).message}`);
    } finally {
      setPlacing(false);
    }
  }

  // ─── Place via inline ──────────────────────────────────────────

  async function handleInline() {
    if (!component || !hasSession()) {
      appendLog("Cannot place: no session or component.");
      return;
    }
    setPlacingInline(true);
    try {
      const bundle = (await getInlineBundle(component.id)) as Record<
        string,
        unknown
      >;
      await retry(async () => {
        await sendRpcCommand(
          "PLACE_COMPONENT",
          {
            library: bundle.library,
            symbol_name: bundle.symbol_name,
            compression: bundle.compression,
          },
          (bundle.data as string) || ""
        );
      });
      appendLog(`Placed ${component.name} via inline bundle.`);
    } catch (err) {
      appendLog(`Inline placement failed: ${(err as Error).message}`);
    } finally {
      setPlacingInline(false);
    }
  }

  // ─── Loading state ─────────────────────────────────────────────

  if (loading || !component) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-64" />
        <Separator />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const visibleParams = showAllParams
    ? PARAMETER_ORDER
    : PARAMETER_ORDER.slice(0, 5);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header Row ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onBack}
          className="mt-0.5 shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-medium text-muted-foreground">
              Details
            </span>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] text-muted-foreground border-border/50 bg-secondary/20 font-medium"
            >
              Stock N/A
            </Badge>
          </div>
        </div>
      </div>

      {/* ── Part Identity ──────────────────────────────────────── */}
      <div className="px-1">
        <h2 className="break-all text-base font-bold leading-tight text-primary">
          {component.name}
        </h2>
        <p className="mt-0.5 text-xs text-foreground/80">
          {component.manufacturer || "Unknown Manufacturer"}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {component.description || component.summary || "No description."}
        </p>
      </div>

      {/* ── Action Buttons ─────────────────────────────────────── */}
      <div className="flex gap-2 px-1">
        {component.datasheet_url && (
          <a
            href={component.datasheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" }) + " flex-1"}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="pointer-events-none flex items-center gap-1.5">
              <ExternalLink data-icon="inline-start" className="h-3 w-3" />
              Datasheet
            </span>
          </a>
        )}
        <Button
          size="sm"
          className="flex-1"
          onClick={handlePlace}
          disabled={!component.place_enabled || placing}
        >
          {placing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download data-icon="inline-start" className="h-3 w-3" />
          )}
          {component.place_enabled ? "Place" : "Unavailable"}
        </Button>
      </div>
      {component.place_enabled && (
        <div className="px-1">
          <Button
            variant="outline"
            size="xs"
            className="w-full text-[10px]"
            onClick={handleInline}
            disabled={placingInline}
          >
            {placingInline ? (
              <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
            ) : null}
            Inline Fallback
          </Button>
        </div>
      )}

      <Separator />

      {/* ── Parameters Table ───────────────────────────────────── */}
      <div className="px-1">
        <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Parameters
        </p>
        <div className="overflow-hidden rounded border border-border/50">
          {visibleParams.map((param, i) => {
            const rawVal =
              (component as unknown as Record<string, unknown>)[param.key] ?? "";
            const val =
              param.key === "availability_state"
                ? formatAvailability(String(rawVal))
                : String(rawVal) || "—";
            return (
              <div
                key={param.key}
                className={`flex items-baseline justify-between gap-3 px-2.5 py-1.5 text-xs ${
                  i > 0 ? "border-t border-border/30" : ""
                }`}
              >
                <span className="shrink-0 text-muted-foreground">
                  {param.label}
                </span>
                <span className="truncate text-right font-medium">{val}</span>
              </div>
            );
          })}
        </div>
        {PARAMETER_ORDER.length > 5 && (
          <button
            onClick={() => setShowAllParams((s) => !s)}
            className="mt-1 flex w-full items-center justify-center gap-1 py-1 text-[10px] font-medium text-primary hover:underline"
          >
            {showAllParams ? (
              <>
                Show Less <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show More <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      <Separator />

      {/* ── Models / Previews ──────────────────────────────────── */}
      <div className="px-1">
        <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Models
        </p>

        {/* Symbol preview */}
        <PreviewCard
          label="Symbol"
          status={component.preview_status?.symbol?.status}
          url={component.symbol_preview_url}
          meta={`${component.library_name}:${component.symbol_name}`}
          version={component.version}
        />

        {/* Footprint preview */}
        <PreviewCard
          label="Footprint"
          status={component.preview_status?.footprint?.status}
          url={component.footprint_preview_url}
          meta={component.package_name || "—"}
        />
      </div>

      {/* ── Assets List ────────────────────────────────────────── */}
      {component.assets.length > 0 && (
        <>
          <Separator />
          <div className="px-1">
            <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Attached Assets
            </p>
            <div className="space-y-1">
              {component.assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 rounded bg-secondary/40 px-2.5 py-1.5 text-[11px]"
                >
                  <Badge variant="outline" className="text-[9px]">
                    {asset.asset_type}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-foreground/80">
                    {asset.target_name || asset.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Missing Assets Warning ─────────────────────────────── */}
      {component.missing_assets.length > 0 && (
        <div className="mx-1 rounded border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
          Missing:{" "}
          {component.missing_assets.map((a) => (
            <Badge key={a} variant="destructive" className="ml-1 text-[9px]">
              {a}
            </Badge>
          ))}
        </div>
      )}

      {/* ── Stock Detail ───────────────────────────────────────── */}
      <Separator />
      <div className="px-1 pb-2">
        <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Stock Status
        </p>
        <div className="flex gap-2">
          <Badge
            variant={component.stock_quantity > 0 ? "default" : "destructive"}
            className={`text-[10px] ${
              component.stock_quantity > 0 ? "bg-emerald-600/90 text-white" : ""
            }`}
          >
            {component.stock_quantity > 0 ? "In Stock" : "Out of Stock"}
          </Badge>
          {component.stock_quantity > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              Qty: {component.stock_quantity}
              {component.stock_uom ? ` ${component.stock_uom}` : ""}
            </Badge>
          )}
          {component.inventory_status && (
            <Badge variant="outline" className="text-[10px]">
              {component.inventory_status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Preview Card ──────────────────────────────────────────────────

interface PreviewCardProps {
  label: string;
  status?: string;
  url?: string;
  meta?: string;
  version?: string;
}

function PreviewCard({ label, status, url, meta, version }: PreviewCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const isReady = status === "ready" && !!url;

  return (
    <div className="mb-2 overflow-hidden rounded border border-border/50">
      {/* Preview image — light background for SVGs */}
      <div className="relative flex min-h-[120px] items-center justify-center bg-preview-surface">
        {isReady && !error ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
              </div>
            )}
            <img
              src={url}
              alt={`${label} preview`}
              className={`max-h-[160px] w-full object-contain p-2 transition-opacity ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">
            {status === "failed"
              ? `${label} preview failed`
              : `No ${label.toLowerCase()} preview`}
          </span>
        )}
      </div>
      {/* Meta row */}
      <div className="flex items-center justify-between border-t border-border/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <span className="truncate">{meta || label}</span>
        {version && <span>Rev.{version}</span>}
      </div>
    </div>
  );
}
