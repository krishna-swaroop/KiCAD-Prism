/**
 * Panel API client — typed fetch helpers for the remote-provider endpoints.
 */

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

export interface PanelSupply {
  sources: PanelSupplySource[];
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

export class PanelApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PanelApiError";
    this.status = status;
  }
}

let apiToken: string | null = null;

export function setApiToken(token: string | null) {
  apiToken = token;
}

async function panelFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {};
  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`;
  }
  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", headers, signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new PanelApiError(0, `Network error: ${(err as Error).message}`);
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      detail = payload.detail || payload.message || detail;
    } catch {
      /* ignore */
    }
    throw new PanelApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export function isAuthError(err: unknown): boolean {
  return err instanceof PanelApiError && (err.status === 401 || err.status === 403);
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
  representationId = ""
): Promise<PanelComponent> {
  const params = new URLSearchParams();
  if (representationId) params.set("representation", representationId);
  const query = params.toString();
  return panelFetch<PanelComponent>(
    `/api/remote-provider/components/${componentId}${query ? `?${query}` : ""}`,
    signal
  );
}

export async function getPartManifest(
  partId: string,
  representationId = "",
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const query = representationId ? `?representation=${encodeURIComponent(representationId)}` : "";
  return panelFetch<Record<string, unknown>>(
    `/api/remote-provider/parts/${partId}${query}`, signal,
  );
}

export async function getInlineBundle(
  componentId: string,
  representationId = "",
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const query = representationId ? `?representation=${encodeURIComponent(representationId)}` : "";
  return panelFetch<Record<string, unknown>>(
    `/api/remote-provider/components/${componentId}/inline${query}`, signal,
  );
}
