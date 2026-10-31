/**
 * Panel API client — typed fetch helpers for the remote-provider endpoints.
 */

import { ApiHttpError, apiErrorFrom } from "@/lib/api";
import { loadAssetText, type AssetTextRequest } from "@/lib/ecad-renderer";
import { normalizePanelPageSize, PANEL_PAGE_SIZE } from "@/panel/lib/panel-page";

export interface PanelComponent {
  id: string;
  slug: string;
  name: string;
  identity_kind: "mpn" | "provisional_ipn";
  manufacturer: string;
  mpn: string;
  description: string;
  package_name: string;
  category: string;
  datasheet_url: string;
  summary: string;
  version: string;
  library_name: string;
  symbol_name: string;
  assets: PanelAsset[];
  availability_state: "metadata_only" | "files_partial" | "place_ready";
  missing_assets: string[];
  place_enabled: boolean;
  supply?: PanelSupply;
  representations: PanelRepresentation[];
  default_representation_id: string;
  effective_representation_id: string;
  preview_status: Record<string, { status: string; error: string }>;
  symbol_preview_url: string;
  footprint_preview_url: string;
  manifest_url: string;
  inline_url: string;
  /** The revision this payload describes (provider 0.4.0). */
  revision_id?: string;
  /** Released revisions placement may serve, newest first (detail only, provider 0.4.0). */
  released_revisions?: PanelReleasedRevision[];
}

export interface PanelReleasedRevision {
  revision_id: string;
  version: number;
  released_at: string;
}

