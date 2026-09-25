import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAssetText } from "@/lib/ecad-renderer";

import {
  classifyPanelLoadFailure,
  getComponent,
  getComponentsByCategory,
  getInlineBundle,
  getPartManifest,
  loadPanelAssetText,
  PanelApiError,
  primaryLocalSource,
  searchComponents,
  setApiToken,
  type PanelComponent,
  type PanelSupplySource,
} from "./panel-api";

function componentWithSources(sources: PanelSupplySource[]): PanelComponent {
  return { supply: { sources } } as unknown as PanelComponent;
}

function localSource(overrides: Partial<PanelSupplySource> = {}): PanelSupplySource {
  return {
    kind: "local",
    id: "csv",
    display_name: "CSV",
    stock: 7,
    uom: "pcs",
    stock_status: "available",
    fetch_status: "ok",
    fetched_at: "",
    ...overrides,
  };
}

describe("primaryLocalSource", () => {
  it("returns null when the payload predates supply", () => {
    expect(primaryLocalSource({} as PanelComponent)).toBeNull();
  });

  it("returns null when there are no sources", () => {
    expect(primaryLocalSource(componentWithSources([]))).toBeNull();
  });

  it("picks the first local source and ignores vendor rows", () => {
    const vendor = localSource({
      kind: "vendor",
      id: "mouser",
      display_name: "Mouser",
      stock: 5000,
    });
    const csv = localSource({ id: "csv" });
    expect(
      primaryLocalSource(componentWithSources([vendor, csv]))
    ).toBe(csv);
  });

  it("returns null when only vendor rows exist", () => {
    const vendor = localSource({
      kind: "vendor",
      id: "mouser",
      display_name: "Mouser",
      stock: 0,
    });
    expect(primaryLocalSource(componentWithSources([vendor]))).toBeNull();
  });
});

describe("classifyPanelLoadFailure", () => {
  it("sends 401 and 403 back to login, 404 to not-found, and the rest to retry", () => {
    expect(classifyPanelLoadFailure(new PanelApiError(401, "Unauthorized"))).toBe("auth");
    expect(classifyPanelLoadFailure(new PanelApiError(403, "Forbidden"))).toBe("auth");
    expect(classifyPanelLoadFailure(new PanelApiError(404, "Missing"))).toBe("not_found");
    expect(classifyPanelLoadFailure(new PanelApiError(0, "Network error"))).toBe("failed");
    expect(classifyPanelLoadFailure(new Error("boom"))).toBe("failed");
  });
});


describe("panel representation requests", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes one representation through detail and both placement paths", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ id: "component-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await getComponent("component-1", undefined, "representation-2");
    await getPartManifest("component-1", "representation-2");
    await getInlineBundle("component-1", "representation-2");

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/remote-provider/components/component-1?representation=representation-2",
      "/api/remote-provider/parts/component-1?representation=representation-2",
      "/api/remote-provider/components/component-1/inline?representation=representation-2",
    ]);
  });

  it("preserves default placement for clients that omit representation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await getPartManifest("component-1");
    await getInlineBundle("component-1");

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/remote-provider/parts/component-1",
      "/api/remote-provider/components/component-1/inline",
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("panel page fetches", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns one typed search page and does not walk remaining pages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        items: [{ id: "a" }],
        total: null,
        has_more: true,
        page: 1,
        pages: null,
        page_size: 50,
      }),
    );

    await expect(searchComponents("resistor")).resolves.toEqual({
      items: [{ id: "a" }],
      total: null,
      has_more: true,
      page: 1,
      pages: null,
      page_size: 50,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/remote-provider/search?q=resistor&page=1&page_size=50",
    );
  });

  it("requests a later category page without raising page_size past the server limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        items: [],
        total: 501,
        has_more: true,
        page: 2,
        pages: 11,
        page_size: 50,
      }),
    );

    await getComponentsByCategory("Resistors", { page: 2, pageSize: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/remote-provider/components-by-category?category=Resistors&page=2&page_size=200",
    );
  });

  it("propagates cancellation of an in-flight page", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      }),
    );

    const pending = searchComponents("cap", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("panel preview asset fetches", () => {
  afterEach(() => {
    setApiToken(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("attaches the bearer token only to remote-provider asset urls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("(kicad_symbol_lib)"),
    });
    vi.stubGlobal("fetch", fetchMock);
    setApiToken("panel-secret");

    await loadPanelAssetText("/api/remote-provider/assets/sym-1/content");
    await loadPanelAssetText("/api/catalog/assets/sym-1/content");

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      credentials: "include",
      headers: { Authorization: "Bearer panel-secret" },
    });
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      credentials: "include",
      headers: {},
    });
  });

  it("refetches the same url after the panel token changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("first-token"),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("second-token"),
      });
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/remote-provider/assets/token-change/content";
    setApiToken("token-a");
    await expect(loadPanelAssetText(url)).resolves.toBe("first-token");
    setApiToken("token-b");
    await expect(loadPanelAssetText(url)).resolves.toBe("second-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.headers,
    ).toEqual({ Authorization: "Bearer token-b" });
  });

  it("does not reuse a cookie-scoped catalog body for a panel token fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("cookie-body"),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("panel-body"),
      });
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/remote-provider/assets/shared-url/content";
    await expect(loadAssetText(url)).resolves.toBe("cookie-body");
    setApiToken("panel-secret");
    await expect(loadPanelAssetText(url)).resolves.toBe("panel-body");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
