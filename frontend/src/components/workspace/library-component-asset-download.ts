import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { fetchJson } from "@/lib/api";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import type { CatalogAsset, CatalogComponent, CatalogRepresentation } from "@/types/catalog";

/**
 * Released-revision downloads go through the remote-provider placement
 * manifest for one representation (`?representation=`).
 *
 * Catalog `asset.sha256` is the raw stored hash. Manifest `entry.sha256` is
 * the KiCad placement hash after `materialize_asset` and need not match.
 * The signed URL returns those placement bytes, not the raw source file.
 */

export const AUXILIARY_ASSET_TYPES = new Set<CatalogAsset["asset_type"]>([
  "3dmodel",
  "spice",
]);

export const RELEASED_DOWNLOAD_BLOCKED_MESSAGE =
  "Direct downloads are available for the released revision. Release this revision or open the released revision first.";

export const ASSET_NOT_IN_MANIFEST_MESSAGE =
  "This asset is not present in the released download manifest.";

export type PlacementManifestAsset = {
  id?: string;
  asset_type: CatalogAsset["asset_type"];
  name: string;
  sha256?: string;
  download_url: string;
};

export type PlacementManifest = {
  representation_id?: string;
  assets: PlacementManifestAsset[];
};

export type ReleasedAssetDownloadPlan =
  | { status: "blocked"; message: string }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      componentId: string;
      representationId: string;
      manifestUrl: string;
    };

export type FetchPlacementManifest = (
  input: string,
  init?: RequestInit,
) => Promise<PlacementManifest>;

export type ReleasedAssetDownloadOptions = {
  fetchManifest?: FetchPlacementManifest;
  startDownload?: (url: string, filename: string) => void;
};

type DownloadSubject = Pick<CatalogComponent, "revision_id" | "released_revision_id" | "representations">;

function isAbortError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "AbortError";
}

function isCompleteRepresentation(representation: CatalogRepresentation): boolean {
  return Boolean(representation.symbol?.id && representation.footprint?.id);
}

function pickRepresentation(candidates: CatalogRepresentation[]): CatalogRepresentation | null {
  return (
    candidates.find((entry) => entry.is_default) ||
    [...candidates].sort((left, right) => {
      if (left.display_order !== right.display_order) {
        return left.display_order - right.display_order;
      }
      return left.id.localeCompare(right.id);
    })[0] ||
    null
  );
}

function representationIncludesAsset(
  representation: CatalogRepresentation,
  assetId: string,
): boolean {
  return representation.symbol?.id === assetId || representation.footprint?.id === assetId;
}

export function releasedRevisionDownloadsAllowed(
  currentComponent: Pick<CatalogComponent, "released_revision_id"> | null | undefined,
  activeComponent: Pick<CatalogComponent, "revision_id"> | null | undefined,
): boolean {
  return Boolean(
    currentComponent &&
      activeComponent &&
      activeComponent.revision_id === currentComponent.released_revision_id,
  );
}

export function resolveReleasedRepresentationForAsset(
  representations: readonly CatalogRepresentation[] | undefined,
  asset: Pick<CatalogAsset, "id" | "asset_type">,
): CatalogRepresentation | null {
  const complete = (representations ?? []).filter(isCompleteRepresentation);
  if (!complete.length) return null;
  if (AUXILIARY_ASSET_TYPES.has(asset.asset_type)) {
    return pickRepresentation(complete);
  }
  return pickRepresentation(
    complete.filter((representation) => representationIncludesAsset(representation, asset.id)),
  );
}

export function releasedAssetManifestUrl(componentId: string, representationId: string): string {
  const params = new URLSearchParams({ representation: representationId });
  return `/api/remote-provider/parts/${encodeURIComponent(componentId)}?${params.toString()}`;
}

export function locatePlacementManifestAsset(
  assets: readonly PlacementManifestAsset[],
  asset: Pick<CatalogAsset, "id" | "asset_type" | "name">,
): PlacementManifestAsset | undefined {
  const byId = assets.find((entry) => entry.id && entry.id === asset.id);
  if (byId) return byId;
  return assets.find(
    (entry) => entry.asset_type === asset.asset_type && entry.name === asset.name,
  );
}

export function planReleasedAssetDownload(
  componentId: string,
  currentComponent: DownloadSubject | null | undefined,
  activeComponent: DownloadSubject | null | undefined,
  asset: Pick<CatalogAsset, "id" | "asset_type">,
): ReleasedAssetDownloadPlan {
  if (!releasedRevisionDownloadsAllowed(currentComponent, activeComponent)) {
    return { status: "blocked", message: RELEASED_DOWNLOAD_BLOCKED_MESSAGE };
  }
  const representation = resolveReleasedRepresentationForAsset(
    activeComponent?.representations,
    asset,
  );
  if (!representation) {
    return { status: "unavailable", message: ASSET_NOT_IN_MANIFEST_MESSAGE };
  }
  return {
    status: "ready",
    componentId,
    representationId: representation.id,
    manifestUrl: releasedAssetManifestUrl(componentId, representation.id),
  };
}

export function startBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function fetchReleasedAssetDownload(
  plan: Extract<ReleasedAssetDownloadPlan, { status: "ready" }>,
  asset: Pick<CatalogAsset, "id" | "asset_type" | "name">,
  options: {
    fetchManifest?: FetchPlacementManifest;
    signal?: AbortSignal;
  } = {},
): Promise<{ downloadUrl: string; filename: string }> {
  const fetchManifest = options.fetchManifest ?? fetchJson<PlacementManifest>;
  const manifest = await fetchManifest(plan.manifestUrl, { signal: options.signal });
  const downloadable = locatePlacementManifestAsset(manifest.assets ?? [], asset);
  if (!downloadable?.download_url) {
    throw new Error(ASSET_NOT_IN_MANIFEST_MESSAGE);
  }
  return {
    downloadUrl: downloadable.download_url,
    filename: asset.name,
  };
}

export function useReleasedAssetDownload(
  componentId: string,
  options?: ReleasedAssetDownloadOptions,
) {
  const optionsRef = useCommittedRef(options);
  const requestRef = useRef<AbortController | null>(null);
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);

  return useCallback(
    async (
      asset: CatalogAsset,
      currentComponent: CatalogComponent | null,
      activeComponent: CatalogComponent | null,
    ) => {
      const plan = planReleasedAssetDownload(
        componentId,
        currentComponent,
        activeComponent,
        asset,
      );
      if (plan.status === "blocked") {
        toast.info(plan.message);
        return;
      }
      if (plan.status === "unavailable") {
        toast.error(plan.message);
        return;
      }

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const { fetchManifest, startDownload = startBrowserDownload } = optionsRef.current ?? {};

      try {
        const downloaded = await fetchReleasedAssetDownload(plan, asset, {
          fetchManifest,
          signal: controller.signal,
        });
        if (!liveRef.current || controller.signal.aborted) return;
        startDownload(downloaded.downloadUrl, downloaded.filename);
      } catch (reason) {
        if (!liveRef.current || controller.signal.aborted || isAbortError(reason)) return;
        toast.error(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [componentId, optionsRef],
  );
}
