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

    it("edits the power tree through the same model as the canvas", async () => {
        const setup = {
            schema: "prism.sim.setup", version: "a0", name: "t", bundle: { board_id: "main" }, materials: { slices: {} }, components: {},
            rails: [{ id: "3v3", net: "main:+3V3", voltage_v: 3.3 }],
            terminals: [{ id: "u1-t", positive: ["main:U1.1"], reference: [] }],
            sources: [], converters: [], probes: [],
            loads: [{ id: "u1-3v3", rail: "3v3", terminal: "u1-t", current_a: 0, distribution: "uniform", component: "main:U1" }],
            analyses: [{ id: "dc", kind: "dc-drop", rails: ["3v3"] }],
        };
        const current = { ...record(7), source: { project_path: "b.kicad_pro" }, setup };
        fetchJson
            .mockResolvedValueOnce(current)
            .mockResolvedValueOnce({ version: 1, positions: { "load:u1-3v3": { x: 1, y: 2 } }, pending: [] })
            .mockResolvedValueOnce({ components: [], terminals: [] })
            .mockResolvedValueOnce({ ...current, revision: 8 });
        const node = await createSimStudioScriptApi("prj 2", hooks).updateElement("sup_1", "load:u1-3v3", { values: { current_a: 1.5 } });
        expect(node).toBe("load:u1-3v3");
        expect(fetchJson).toHaveBeenCalledTimes(4);
        const [url, init] = fetchJson.mock.calls[3] as [string, RequestInit];
        expect(url).toBe("/api/projects/prj%202/sim/a0/setups/sup_1");
        expect(init).toMatchObject({ method: "PUT", headers: expect.objectContaining({ "If-Match": '"simsetup:sup_1:7"' }) });
        expect(JSON.parse(String(init.body)).loads[0].current_a).toBe(1.5);
        expect(hooks.onChange).toHaveBeenCalledWith("sup_1");
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
