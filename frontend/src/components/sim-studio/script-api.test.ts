import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJson = vi.fn();
const fetchChecked = vi.fn();
vi.mock("@/lib/api", () => ({
    fetchJson: (...args: unknown[]) => fetchJson(...args),
    fetchChecked: (...args: unknown[]) => fetchChecked(...args),
}));

import { createSimStudioScriptApi, installSimStudioScriptApi } from "./script-api";

const SETUP = "/api/projects/prj%201/sim/a0/setups/sup_1";

function record(revision: number) {
    return {
        setup_id: "sup_1",
        etag: `"simsetup:sup_1:${revision}"`,
        revision,
        setup: { analyses: [{ id: "dc", kind: "dc-drop", rails: [] }] },
    };
}

describe("window.prismSimStudio", () => {
    const hooks = { onChange: vi.fn(), onOpen: vi.fn() };

    beforeEach(() => {
        fetchJson.mockReset();
        fetchChecked.mockReset();
        hooks.onChange.mockReset();
        hooks.onOpen.mockReset();
    });

    it("guards each write with the ETag it just read", async () => {
        fetchJson.mockResolvedValueOnce(record(4)).mockResolvedValueOnce(record(5));
        const scriptApi = createSimStudioScriptApi("prj 1", hooks);
        const terminal = { id: "vrm", positive: ["main:U5.2"], reference: ["main:U5.3"] };
        await scriptApi.addTerminal("sup_1", terminal);
        expect(fetchJson).toHaveBeenNthCalledWith(1, SETUP, undefined, expect.any(String));
        const [url, init] = fetchJson.mock.calls[1] as [string, RequestInit];
        expect(url).toBe(SETUP);
        expect(init.method).toBe("PATCH");
        expect(init.headers).toMatchObject({ "If-Match": '"simsetup:sup_1:4"', "Content-Type": "application/json-patch+json" });
        expect(JSON.parse(String(init.body))).toEqual([{ op: "add", path: "/terminals/-", value: terminal }]);
        expect(hooks.onChange).toHaveBeenCalledWith("sup_1");
    });

    it("sets the solved rails of an analysis by id", async () => {
        fetchJson.mockResolvedValueOnce(record(2)).mockResolvedValueOnce(record(3));
        await createSimStudioScriptApi("prj 1", hooks).setAnalysisRails("sup_1", ["3v3"]);
        const init = fetchJson.mock.calls[1][1] as RequestInit;
        expect(JSON.parse(String(init.body))).toEqual([{ op: "replace", path: "/analyses/0/rails", value: ["3v3"] }]);
    });

    it("lists the board pads on a net from the semantic index", async () => {
        fetchJson.mockResolvedValueOnce({
            terminals: [
                { reference: "U1", pin: "12", netName: "+3V3", pcbPadUuid: "a" },
                { reference: "C3", pin: "1", netName: "+3V3", pcbPadUuid: "b" },
                { reference: "U1", pin: "13", netName: "GND", pcbPadUuid: "c" },
                { reference: "J9", pin: "1", netName: "+3V3" },
            ],
        });
        const pads = await createSimStudioScriptApi("prj 1", { ...hooks, commit: "f".repeat(40) }).pads("+3V3");
        expect(pads).toEqual(["main:C3.1", "main:U1.12"]);
        expect(fetchJson.mock.calls[0][0]).toBe(`/api/projects/prj%201/semantic-index/identity?commit=${"f".repeat(40)}`);
    });

    it("installs on window and removes only itself", () => {
        const remove = installSimStudioScriptApi("prj 1", hooks);
        expect(window.prismSimStudio?.projectId).toBe("prj 1");
        window.prismSimStudio?.open("sup_9");
        expect(hooks.onOpen).toHaveBeenCalledWith("sup_9");
        remove();
        expect(window.prismSimStudio).toBeUndefined();
    });
});