/** `?representation=…&revision=…` with only the parts that are set. */
function placementQuery(representationId: string, revisionId: string): string {
  const params = new URLSearchParams();
  if (representationId) params.set("representation", representationId);
  if (revisionId) params.set("revision", revisionId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export interface PanelSupplySource {
  kind: "vendor" | "local";
  id: string;
  display_name: string;
  /** Vendor sources carry pricing; local sources carry quantity + uom. */
  stock: number;
  uom: string;
  stock_status: string;
  fetch_status: string;
  fetched_at: string;
  mixed_units?: boolean;
  mixed_status?: boolean;
  mixed_fetch?: boolean;
  mixed_freshness?: boolean;
  unit_price?: number;
  currency?: string;
  price_break_qty?: number;
  price_breaks?: { qty: number; price: number }[];
  product_url?: string;
}

/** The one-line standing of a component's manufacturer part, from the distributors. Absent when Prism does not track it. */
export interface PanelSupplySummary {
  part_id: string;
  status: "ok" | "warning" | "error" | "fatal" | "unknown";
  stock: number | null;
  distributors: number;
  lifecycle: "active" | "nrnd" | "last_time_buy" | "obsolete" | "unknown";
  unit_price: string | null;
  price_quantity: number;
  currency: string;
  fetched_at: string | null;
  watched: boolean;
}

export interface PanelDistributorOffer {
  connector: string;
  /** The connector's provider key, for its colour. */
  provider?: string;
  sku: string;
  stock: number;
  marketplace: boolean;
  unit_price: string | null;
  currency: string;
  moq: number;
  lead_time_days: number | null;
  product_url: string;
  fetched_at: string | null;
}

export interface PanelSupply {
  /** Inventory sources. Distributor offers are in `offers`. */
  sources: PanelSupplySource[];
  summary?: PanelSupplySummary;
  /** The library marked this component: do not use it in new designs. */
  restriction?: "not_for_new_designs";
  /** Detail only, from here down. */
  offers?: PanelDistributorOffer[];
  health?: { score: number; status: PanelSupplySummary["status"] };
  /** One phrase, rule-based: "No signs of an end", "Warning signs", "Ending"... */
  outlook?: string;
  risks?: string[];
  /** One line on the chance it stays in stock, once Prism's forecasts have earned a place. */
  forecast?: { tone: "ok" | "warning"; text: string } | null;
  links?: { component: string; sourcing: string; supply: string };
}

/** Local inventory row for badges; vendor rows are ignored for on-shelf counts. */
export function primaryLocalSource(component: PanelComponent): PanelSupplySource | null {
  const sources = component.supply?.sources ?? [];
  return (
    sources.find((source) => source.kind === "local") ??
    null
  );
}

export interface PanelRepresentation {
  id: string;
  label: string;
  symbol: (PanelAsset & { preview_id?: string; preview_url?: string }) | null;
  footprint: (PanelAsset & { preview_id?: string; preview_url?: string }) | null;
  is_default: boolean;
  display_order: number;
  source_internal_part_number: string;
}

export interface PanelAsset {
  id: string;
  asset_type: "symbol" | "footprint" | "3dmodel" | "spice";
  name: string;
  target_library: string;
  target_name: string;
  content_type: string;
  required: boolean;
}

export interface PanelCategory {
  name: string;
  count: number;
}

/** The panel's transport error: the shared `ApiHttpError` (status 0 = network failure). */
export class PanelApiError extends ApiHttpError {
  constructor(status: number, message: string, code?: string, payload: Record<string, unknown> = {}) {
    super(status, message, code, payload);
    this.name = "PanelApiError";
  }
}

let apiToken: string | null = null;
let apiTokenGeneration = 0;

export function setApiToken(token: string | null) {
  if (token === apiToken) return;
  apiToken = token;
  apiTokenGeneration += 1;
}

const PANEL_ASSET_PREFIX = "/api/remote-provider/";

/**
 * Fetch options for live preview bytes in the KiCad panel. The bearer token
 * is attached only to same-origin remote-provider URLs.
 */
export function panelAssetTextRequest(url: string): AssetTextRequest {
  const headers: Record<string, string> = {};
  if (apiToken && url.startsWith(PANEL_ASSET_PREFIX)) {
    headers.Authorization = `Bearer ${apiToken}`;
  }
  return {
    authScope: `panel:${apiTokenGeneration}:${apiToken ? "authed" : "anon"}`,
    headers,
    credentials: "include",
  };
}

export function loadPanelAssetText(url: string): Promise<string> {
  return loadAssetText(url, panelAssetTextRequest(url));
}

/**
 * The panel's adapter at the transport seam: a bearer token instead of the
 * session cookie, and no session-expired event (KiCad hosts the panel).
 * Error bodies are read by the shared parser in `@/lib/api`.
 */
async function panelFetch<T>(url: string, signal?: AbortSignal, method = "GET"): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`;
  }
  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", headers, signal, method });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new PanelApiError(0, `Network error: ${(err as Error).message}`);
  }
  if (!response.ok) {
    const error = await apiErrorFrom(response, `Request failed (${response.status})`);
    throw new PanelApiError(error.status, error.message, error.code, error.payload);
  }
  return (await response.json()) as T;
}

export function isAuthError(err: unknown): boolean {
  return err instanceof PanelApiError && (err.status === 401 || err.status === 403);
}

export type PanelLoadFailureKind = "auth" | "not_found" | "failed";

export function classifyPanelLoadFailure(err: unknown): PanelLoadFailureKind {
  if (isAuthError(err)) return "auth";
  if (err instanceof PanelApiError && err.status === 404) return "not_found";
  return "failed";
}

export interface PanelPageResult {
  items: PanelComponent[];
  total: number | null;
  has_more: boolean;
  page: number;
  pages: number | null;
  page_size: number;
}

export interface PanelPageQuery {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

function asPageResult(data: Partial<PanelPageResult>, fallbackPage: number, fallbackSize: number): PanelPageResult {
  return {
    items: data.items ?? [],
    total: data.total ?? null,
    has_more: Boolean(data.has_more),
    page: data.page ?? fallbackPage,
    pages: data.pages ?? null,
    page_size: data.page_size ?? fallbackSize,
  };
}

async function fetchComponentPage(
  endpoint: string,
  params: URLSearchParams,
  query: PanelPageQuery = {},
): Promise<PanelPageResult> {
  const page = query.page ?? 1;
  const pageSize = normalizePanelPageSize(query.pageSize ?? PANEL_PAGE_SIZE);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const data = await panelFetch<Partial<PanelPageResult>>(
    `${endpoint}?${params.toString()}`,
    query.signal,
  );
  return asPageResult(data, page, pageSize);
}

export async function searchComponents(
  query: string,
  pageQuery: PanelPageQuery = {},
): Promise<PanelPageResult> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  return fetchComponentPage("/api/remote-provider/search", params, pageQuery);
}

export async function getCategories(
  signal?: AbortSignal
): Promise<PanelCategory[]> {
  const data = await panelFetch<{ categories: PanelCategory[] }>(
    "/api/remote-provider/categories",
    signal
  );
  return data.categories;
}

export async function getComponentsByCategory(
  category: string,
  pageQuery: PanelPageQuery = {},
): Promise<PanelPageResult> {
  const params = new URLSearchParams({ category });
  return fetchComponentPage("/api/remote-provider/components-by-category", params, pageQuery);
}

export async function getComponent(
  componentId: string,
  signal?: AbortSignal,
  representationId = "",
  revisionId = "",
): Promise<PanelComponent> {
  return panelFetch<PanelComponent>(
    `/api/remote-provider/components/${componentId}${placementQuery(representationId, revisionId)}`,
    signal
  );
}

export interface PanelSupplyRefresh {
  read: number;
  connectors: number;
  problems: Array<{ connector: string; reason: string }>;
}

/** Ask the distributors for a tracked part's stock and price now. Throws a PanelApiError with the reason when it is too soon. */
export function refreshSupplyPart(partId: string): Promise<PanelSupplyRefresh> {
  return panelFetch<PanelSupplyRefresh>(`/api/remote-provider/supply/parts/${encodeURIComponent(partId)}/refresh`, undefined, "POST");
}

export async function getPartManifest(
  partId: string,
  representationId = "",
  signal?: AbortSignal,
  revisionId = "",
): Promise<Record<string, unknown>> {
  return panelFetch<Record<string, unknown>>(
    `/api/remote-provider/parts/${partId}${placementQuery(representationId, revisionId)}`, signal,
  );
}

export async function getInlineBundle(
  componentId: string,
  representationId = "",
  signal?: AbortSignal,
  revisionId = "",
): Promise<Record<string, unknown>> {
  return panelFetch<Record<string, unknown>>(
    `/api/remote-provider/components/${componentId}/inline${placementQuery(representationId, revisionId)}`, signal,
  );
}
