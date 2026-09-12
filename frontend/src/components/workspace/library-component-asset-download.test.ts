import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { toast } from "sonner";
import type { CatalogAsset, CatalogComponent, CatalogRepresentation } from "@/types/catalog";

import {
  ASSET_NOT_IN_MANIFEST_MESSAGE,
  locatePlacementManifestAsset,
  planReleasedAssetDownload,
  RELEASED_DOWNLOAD_BLOCKED_MESSAGE,
  releasedAssetManifestUrl,
  releasedRevisionDownloadsAllowed,
  resolveReleasedRepresentationForAsset,
  useReleasedAssetDownload,
  type FetchPlacementManifest,
  type PlacementManifest,
} from "./library-component-asset-download";

const asset = (
  id: string,
  asset_type: CatalogAsset["asset_type"],
  extras: Partial<CatalogAsset> = {},
): CatalogAsset => ({
  id,
  asset_type,
  name: extras.name ?? `${id}.kicad`,
  target_library: extras.target_library ?? "Test",
  target_name: extras.target_name ?? id,
  content_type: extras.content_type ?? "text/plain",
  required: extras.required ?? true,
  sha256: extras.sha256 ?? `raw-${id}`,
  size_bytes: extras.size_bytes,
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

const symbolA = asset("symbol-a", "symbol", { name: "default.kicad_sym", sha256: "raw-symbol-a" });
const footprintA = asset("footprint-a", "footprint", { name: "default.kicad_mod", sha256: "raw-footprint-a" });
const symbolB = asset("symbol-b", "symbol", { name: "alt.kicad_sym", sha256: "raw-symbol-b" });
const footprintB = asset("footprint-b", "footprint", { name: "alt.kicad_mod", sha256: "raw-footprint-b" });
const model = asset("model-1", "3dmodel", { name: "part.step", sha256: "raw-model" });

const defaultPair = representation("representation-a", symbolA, footprintA, {
  isDefault: true,
  order: 0,
});
const secondPair = representation("representation-b", symbolB, footprintB, { order: 1 });

function releasedComponent(
  extras: Partial<CatalogComponent> = {},
): CatalogComponent {
  return {
    id: "comp-1",
    revision_id: "rev-released",
    released_revision_id: "rev-released",
    representations: [defaultPair, secondPair],
    assets: [symbolA, footprintA, symbolB, footprintB, model],
    ...extras,
  } as CatalogComponent;
}

afterEach(() => {
  cleanup();
});

describe("releasedRevisionDownloadsAllowed", () => {
  it("allows only the released revision", () => {
    const released = releasedComponent();
    expect(releasedRevisionDownloadsAllowed(released, released)).toBe(true);
  });

  it("blocks historical and unreleased content", () => {
    const current = releasedComponent();
    const historical = releasedComponent({ revision_id: "rev-old" });
    const unreleased = releasedComponent({
      revision_id: "rev-draft",
      released_revision_id: undefined,
    });
    expect(releasedRevisionDownloadsAllowed(current, historical)).toBe(false);
    expect(releasedRevisionDownloadsAllowed(unreleased, unreleased)).toBe(false);
    expect(releasedRevisionDownloadsAllowed(null, current)).toBe(false);
  });
});

describe("resolveReleasedRepresentationForAsset", () => {
  const representations = [defaultPair, secondPair];

  it("resolves the default pair", () => {
    expect(resolveReleasedRepresentationForAsset(representations, symbolA)?.id).toBe(
      "representation-a",
    );
    expect(resolveReleasedRepresentationForAsset(representations, footprintA)?.id).toBe(
      "representation-a",
    );
  });

  it("resolves the second pair", () => {
    expect(resolveReleasedRepresentationForAsset(representations, symbolB)?.id).toBe(
      "representation-b",
    );
    expect(resolveReleasedRepresentationForAsset(representations, footprintB)?.id).toBe(
      "representation-b",
    );
  });

  it("resolves an auxiliary onto the default complete pair", () => {
    expect(resolveReleasedRepresentationForAsset(representations, model)?.id).toBe(
      "representation-a",
    );
  });

  it("uses the first complete pair when the default pair is incomplete", () => {
    const incompleteDefault = representation("representation-a", symbolA, null, {
      isDefault: true,
    });
    expect(
      resolveReleasedRepresentationForAsset([incompleteDefault, secondPair], model)?.id,
    ).toBe("representation-b");
  });
});

describe("planReleasedAssetDownload", () => {
  it("requests the matching representation for each pair and for auxiliaries", () => {
    const released = releasedComponent();
    const defaultPlan = planReleasedAssetDownload("comp-1", released, released, symbolA);
    const secondPlan = planReleasedAssetDownload("comp-1", released, released, symbolB);
    const auxiliaryPlan = planReleasedAssetDownload("comp-1", released, released, model);

    expect(defaultPlan).toMatchObject({
      status: "ready",
      representationId: "representation-a",
      manifestUrl: releasedAssetManifestUrl("comp-1", "representation-a"),
    });
    expect(secondPlan).toMatchObject({
      status: "ready",
      representationId: "representation-b",
      manifestUrl: releasedAssetManifestUrl("comp-1", "representation-b"),
    });
    expect(auxiliaryPlan).toMatchObject({
      status: "ready",
      representationId: "representation-a",
      manifestUrl: releasedAssetManifestUrl("comp-1", "representation-a"),
    });
    expect(defaultPlan.status === "ready" && defaultPlan.manifestUrl).toContain(
      "representation=representation-a",
    );
    expect(secondPlan.status === "ready" && secondPlan.manifestUrl).toContain(
      "representation=representation-b",
    );
  });

  it("keeps historical unreleased downloads blocked", () => {
    const current = releasedComponent();
    const historical = releasedComponent({ revision_id: "rev-old" });
    expect(planReleasedAssetDownload("comp-1", current, historical, symbolB)).toEqual({
      status: "blocked",
      message: RELEASED_DOWNLOAD_BLOCKED_MESSAGE,
    });
  });
});

describe("locatePlacementManifestAsset", () => {
  it("prefers asset id and does not require raw sha256 to equal the placement hash", () => {
    const placement = locatePlacementManifestAsset(
      [
        {
          id: "symbol-b",
          asset_type: "symbol",
          name: "other.kicad_sym",
          sha256: "placement-symbol-b",
          download_url: "/signed/b",
        },
      ],
      symbolB,
    );
    expect(placement?.download_url).toBe("/signed/b");
  });

  it("falls back to type and name when the API omits asset id", () => {
    const placement = locatePlacementManifestAsset(
      [
        {
          asset_type: "symbol",
          name: "alt.kicad_sym",
          sha256: "placement-symbol-b",
          download_url: "/signed/b-by-name",
        },
      ],
      symbolB,
    );
    expect(placement?.download_url).toBe("/signed/b-by-name");
  });

  it("does not treat a rewritten placement hash as the lookup key", () => {
    expect(
      locatePlacementManifestAsset(
        [
          {
            asset_type: "symbol",
            name: "default.kicad_sym",
            sha256: "raw-symbol-b",
            download_url: "/signed/wrong-pair",
          },
        ],
        symbolB,
      ),
    ).toBeUndefined();
  });
});

describe("useReleasedAssetDownload", () => {
  beforeEach(() => {
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("fetches the representation-specific manifest and starts that download", async () => {
    const fetchManifest = vi.fn<FetchPlacementManifest>(async (url) => {
      expect(url).toContain("representation=representation-b");
      return {
        representation_id: "representation-b",
        assets: [
          {
            asset_type: "symbol",
            name: "alt.kicad_sym",
            sha256: "placement-symbol-b",
            download_url: "/signed/alt-symbol",
          },
        ],
      };
    });
    const startDownload = vi.fn();
    const released = releasedComponent();
    const { result } = renderHook(() =>
      useReleasedAssetDownload("comp-1", { fetchManifest, startDownload }),
    );

    await act(async () => {
      await result.current(symbolB, released, released);
    });

    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(String(fetchManifest.mock.calls[0]?.[0])).toBe(
      releasedAssetManifestUrl("comp-1", "representation-b"),
    );
    expect(fetchManifest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(startDownload).toHaveBeenCalledWith("/signed/alt-symbol", "alt.kicad_sym");
  });

  it("does not request a manifest for historical unreleased content", async () => {
    const fetchManifest = vi.fn();
    const startDownload = vi.fn();
    const current = releasedComponent();
    const historical = releasedComponent({ revision_id: "rev-old" });
    const { result } = renderHook(() =>
      useReleasedAssetDownload("comp-1", { fetchManifest, startDownload }),
    );

    await act(async () => {
      await result.current(symbolB, current, historical);
    });

    expect(fetchManifest).not.toHaveBeenCalled();
    expect(startDownload).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(RELEASED_DOWNLOAD_BLOCKED_MESSAGE);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("ignores a delayed manifest that arrives after unmount", async () => {
    let finish: ((value: PlacementManifest) => void) | undefined;
    const fetchManifest = vi.fn(
      () =>
        new Promise<PlacementManifest>((resolve) => {
          finish = resolve;
        }),
    );
    const startDownload = vi.fn();
    const released = releasedComponent();
    const { result, unmount } = renderHook(() =>
      useReleasedAssetDownload("comp-1", { fetchManifest, startDownload }),
    );

    void result.current(symbolB, released, released);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    unmount();
    finish!({
      assets: [
        {
          asset_type: "symbol",
          name: "alt.kicad_sym",
          sha256: "placement-symbol-b",
          download_url: "/signed/late",
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(startDownload).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("surfaces a missing placement entry as an error, not a download", async () => {
    const fetchManifest = vi.fn<FetchPlacementManifest>(async () => ({
      assets: [
        {
          asset_type: "symbol",
          name: "default.kicad_sym",
          sha256: "placement-symbol-a",
          download_url: "/signed/default",
        },
      ],
    }));
    const startDownload = vi.fn();
    const released = releasedComponent();
    const { result } = renderHook(() =>
      useReleasedAssetDownload("comp-1", { fetchManifest, startDownload }),
    );

    await act(async () => {
      await result.current(symbolB, released, released);
    });

    expect(startDownload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ASSET_NOT_IN_MANIFEST_MESSAGE);
  });
});
