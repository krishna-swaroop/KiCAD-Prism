import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "./api";
import { StaleSystemError, addInstance, clearPose, getPoses, getSystem, resetPoses, setPose } from "./systems-api";

function reply(status: number, body: unknown, etag?: string): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (etag) headers.ETag = etag;
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe("systems-api", () => {
  it("sends If-Match and returns the new ETag", async () => {
    const fetchMock = vi.fn(async () => reply(201, { id: "sin_1", label: "OBC" }, '"sys:s1:4"'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await addInstance("s1", '"sys:s1:3"', { projectId: "p", label: "OBC", trackedRef: "main" });
    expect(result).toEqual({ body: { id: "sin_1", label: "OBC" }, etag: '"sys:s1:4"' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/systems/s1/instances");
    expect(new Headers(init.headers).get("If-Match")).toBe('"sys:s1:3"');
    expect(JSON.parse(String(init.body))).toMatchObject({ projectId: "p", trackedRef: "main" });
  });

  it("turns 412 into StaleSystemError carrying the current ETag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(412, { detail: "System has changed; reload it" }, '"sys:s1:9"')));
    const error = await addInstance("s1", '"sys:s1:3"', { projectId: "p", label: "x" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(StaleSystemError);
    expect(error).toMatchObject({ status: 412, currentEtag: '"sys:s1:9"', message: "System has changed; reload it" });
  });

  it("marks interface_not_ready conflicts and encodes path segments", async () => {
    const fetchMock = vi.fn(async () => reply(409, { detail: "interface_not_ready: still extracting" }));
    vi.stubGlobal("fetch", fetchMock);
    const error = await addInstance("a/b", "e", { projectId: "p", label: "x" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.code).toBe("interface_not_ready");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/systems/a%2Fb/instances");
  });

  it("saves a pose and resets them all, both version-checked", async () => {
    const fetchMock = vi.fn(async () => reply(200, { instanceId: "sin_1", source: "manual" }, '"sys:s1:5"'));
    vi.stubGlobal("fetch", fetchMock);
    const pose = { translationMm: [1, 2, 3] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] };
    await setPose("s1", '"sys:s1:4"', "sin_1", pose);
    await resetPoses("s1", '"sys:s1:5"');
    const [[putUrl, put], [resetUrl, reset]] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect([putUrl, put.method, JSON.parse(String(put.body))]).toEqual(["/api/systems/s1/poses/sin_1", "PUT", pose]);
    expect(new Headers(put.headers).get("If-Match")).toBe('"sys:s1:4"');
    expect([resetUrl, reset.method, new Headers(reset.headers).get("If-Match")]).toEqual(["/api/systems/s1/poses", "DELETE", '"sys:s1:5"']);
  });

  it("reads the stored poses and clears one", async () => {
    const fetchMock = vi.fn(async () => reply(200, { systemId: "s1", version: 5, poses: [] }, '"sys:s1:5"'));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPoses("s1")).resolves.toEqual({ systemId: "s1", version: 5, poses: [] });
    await clearPose("s1", '"sys:s1:5"', "sin_1");
    const [, [url, init]] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect([url, init.method, new Headers(init.headers).get("If-Match")]).toEqual(["/api/systems/s1/poses/sin_1", "DELETE", '"sys:s1:5"']);
  });

  it("reads the document with its ETag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { system: { id: "s1" } }, '"sys:s1:2"')));
    await expect(getSystem("s1")).resolves.toEqual({ body: { system: { id: "s1" } }, etag: '"sys:s1:2"' });
  });
});
