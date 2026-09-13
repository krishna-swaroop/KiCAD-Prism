import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import type { PanelComponent, PanelSupplySource } from "@/panel/lib/panel-api";
import { getComponent, getInlineBundle, getPartManifest } from "@/panel/lib/panel-api";
import { hasSession, sendRpcCommand } from "@/panel/lib/kicad-bridge";
import { formatPlacementError } from "@/panel/lib/panel-placement";
import { LibraryPreviewPair } from "@/components/workspace/library-preview-inspector";
import { cn } from "@/lib/utils";
import { inventoryWarnings } from "@/lib/inventory-presentation";

interface PartDetailScreenProps {
  componentId: string;
  /** If the component was already loaded (from a list), pass it to avoid re-fetch */
  prefetched?: PanelComponent | null;
  onBack: () => void;
  appendLog: (msg: string) => void;
}

const CORE_PARAMETERS = [
  { label: "Value", key: "name" },
  { label: "MPN", key: "mpn" },
  { label: "Manufacturer", key: "manufacturer" },
  { label: "Package", key: "package_name" },
] as const;

const EXTENDED_PARAMETERS = [
  { label: "Category", key: "category" },
  { label: "Library", key: "library_name" },
  { label: "Symbol Name", key: "symbol_name" },
  { label: "Version", key: "version" },
  { label: "Availability", key: "availability_state" },
] as const;

function formatAvailability(state: string): string {
  if (state === "place_ready") return "CAD complete";
  if (state === "files_partial") return "Files partial";
  return "Metadata only";
}

