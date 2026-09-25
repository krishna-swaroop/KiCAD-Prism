import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assetContentUrl,
  loadAssetText,
  symbolUnitCount,
  symbolUnitLabel,
} from "./ecad-renderer";

describe("asset content urls", () => {
  it("addresses the right API for each surface", () => {
    expect(assetContentUrl("catalog", "asset-1")).toBe(
      "/api/catalog/assets/asset-1/content"
    );
    expect(assetContentUrl("panel", "asset-1")).toBe(
      "/api/remote-provider/assets/asset-1/content"
    );
  });

  it("escapes an id rather than pasting it into the path", () => {
    expect(assetContentUrl("catalog", "a/../b")).toBe(
      "/api/catalog/assets/a%2F..%2Fb/content"
    );
  });
});

describe("symbol units", () => {
  // KiCad splits a multi-unit part across child symbols suffixed
  // `_{unit}_{style}`; the highest unit is how many the part has.
  const dual = {
    children: [{ name: "Opamp_1_1" }, { name: "Opamp_2_1" }],
  };

  it("counts the units of a multi-unit symbol", () => {
    expect(symbolUnitCount(dual)).toBe(2);
  });

  it("treats a symbol with no unit children as one unit", () => {
    expect(symbolUnitCount({ children: [] })).toBe(1);
    expect(symbolUnitCount({})).toBe(1);
    expect(symbolUnitCount(undefined)).toBe(1);
  });

  it("ignores a child whose name carries no unit suffix", () => {
    expect(symbolUnitCount({ children: [{ name: "Opamp_body" }] })).toBe(1);
  });

  it("names units the way KiCad suffixes a reference", () => {
    expect(symbolUnitLabel(1)).toBe("Unit A");
    expect(symbolUnitLabel(2)).toBe("Unit B");
  });
});

describe("asset text caching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches one url once, because asset bytes are immutable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("(kicad_symbol_lib)"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/catalog/assets/cached-once/content";
    const [first, second] = await Promise.all([
      loadAssetText(url),
      loadAssetText(url),
    ]);

    expect(first).toBe("(kicad_symbol_lib)");
    expect(second).toBe("(kicad_symbol_lib)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, {
      credentials: "same-origin",
      headers: undefined,
    });
  });

  it("does not reuse a cached body across auth scopes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("cookie-body"),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("token-body"),
      });
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/remote-provider/assets/scoped/content";
    await expect(loadAssetText(url)).resolves.toBe("cookie-body");
    await expect(
      loadAssetText(url, {
        authScope: "panel:1:authed",
        headers: { Authorization: "Bearer token" },
        credentials: "include",
      }),
    ).resolves.toBe("token-body");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      credentials: "include",
      headers: { Authorization: "Bearer token" },
    });
  });

  it("does not remember a 401 as the answer after credentials change", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("(symbol)"),
      });
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/remote-provider/assets/unauthorized-then-ok/content";
    await expect(loadAssetText(url)).rejects.toMatchObject({
      name: "AssetTextHttpError", status: 401,
    });
    await expect(
      loadAssetText(url, { authScope: "panel:2:authed" }),
    ).resolves.toBe("(symbol)");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failed request as the answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("(footprint)"),
      });
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/catalog/assets/retried/content";
    await expect(loadAssetText(url)).rejects.toThrow("503");
    // A cached rejection would make one flaky response permanent for the tab.
    await expect(loadAssetText(url)).resolves.toBe("(footprint)");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
