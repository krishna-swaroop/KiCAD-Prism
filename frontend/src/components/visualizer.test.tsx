import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ECadViewerElement } from "@/types/ecad-viewer";

import { Visualizer } from "./visualizer";

vi.mock("@/features/live-comments/use-live-comments", () => {
    const live = { comments: [], setComments: () => {}, refresh: () => {}, status: "live", error: null, hasLoaded: true };
    return { useLiveComments: () => live };
});
vi.mock("./webgpu-3d-tab", () => ({ WebGpu3dTab: () => null }));

// Use the release element's source and readiness APIs without a GPU.
class TestViewer extends HTMLElement {
    ready = Promise.resolve();
    isReady = true;
    replaceSources = vi.fn<ECadViewerElement["replaceSources"]>(async () => undefined);
    appendSources = vi.fn<ECadViewerElement["appendSources"]>(async () => undefined);
    setVariant = vi.fn(() => true);
    getVariant = vi.fn(() => null);
    getVariants = vi.fn(() => []);
    setActive = vi.fn();
    setViewportInsets = vi.fn();
    setCommentOverlays = vi.fn(() => []);
    clearCommentOverlays = vi.fn();
    clearSelection = vi.fn();
    requestCrossProbe = vi.fn();
}
customElements.define("ecad-viewer", TestViewer);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
});
const project = { filename: "board.kicad_pro", content: "{}" };
const layout = { filename: "frame.kicad_wks", content: "(kicad_wks)" };
const sub = { filename: "Subsheets/power.kicad_sch", content: "(kicad_sch power)" };
const root = { filename: "root.kicad_sch", content: "(kicad_sch root)" };

function serve(url: string): Response {
    const path = new URL(url, "http://prism.test").pathname;
    if (path.endsWith("/schematic")) return new Response(root.content);
    if (path.endsWith("/schematic/subsheets")) {
        return json({ files: [{ name: sub.filename, url: "/files/Subsheets/power.kicad_sch" }] });
    }
    if (path.endsWith("/files/Subsheets/power.kicad_sch")) return new Response(sub.content);
    if (path.endsWith("/pcb")) return new Response("(kicad_pcb board)");
    if (path.endsWith("/viewer/support-files")) return json({ files: [project, layout] });
    if (path.endsWith("/comments/mention-candidates")) return json([]);
    return json({ detail: "not here" }, 404);
}

const viewers = () => [...document.querySelectorAll<HTMLElement>("ecad-viewer")]
    .filter((node): node is TestViewer => node instanceof TestViewer);
const renderVisualizer = () => render(
    <MemoryRouter><Visualizer projectId="p1" user={null} /></MemoryRouter>,
);

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => serve(String(input))));
});
afterEach(() => vi.unstubAllGlobals());

describe("release visualizer source loading", () => {
    it("loads the root, project, layout and subsheets together and marks the design ready", async () => {
        renderVisualizer();
        await waitFor(() => expect(viewers()).toHaveLength(1));
        const [sch] = viewers();
        await waitFor(() => expect(sch.dataset.ecadReadyRevision).toBe("schematic:p1:latest"));
        expect(sch.replaceSources).toHaveBeenCalledTimes(1);
        expect(sch.replaceSources).toHaveBeenCalledWith({
            revisionKey: "schematic:p1:latest", sources: [root, project, layout, sub],
        });
        expect(sch.appendSources).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: /^PCB/ }));
        await waitFor(() => expect(viewers()).toHaveLength(2));
        const pcb = viewers().find((viewer) => viewer !== sch)!;
        await waitFor(() => expect(pcb.dataset.ecadReadyRevision).toBe("pcb:p1:latest"));
        expect(pcb.replaceSources).toHaveBeenCalledWith({
            revisionKey: "pcb:p1:latest",
            sources: [{ filename: "board.kicad_pcb", content: "(kicad_pcb board)" }, project, layout],
        });
        expect(pcb.appendSources).not.toHaveBeenCalled();
    });

    it("waits for support files independently of the unrelated helper requests", async () => {
        let resolveSupport!: (response: Response) => void;
        const support = new Promise<Response>((resolve) => { resolveSupport = resolve; });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/viewer/support-files")) return support;
            if (url.endsWith("/ibom")) return new Promise<Response>(() => {});
            return serve(url);
        }));
        renderVisualizer();
        await screen.findByText("Loading schematic…");
        expect(viewers()).toHaveLength(0);
        await act(async () => { resolveSupport(json({ files: [project, layout] })); });
        await waitFor(() => expect(viewers()).toHaveLength(1));
        const [sch] = viewers();
        await waitFor(() => expect(sch.replaceSources).toHaveBeenCalledWith({
            revisionKey: "schematic:p1:latest", sources: [root, project, layout, sub],
        }));
        expect(sch.replaceSources).toHaveBeenCalledTimes(1);
    });

    it.each(["response", "network"])("draws with the default layout after a %s support failure", async (failure) => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/viewer/support-files")) {
                if (failure === "network") throw new TypeError("network unavailable");
                return json({ detail: "unavailable" }, 503);
            }
            return serve(url);
        }));
        renderVisualizer();
        await waitFor(() => expect(viewers()).toHaveLength(1));
        const [sch] = viewers();
        await waitFor(() => expect(sch.dataset.ecadReadyRevision).toBe("schematic:p1:latest"));
        expect(sch.replaceSources).toHaveBeenCalledWith({
            revisionKey: "schematic:p1:latest", sources: [root, sub],
        });
        expect(sch.appendSources).not.toHaveBeenCalled();
    });
});