function formatAsOf(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

function formatPrice(value: number, currency?: string): string {
  return `${currency ? currency + " " : ""}${value.toFixed(value < 1 ? 3 : 2)}`;
}

// react-doctor-disable-next-line no-giant-component - detail panel whose sections share one part resource
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
  const [placementError, setPlacementError] = useState<string | null>(null);
  const placingRef = useRef(false);
  const [representationId, setRepresentationId] = useState("");

  // Fetch full component details. List screens pass a slim payload, so detail
  // refreshes the component before previews/assets are shown.
  useEffect(() => {
    const controller = new AbortController();
    getComponent(componentId, controller.signal)
      .then((c) => {
        if (!controller.signal.aborted) {
          setComponent(c);
          setRepresentationId(c.default_representation_id || c.representations[0]?.id || "");
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

  async function runPlacement(path: "manifest" | "inline") {
    if (!component || !hasSession()) {
      appendLog("Cannot place: no session or component.");
      return;
    }
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    setPlacementError(null);
    try {
      if (path === "manifest") {
        const manifest = await getPartManifest(component.id, representationId);
        await sendRpcCommand("PLACE_COMPONENT", manifest as Record<string, unknown>);
        appendLog(`Placed ${component.name} via manifest.`);
      } else {
        const bundle = (await getInlineBundle(component.id, representationId)) as Record<
          string,
          unknown
        >;
        await sendRpcCommand(
          "PLACE_COMPONENT",
          {
            library: bundle.library,
            symbol_name: bundle.symbol_name,
            compression: bundle.compression,
          },
          (bundle.data as string) || "",
        );
        appendLog(`Placed ${component.name} via inline bundle.`);
      }
    } catch (err) {
      const message = formatPlacementError(err);
      setPlacementError(message);
      appendLog(message);
    } finally {
      placingRef.current = false;
      setPlacing(false);
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
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const selectedRepresentation =
    component.representations.find((r) => r.id === representationId) ||
    component.representations.find((r) => r.is_default) ||
    null;
  const selectedComplete = Boolean(
    selectedRepresentation?.symbol && selectedRepresentation?.footprint
  );
  const canPlace =
    component.place_enabled && selectedComplete && component.identity_kind === "mpn";

  const sources = component.supply?.sources ?? [];
  const vendorSources = sources.filter((s) => s.kind === "vendor");
  const localSources = sources.filter((s) => s.kind === "local");
  const symbolAssetId = selectedRepresentation?.symbol?.id;
  const footprintAssetId = selectedRepresentation?.footprint?.id;
  const symbolMeta = selectedRepresentation?.symbol
    ? `${selectedRepresentation.symbol.target_library}:${selectedRepresentation.symbol.target_name}`
    : `${component.library_name}:${component.symbol_name}`;

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* ── Header Row ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon-xs" onClick={onBack} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Details
        </span>
        <div className="ml-auto flex items-center gap-1">
          {canPlace && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="More actions" disabled={placing}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void runPlacement("inline")} disabled={placing}>
                  {placing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Inline Fallback
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Part identity ──────────────────────────────────────── */}
      <div className="px-0.5">
        <h2 className="break-all text-base font-bold leading-tight text-primary">
          {component.name}
        </h2>
        <p className="mt-0.5 text-xs text-foreground/80">
          {component.manufacturer || "Unknown Manufacturer"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {component.description || component.summary || "No description."}
        </p>
      </div>

      {/* ── PART ───────────────────────────────────────────────── */}
      <Section label="Part">
        <ParameterTable
          rows={[
            ...CORE_PARAMETERS.map((p) => ({
              ...p,
              value: String((component as unknown as Record<string, unknown>)[p.key] ?? ""),
              truncate: false,
            })),
            ...(showAllParams
              ? EXTENDED_PARAMETERS.map((p) => ({
                  ...p,
                  value:
                    p.key === "availability_state"
                      ? formatAvailability(
                          String((component as unknown as Record<string, unknown>)[p.key] ?? "")
                        )
                      : String((component as unknown as Record<string, unknown>)[p.key] ?? ""),
                  truncate: false,
                }))
              : []),
          ]}
        />
        <button
          onClick={() => setShowAllParams((s) => !s)}
          className="flex w-full items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-primary hover:underline"
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
      </Section>

      {/* ── Provisional warning ────────────────────────────────── */}
      {component.identity_kind === "provisional_ipn" && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          Provisional part: add a real manufacturer and MPN before release or placement.
        </div>
      )}

      {/* ── PREVIEW ────────────────────────────────────────────── */}
      {selectedRepresentation && (
        <Section label="Preview">
          <Select value={representationId} onValueChange={setRepresentationId}>
            <SelectTrigger className="mb-2 h-8 text-xs" aria-label="Representation">
              <SelectValue placeholder="Select a representation" />
            </SelectTrigger>
            <SelectContent>
              {component.representations.map((representation) => (
                <SelectItem
                  key={representation.id}
                  value={representation.id}
                  disabled={!representation.symbol || !representation.footprint}
                >
                  {representation.label}
                  {representation.is_default ? " · Default" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <LibraryPreviewPair
            key={`${symbolAssetId ?? "-"}:${footprintAssetId ?? "-"}`}
            label={component.name}
            symbolAssetId={symbolAssetId}
            footprintAssetId={footprintAssetId}
            source="panel"
            compact
            stacked
            symbolMeta={`${symbolMeta} · Rev.${component.version}`}
            footprintMeta={selectedRepresentation.footprint?.target_name || component.package_name || "—"}
          />
        </Section>
      )}

      {/* ── Missing assets ─────────────────────────────────────── */}
      {component.missing_assets.length > 0 && (
        <div className="rounded border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
          Missing:{" "}
          {component.missing_assets.map((a) => (
            <Badge key={a} variant="destructive" className="ml-1 text-[9px]">
              {a}
            </Badge>
          ))}
        </div>
      )}

      {/* ── AVAILABILITY ───────────────────────────────────────── */}
      <Section
        label="Availability"
        action={
          vendorSources.length > 0 ? (
            <button
              aria-label="Refresh availability"
              title="Refresh availability"
              className="text-muted-foreground transition-colors hover:text-primary"
              onClick={() => appendLog("Vendor refresh is not configured yet.")}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          ) : null
        }
      >
        {sources.length === 0 ? (
          <p className="px-0.5 py-1 text-[11px] leading-snug text-muted-foreground">
            No availability data.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sources.map((source) => (
              <AvailabilityCard key={source.id} source={source} />
            ))}
          </div>
        )}
        {!localSources.length && (
          <p className="mt-1 px-0.5 text-[10px] text-muted-foreground/70">
            Local stock not recorded.
          </p>
        )}
      </Section>

      {/* ── Sticky action bar ──────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 -mx-3 mt-auto border-t bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2">
          {component.datasheet_url ? (
            <a
              href={component.datasheet_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open datasheet"
              className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
            >
              <FileText data-icon="inline-start" className="h-4 w-4" />
              Datasheet
            </a>
          ) : (
            <Button variant="outline" disabled className="shrink-0" aria-label="No datasheet">
              <FileText data-icon="inline-start" className="h-4 w-4" />
              Datasheet
            </Button>
          )}
          <Button className="min-w-0 flex-1" onClick={() => void runPlacement("manifest")} disabled={!canPlace || placing}>
            {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {canPlace ? "Place" : "Unavailable"}
          </Button>
        </div>
        {placementError ? (
          <p className="text-[10px] text-destructive" role="alert">
            {placementError}
          </p>
        ) : null}
      </div>

    </div>
  );
}

// ─── Section shell ─────────────────────────────────────────────────

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between px-0.5 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Parameters ────────────────────────────────────────────────────

function ParameterTable({
  rows,
}: {
  rows: { label: string; value: string; truncate?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded border border-border/50">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-3 px-2.5 py-1.5 text-xs ${
            i > 0 ? "border-t border-border/30" : ""
          }`}
        >
          <span className="shrink-0 text-muted-foreground">{row.label}</span>
          <span
            className={cn("text-right font-medium", row.truncate ? "line-clamp-1" : "break-all")}
          >
            {row.value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Availability cards ────────────────────────────────────────────

function AvailabilityCard({ source }: { source: PanelSupplySource }) {
  const isVendor = source.kind === "vendor";
  const mixedUnits = Boolean(source.mixed_units);
  const warnings = inventoryWarnings(source);
  const uncertain = warnings.length > 0;
  const asOf = formatAsOf(source.fetched_at);
  const breaks = isVendor ? (source.price_breaks ?? []) : [];
  const inStock = !uncertain && source.stock > 0;
  const plentiful = inStock && source.stock > 100;
  const dotTone =
    uncertain ? "bg-muted-foreground/40" : plentiful ? "bg-emerald-500" : inStock ? "bg-amber-400" : "bg-red-500";
  const qtyTone = uncertain || inStock ? "text-foreground" : "text-muted-foreground";
  // Soft badge tones mirror the dot: plentiful emerald, scarce amber, none red.
  const statusTone = uncertain
    ? "border-border bg-secondary/40 text-muted-foreground"
    : plentiful
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : inStock
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : "border-red-500/30 bg-red-500/10 text-red-400";
  const statusLabel = uncertain ? warnings.join(" · ") : source.stock_status
    ? source.stock_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div className="rounded-md border border-border/60 bg-secondary/20">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone)} />
        <span className="truncate text-xs font-medium">{source.display_name}</span>
        {isVendor && source.product_url ? (
          <a
            href={source.product_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${source.display_name} product page`}
            className="shrink-0 text-muted-foreground/70 transition-colors hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {asOf ? (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
            {source.mixed_freshness ? "Latest location update" : "Updated"} {asOf}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 px-3 pb-3 pt-1">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {warnings.includes("Sync failed") ? "Last known on hand" : "On hand"}
          </div>
          <div
            className={cn(
              "mt-1.5 text-lg font-semibold leading-none tabular-nums",
              qtyTone
            )}
          >
            {mixedUnits ? (
              "Mixed units"
            ) : (
              <>
                {formatQuantity(source.stock)}
                {source.uom ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{source.uom}</span>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {statusLabel ? (
            <Badge variant="outline" className={cn("max-w-full whitespace-normal", statusTone)}>
              {statusLabel}
            </Badge>
          ) : null}
          {isVendor && source.unit_price != null ? (
            <div className="text-right">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Unit{source.price_break_qty ? ` @ ${formatQuantity(source.price_break_qty)}` : ""}
              </div>
              <div className="mt-1.5 text-lg font-semibold leading-none tabular-nums">
                {formatPrice(source.unit_price, source.currency)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {breaks.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/40 px-3 py-2">
          {breaks.map((brk) => (
            <div key={brk.qty} className="flex items-baseline justify-between text-[10px]">
              <span className="tabular-nums text-muted-foreground">{formatQuantity(brk.qty)}+</span>
              <span className="font-medium tabular-nums">{formatPrice(brk.price, source.currency)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Constructing an Intl formatter is the expensive part; the runtime locale
// cannot change mid-session, so build it once.
const QUANTITY_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatQuantity(value: number): string {
  if (value >= 10000) {
    const k = value / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return QUANTITY_FORMAT.format(value);
}
