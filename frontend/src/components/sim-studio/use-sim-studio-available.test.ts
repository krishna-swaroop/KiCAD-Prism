import { afterEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
});

async function availability(config: Response | Error) {
    vi.resetModules();
    const fetchMock = vi.fn(async () => {
        if (config instanceof Error) throw config;
        return config;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { simStudioAvailable } = await import("./use-sim-studio-available");
    return { available: await simStudioAvailable(), fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("simStudioAvailable", () => {
    it("reads the app configuration instead of probing a Simulation Studio route", async () => {
        const { available, fetchMock } = await availability(json({ auth_enabled: true, sim_studio_enabled: true }));
        expect(available).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/api/auth/config");
    });

    it("is off when the configuration says so, omits it, or cannot be read", async () => {
        expect((await availability(json({ sim_studio_enabled: false }))).available).toBe(false);
        expect((await availability(json({ auth_enabled: false }))).available).toBe(false);
        expect((await availability(new Error("offline"))).available).toBe(false);
    });

    it("retries after a failed read instead of caching the failure", async () => {
        vi.resetModules();
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(json({ sim_studio_enabled: true }));
        vi.stubGlobal("fetch", fetchMock);
        const { simStudioAvailable } = await import("./use-sim-studio-available");

        await expect(simStudioAvailable()).resolves.toBe(false);
        await expect(simStudioAvailable()).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
