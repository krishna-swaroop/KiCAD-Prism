import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, fetchJson, readApiError } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readApiError", () => {
  it("keeps a string detail", async () => {
    await expect(
      readApiError(jsonResponse(400, { detail: "datasheet is required" }), "fail"),
    ).resolves.toBe("datasheet is required");
  });

  it("reads a catalog conflict object without dropping the message", async () => {
    await expect(
      readApiError(
        jsonResponse(409, { detail: { code: "asset_referenced", message: "cannot detach" } }),
        "fail",
      ),
    ).resolves.toBe("cannot detach");
  });
});

describe("fetchJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the catalog conflict code to ApiHttpError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(409, { detail: { code: "revision_conflict", message: "head moved" } }),
      ),
    );
    try {
      await fetchJson("/api/catalog/components/cmp-1");
      throw new Error("expected ApiHttpError");
    } catch (reason) {
      expect(reason).toBeInstanceOf(ApiHttpError);
      expect(reason).toMatchObject({
        status: 409,
        message: "head moved",
        code: "revision_conflict",
      });
    }
  });
});
