import type { CatalogComponent } from "@/types/catalog";

/**
 * Every field is optional because the catalog list is served lightweight: a
 * row carries identity and status but no representation or asset graph, and
 * the quick view shows that row while the full component is still loading.
 */
type PreviewPairSource = Partial<
  Pick<
    CatalogComponent,
    | "assets"
    | "representations"
    | "default_representation_id"
    | "effective_representation_id"
  >
>;

export interface LibraryPreviewPairAssetIds {
  symbolAssetId?: string;
  footprintAssetId?: string;
}

/**
 * Resolve both canvases from one representation. Falling back each side
 * independently can pair a symbol from one package with a footprint from
 * another, which makes a visually successful cross-probe actively misleading.
 */
export function resolveLibraryPreviewPairAssetIds(
  component: PreviewPairSource,
): LibraryPreviewPairAssetIds {
  const requestedId =
    component.effective_representation_id ||
    component.default_representation_id;
  const representations = component.representations ?? [];
  const representation =
    representations.find((entry) => entry.id === requestedId) ||
    representations.find((entry) => entry.is_default) ||
    [...representations].sort(
      (left, right) => left.display_order - right.display_order,
    )[0];

  if (representation) {
    return {
      symbolAssetId: representation.symbol?.id,
      footprintAssetId: representation.footprint?.id,
    };
  }

  const assets = component.assets ?? [];
  return {
    symbolAssetId: assets.find((asset) => asset.asset_type === "symbol")?.id,
    footprintAssetId: assets.find((asset) => asset.asset_type === "footprint")
      ?.id,
  };
}
