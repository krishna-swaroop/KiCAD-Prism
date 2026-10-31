import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiHttpError,
  apiErrorFrom,
  fetchApi,
  fetchBlob,
  fetchChecked,
  fetchJson,
  fetchText,
  ifMatch,
  readApiError,
} from "./api";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function stubFetch(response: Response | (() => Response)) {
  const mock = vi.fn(async () => (typeof response === "function" ? response() : response));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function rejection(promise: Promise<unknown>): Promise<ApiHttpError> {
  try {
    await promise;
  } catch (reason) {
    expect(reason).toBeInstanceOf(ApiHttpError);
    return reason as ApiHttpError;
  }
  throw new Error("expected ApiHttpError");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("error bodies", () => {
  it("keeps a string detail", async () => {
    await expect(
      readApiError(jsonResponse(400, { detail: "datasheet is required" }), "fail"),
    ).resolves.toBe("datasheet is required");
  });

  it("reads a domain error's code and extra fields beside detail", async () => {
    const error = await apiErrorFrom(
      jsonResponse(412, {
        detail: "Comment changed since the revision you edited",
        code: "revision_conflict",
        currentRevision: 3,
      }),
    );
    expect(error).toMatchObject({ message: "Comment changed since the revision you edited", code: "revision_conflict" });
    expect(error.payload).toEqual({ currentRevision: 3 });
    expect(error.isStale).toBe(true);
  });

  it("keeps a provider error's class and retryable flags", async () => {
    const error = await apiErrorFrom(
      jsonResponse(409, { detail: "Reconnect GitHub", code: "auth_lost", class: "auth_lost", retryable: false }),
    );
    expect(error).toMatchObject({ message: "Reconnect GitHub", code: "auth_lost" });
    expect(error.payload).toEqual({ class: "auth_lost", retryable: false });
  });

  it("reads no nested body: an object detail is not a message", async () => {
    const error = await apiErrorFrom(jsonResponse(409, { detail: { code: "x", message: "nested" } }), "fail");
    expect(error).toMatchObject({ message: "fail", code: undefined });
  });

  it("builds a guarded write's If-Match from the resource ETag", () => {
    expect(ifMatch("component", "cmp-1", "rev-2")).toEqual({ "If-Match": '"component:cmp-1:rev-2"' });
    expect(ifMatch("reply", "r_1", 4)).toEqual({ "If-Match": '"reply:r_1:4"' });
  });

  it("reads a 422 validation body like any other error (D40)", async () => {
    const error = await apiErrorFrom(
      jsonResponse(422, { detail: "url: Field required, ref: Input should be a valid string", code: "validation_error" }),
      "Analysis failed",
    );
    expect(error).toMatchObject({ message: "url: Field required, ref: Input should be a valid string", code: "validation_error" });
  });

  it("falls back to the caller's message for a non-JSON proxy page", async () => {
    const error = await apiErrorFrom(
      new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
      "Import failed",
    );
    expect(error).toMatchObject({ status: 502, message: "Import failed" });
  });

  it("falls back for an empty or blank detail", async () => {
    expect((await apiErrorFrom(jsonResponse(500, { detail: "  " }), "Request failed")).message).toBe("Request failed");
    expect((await apiErrorFrom(jsonResponse(500, null), "Request failed")).message).toBe("Request failed");
  });
});

describe("classification", () => {
  it.each([
    [401, "isAuth"],
    [403, "isPermission"],
    [404, "isNotFound"],
    [409, "isConflict"],
    [412, "isStale"],
  ] as const)("%i is %s and nothing else", (status, flag) => {
    const error = new ApiHttpError(status, "x");
    const flags = ["isAuth", "isPermission", "isNotFound", "isConflict", "isStale"] as const;
    expect(flags.filter((name) => error[name])).toEqual([flag]);
  });
});

describe("fetchApi", () => {
  it("sends the session cookie and a JSON content type for string bodies", async () => {
    const mock = stubFetch(jsonResponse(200, {}));
    await fetchApi("/api/projects/import", { method: "POST", body: JSON.stringify({ url: "x" }) });
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it.each([401, 403])("raises the session banner event on %i", async (status) => {
    stubFetch(jsonResponse(status, { detail: "Not authenticated" }));
    const listener = vi.fn();
    window.addEventListener("kicad-prism-auth-error", listener);
    try {
      await fetchApi("/api/projects/p1/config");
    } finally {
      window.removeEventListener("kicad-prism-auth-error", listener);
    }
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ status, url: "/api/projects/p1/config" });
  });
});

describe("typed readers", () => {
  it("fetchJson returns the body and throws ApiHttpError with the code", async () => {
    stubFetch(jsonResponse(200, { job_id: "j1" }));
    await expect(fetchJson("/api/projects/analyze")).resolves.toEqual({ job_id: "j1" });

    stubFetch(jsonResponse(412, { detail: "head moved", code: "revision_conflict" }));
    const error = await rejection(fetchJson("/api/catalog/components/cmp-1"));
    expect(error).toMatchObject({ status: 412, message: "head moved", code: "revision_conflict" });
  });

  it("fetchText and fetchBlob read their bodies and share the error path", async () => {
    stubFetch(() => new Response("<html>report</html>", { status: 200 }));
    await expect(fetchText("/api/projects/p/report.html")).resolves.toBe("<html>report</html>");
    stubFetch(() => new Response("zip", { status: 200 }));
    // Node 24's Response.blob() builds the test environment's (jsdom) Blob, which has no text().
    const blob = await fetchBlob("/api/projects/p/asset/x.zip");
    const body = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(body).toBe("zip");

    stubFetch(jsonResponse(404, { detail: "Not found" }));
    expect(await rejection(fetchText("/api/projects/p/report.html", undefined, "The report could not be generated"))).toMatchObject({
      status: 404,
      message: "Not found",
    });
  });

  it("fetchChecked hands back the response for headers", async () => {
    stubFetch(jsonResponse(200, {}, { ETag: '"component:c:4"' }));
    expect((await fetchChecked("/api/catalog/components/c")).headers.get("ETag")).toBe('"component:c:4"');
  });

  it("an expired session during a write raises the banner and a readable error", async () => {
    stubFetch(jsonResponse(401, { detail: "Not authenticated" }));
    const listener = vi.fn();
    window.addEventListener("kicad-prism-auth-error", listener);
    try {
      const error = await rejection(fetchJson("/api/projects/import", { method: "POST", body: "{}" }, "Import failed"));
      expect(error).toMatchObject({ status: 401, message: "Not authenticated" });
      expect(error.isAuth).toBe(true);
    } finally {
      window.removeEventListener("kicad-prism-auth-error", listener);
    }
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("one transport", () => {
  // Raw fetch is only for non-Prism endpoints and local object URLs.
  const ALLOWED = new Set([
    "lib/api.ts", // the transport itself
    "panel/lib/panel-api.ts", // the panel's bearer-token adapter (parses errors with apiErrorFrom)
    "lib/ecad-renderer.ts", // immutable asset text cache
    "lib/kicad-agent-signin.ts", // the local KiCad agent on 127.0.0.1
    "components/login-page.tsx", // GitHub releases
    "components/release-studio/shared.tsx", // reads a blob: object URL
  ]);

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "test" ? [] : sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("calls the Prism backend only through lib/api", () => {
    const root = resolve(__dirname, "..");
    const offenders = sources(root)
      .map((path) => relative(root, path))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) =>
        readFileSync(join(root, path), "utf8")
          .split("\n")
          // A class method named fetch is not a call.
          .some((line) => /(^|[^\w.])fetch\(/.test(line) && !/^\s*(private |public |protected )?fetch\(/.test(line)),
      );
    expect(offenders).toEqual([]);
  });

  it("returns nothing, instead of failing to read a body, when a write answers 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(fetchJson("/api/supply/parts/p1/preferred", { method: "PUT" })).resolves.toBeUndefined();
  });

  it("returns nothing for an empty 200 and still reads a body when there is one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(fetchJson("/x")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { ok: true })));
    await expect(fetchJson("/x")).resolves.toEqual({ ok: true });
  });
});
