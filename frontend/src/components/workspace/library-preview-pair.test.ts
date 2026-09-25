import { describe, expect, it } from "vitest";

import type {
  CatalogAsset,
  CatalogRepresentation,
} from "@/types/catalog";

import { resolveLibraryPreviewPairAssetIds } from "./library-preview-pair";

const asset = (
  id: string,
  asset_type: "symbol" | "footprint",
): CatalogAsset => ({
  id,
  asset_type,
  name: id,
  target_library: "Test",
  target_name: id,
  content_type: "text/plain",
  required: true,
});

const representation = (
  id: string,
  symbol: CatalogAsset | null,
  footprint: CatalogAsset | null,
  options: { isDefault?: boolean; order?: number } = {},
): CatalogRepresentation => ({
  id,
  label: id,
  symbol,
  footprint,
  is_default: options.isDefault ?? false,
  display_order: options.order ?? 0,
  source_internal_part_number: "",
  provenance: {},
});

describe("resolveLibraryPreviewPairAssetIds", () => {
  it("keeps both sides on the effective representation despite asset ordering", () => {
    const symbolA = asset("symbol-a", "symbol");
    const footprintA = asset("footprint-a", "footprint");
    const symbolB = asset("symbol-b", "symbol");
    const footprintB = asset("footprint-b", "footprint");

    expect(
      resolveLibraryPreviewPairAssetIds({
        // Deliberately interleaved so independent first-match lookup is wrong.
        assets: [symbolB, footprintA, symbolA, footprintB],
        representations: [
          representation("representation-b", symbolB, footprintB),
          representation("representation-a", symbolA, footprintA, {
            isDefault: true,
          }),
        ],
        default_representation_id: "representation-a",
        effective_representation_id: "representation-a",
      }),
    ).toEqual({
      symbolAssetId: "symbol-a",
      footprintAssetId: "footprint-a",
    });
  });

  it("resolves nothing from a lightweight catalog row", () => {
    // The catalog list is fetched with lightweight=true, so a row has neither
    // graph. The quick view renders that row first, and used to throw here.
    expect(resolveLibraryPreviewPairAssetIds({})).toEqual({
      symbolAssetId: undefined,
      footprintAssetId: undefined,
    });
  });

  it("does not borrow a counterpart for an incomplete representation", () => {
    const symbolA = asset("symbol-a", "symbol");
    const unrelatedFootprint = asset("footprint-b", "footprint");

    expect(
      resolveLibraryPreviewPairAssetIds({
        assets: [symbolA, unrelatedFootprint],
        representations: [
          representation("representation-a", symbolA, null, {
            isDefault: true,
          }),
        ],
        default_representation_id: "representation-a",
        effective_representation_id: "",
      }),
    ).toEqual({
      symbolAssetId: "symbol-a",
      footprintAssetId: undefined,
    });
  });
});
