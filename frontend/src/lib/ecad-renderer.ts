import { ECAD_RENDERER_URL } from "@/lib/ecad-renderer-build";

/**
 * Loading side of the live symbol/footprint previews: the renderer bundle and
 * the asset bytes it draws. Kept out of the component so the component's effect
 * only does the imperative canvas work, matching how the rest of the app keeps
 * request helpers in `lib/`.
 */

/** Which API serves asset bytes. The panel and the workspace differ. */
export type AssetSource = "catalog" | "panel";
export type ProbeHighlightState = "hover" | "latched";
export type ProbeKind = "pin" | "pad";
export type ProbeEvent =
  | {
      phase: "hover" | "leave" | "activate";
      source: ProbeKind;
      number: string;
      index: string;
      crossIndex: string;
    }
  | { phase: "clear" };

export interface RenderNavigationOptions {
  wheel: "disabled" | "modifier" | "direct";
  pinch: boolean;
  touchPan: boolean;
  /** Pan by dragging with a mouse or trackpad button held down. */
  drag: boolean;
}

export interface RenderController {
  zoomBy(factor: number): void;
  resetView(): void;
  setProbeHighlight(index: string, state: ProbeHighlightState): number;
  clearProbeHighlight(): void;
}

const CONTENT_URL: Record<AssetSource, (assetId: string) => string> = {
  catalog: (assetId) =>
    `/api/catalog/assets/${encodeURIComponent(assetId)}/content`,
  panel: (assetId) =>
    `/api/remote-provider/assets/${encodeURIComponent(assetId)}/content`,
};

export function assetContentUrl(source: AssetSource, assetId: string): string {
  return CONTENT_URL[source](assetId);
}

export interface RenderHandle {
  controller: RenderController;
  dispose(): void;
}

interface BaseRenderOptions {
  canvas: HTMLCanvasElement;
  selectable?: boolean;
  navigation?: Partial<RenderNavigationOptions>;
  onProbe?: (event: ProbeEvent) => void;
}

export interface EcadRenderer {
  parseSymbolLibrary(text: string): unknown[];
  parseFootprint(text: string): unknown;
  renderSymbol(
    symbol: unknown,
    options: BaseRenderOptions & { unit?: number },
  ): Promise<RenderHandle>;
  renderFootprint(
    footprint: unknown,
    options: BaseRenderOptions,
  ): Promise<RenderHandle>;
}

/**
 * The renderer is a public asset rather than a Vite module, so it is imported
 * once and shared. Held as the promise, not the module, so several previews
 * mounting at once wait on one download instead of racing separate ones.
 */
let rendererModule: Promise<EcadRenderer> | null = null;

export function loadEcadRenderer(): Promise<EcadRenderer> {
  rendererModule ??= import(/* @vite-ignore */ ECAD_RENDERER_URL).then(
    (module) => module as unknown as EcadRenderer,
  );
  return rendererModule;
}

/**
 * How to fetch asset bytes. The catalog workspace uses cookies; the KiCad
 * panel can attach a negotiated bearer token. `authScope` is part of the
 * cache key so a body fetched under one credential is not reused after
 * login, logout, or a token change.
 */
export interface AssetTextRequest {
  authScope?: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
}

/**
 * Asset bytes are immutable -- editing one produces a new asset row -- so a
 * body is cached for the tab's lifetime and shared by every surface showing
 * the same part. The cache is keyed by auth scope and URL, not URL alone.
 */
const assetText = new Map<string, Promise<string>>();

export class AssetTextHttpError extends Error {
  constructor(readonly status: number) {
    super(`Asset request failed (${status})`);
    this.name = "AssetTextHttpError";
  }
}

export function loadAssetText(
  url: string,
  request: AssetTextRequest = {},
): Promise<string> {
  const key = `${request.authScope ?? ""}\n${url}`;
  let pending = assetText.get(key);
  if (!pending) {
    pending = fetch(url, {
      credentials: request.credentials ?? "same-origin",
      headers: request.headers,
    }).then((response) => {
      if (!response.ok) {
        throw new AssetTextHttpError(response.status);
      }
      return response.text();
    });
    // A failed request must not be remembered as the answer.
    pending.catch(() => assetText.delete(key));
    assetText.set(key, pending);
  }
  return pending;
}

/**
 * KiCad splits a multi-unit part across child symbols named `..._{unit}_{style}`.
 * The unit count drives the preview's tab strip, and it now comes from the
 * symbol itself rather than from however many previews were generated.
 */
export function symbolUnitCount(symbol: unknown): number {
  const children =
    (symbol as { children?: { name: string }[] })?.children ?? [];
  let highest = 1;
  for (const child of children) {
    const match = /_(\d+)_(\d+)$/.exec(child.name);
    const unit = match ? Number(match[1]) : 0;
    if (Number.isFinite(unit) && unit > highest) highest = unit;
  }
  return highest;
}

/** KiCad names units by letter, matching the reference designator suffix. */
export function symbolUnitLabel(unit: number): string {
  return `Unit ${String.fromCharCode("A".charCodeAt(0) + unit - 1)}`;
}
