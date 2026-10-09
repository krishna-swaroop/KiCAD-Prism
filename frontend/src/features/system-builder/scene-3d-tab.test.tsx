import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { scenePollDelay, summarizeScene } from "./scene-3d-model";
import { Scene3dTab } from "./scene-3d-tab";
import { instance, systemDocument } from "./test-fixtures";
import type { SystemScene, SystemSceneAsset, SystemSceneOccurrence } from "@/types/system";

afterEach(() => vi.unstubAllGlobals());

// The viewer bundle defines the element; the tab waits for it before driving it.
if (!customElements.get("prism-semantic-viewer")) customElements.define("prism-semantic-viewer", class extends HTMLElement {});

const box = { minMm: [0, -90, -0.8], maxMm: [132, 0, 0.8] };
const occurrence = (label: string, patch: Partial<SystemSceneOccurrence> = {}): SystemSceneOccurrence => ({
  path: `/sin_${label}`, parentPath: null, displayPath: label, labels: [label], instanceId: `sin_${label}`, kind: "board", depth: 1,
  restricted: false, assetId: `sba_${label}`, pose: { translationMm: [0, 0, 0], rotation: [0, 0, 0, 1], source: "default" },
  worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], boundsMm: box, ...patch,
});
const asset = (label: string, patch: Partial<SystemSceneAsset> = {}): SystemSceneAsset => ({
  assetId: `sba_${label}`, projectId: `prj_${label}`, commit: "a".repeat(40), status: "ready", bundleUrl: `/b/${label}/bundle.json`,
  sourceRevisionKey: "src", generatorBuild: "build", jobId: null, error: null,
  bundleToBoard: [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 0, 0, -0.8, 1], ...patch,
});
const scene = (occurrences: SystemSceneOccurrence[], assets: SystemSceneAsset[]): SystemScene => ({
  schema: "prism.system_scene.a0", systemId: "sys_1", systemVersion: 3, units: "mm", assets, occurrences,
});

const mixed = scene(
  [
    occurrence("CMBD", { restricted: true, assetId: null }),
    occurrence("OBC-1"),
    occurrence("OBC-2"),
    occurrence("PSU", { assetId: "sba_PSU", boundsMm: null }),
    occurrence("Payload", { kind: "assembly", assetId: null }),
  ],
  [asset("OBC-1"), asset("OBC-2", { status: "failed", bundleUrl: null, bundleToBoard: null, error: "kicad-cli missing" }),
    asset("PSU", { status: "building", bundleUrl: null, bundleToBoard: null })],
);

describe("scene summary", () => {
  it("sorts drawn occurrences by why they are not drawn in full", () => {
    const summary = summarizeScene(mixed);
    expect(summary.boards).toBe(4); // the open assembly is a group, not drawn
    expect(summary.restricted.map((item) => item.displayPath)).toEqual(["CMBD"]);
    expect(summary.failed.map((item) => [item.occurrence.displayPath, item.error])).toEqual([["OBC-2", "kicad-cli missing"]]);
    expect(summary.building.map((item) => item.displayPath)).toEqual(["PSU"]);
    expect(summary.unplaced.map((item) => item.displayPath)).toEqual(["PSU"]);
  });

  it("polls only while something is still coming", () => {
    expect(scenePollDelay(mixed)).toBe(5000);
    expect(scenePollDelay(scene([occurrence("OBC-1")], [asset("OBC-1")]))).toBeNull();
    expect(scenePollDelay(null)).toBeNull();
  });
});

describe("Scene3dTab", () => {
  const props = {
    systemId: "sys_1", document: systemDocument([instance("OBC-1")]), etag: '"sys:sys_1:3"', canEdit: true, user: null,
    reload: vi.fn(async () => undefined), onNavigate: vi.fn(),
  };

  it("reads the scene and explains restricted, failed and building boards", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(mixed), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    expect(await screen.findByText(/CMBD is restricted: drawn as a grey box showing only its size/)).toBeTruthy();
    expect(screen.getByText(/The 3D view of OBC-2 failed: kicad-cli missing/)).toBeTruthy();
    expect(screen.getByText(/Generating the 3D view of PSU/)).toBeTruthy();
    expect(screen.getByTitle(/^4 boards/)).toBeTruthy();
    expect((fetchMock.mock.calls as unknown[][]).some((call) => String(call[0]).includes("/api/systems/sys_1/scene"))).toBe(true);
    // The board 3D tab's viewer, in system mode (SB2-31e.2).
    expect(document.querySelector("prism-semantic-viewer")?.getAttribute("mode")).toBe("system");
  });

  it("saves a released drag with If-Match, and puts the board back when the save fails", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const json = (body: unknown, status = 200, etag?: string) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) },
    });
    const responses: Response[] = [];
    const fetchMock = vi.fn(async (url: string) => (String(url).endsWith("/scene") ? json(mixed) : responses.shift()!));
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    await screen.findByTitle(/^4 boards/);
    const element = document.querySelector("prism-semantic-viewer") as unknown as HTMLElement & Record<string, unknown>;
    element.setMoveMode = vi.fn();
    // The tab listens once the element is there; give its effects a turn.
    await act(async () => undefined);
    element.cancelMove = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /Move/ }));
    expect(element.setMoveMode).toHaveBeenCalledWith(true, { route: false });

    const pose = { translationMm: [10, 20, 0], rotation: [0, 0, 0, 1] };
    const commit = (phase: string) => act(() => {
      element.dispatchEvent(new CustomEvent("prism-semantic-viewer:move", { detail: {
        phase, allowed: true, enabled: true, space: "world", dragging: false,
        target: { occurrence: "/sin_OBC-1", instanceId: "sin_OBC-1", displayPath: "OBC-1", kind: "board", restricted: false,
          pose, source: "manual", unsaved: true },
      } }));
    });
    responses.push(json({ instanceId: "sin_OBC-1", ...pose, source: "manual" }, 200, '"sys:sys_1:4"'));
    commit("commit");
    await waitFor(() => expect(props.reload).toHaveBeenCalled());
    const put = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/poses/sin_OBC-1")) as unknown as [string, RequestInit];
    expect(put[1].method).toBe("PUT");
    expect(new Headers(put[1].headers).get("If-Match")).toBe('"sys:sys_1:3"');
    expect(JSON.parse(String(put[1].body))).toEqual(pose);
    expect(element.cancelMove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Position of OBC-1")).toBeTruthy();

    responses.push(json({ detail: "System has changed; reload it" }, 412, '"sys:sys_1:9"'));
    commit("commit");
    await waitFor(() => expect(element.cancelMove).toHaveBeenCalled());
  });

  it("reverts saved moves to where the board was when it was picked", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.fn(async (url: string) => (String(url).endsWith("/scene") ? json(mixed) : json({})));
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    await screen.findByTitle(/^4 boards/);
    const element = document.querySelector("prism-semantic-viewer") as unknown as HTMLElement & Record<string, unknown>;
    await act(async () => undefined);
    element.cancelMove = vi.fn();
    const picked = { translationMm: [1, 2, 3], rotation: [0, 0, 0, 1] };
    const send = (phase: string, pose: unknown, unsaved: boolean) => act(() => {
      element.dispatchEvent(new CustomEvent("prism-semantic-viewer:move", { detail: {
        phase, allowed: true, enabled: true, space: "world", dragging: false,
        target: { occurrence: "/sin_OBC-1", instanceId: "sin_OBC-1", displayPath: "OBC-1", kind: "board", restricted: false,
          pose, source: "manual", unsaved },
      } }));
    });
    send("target", picked, false);
    const revert = () => screen.getByRole("button", { name: "Revert" }) as HTMLButtonElement;
    expect(revert().disabled).toBe(true);
    send("commit", { translationMm: [40, 2, 3], rotation: [0, 0, 0, 1] }, true);
    await waitFor(() => expect(revert().disabled).toBe(false));
    fireEvent.click(revert());
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/poses/sin_OBC-1"))).toHaveLength(2));
    const put = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/poses/sin_OBC-1"))[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(put[1].body))).toEqual(picked);
    send("sync", picked, false); // the viewer's re-read
    await waitFor(() => expect(revert().disabled).toBe(true));
  });

  it("asks before moving a mated board, moves its stack in one save and reverts it (SB2-38)", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const flip = [1, 0, 0, 0];
    const mated = scene([
      occurrence("CMBD"),
      occurrence("OBC-1", { pose: { translationMm: [-8, -1, -9], rotation: flip, source: "auto" },
        mate: { linkId: "slk_j15", from: "/sin_CMBD", overridden: false, autoPose: { translationMm: [-8, -1, -9], rotation: flip } } }),
    ], [asset("CMBD"), asset("OBC-1")]);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn(async (url: string) => (String(url).endsWith("/scene") ? json(mated) : json({ poses: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    await screen.findByTitle(/^2 boards/);
    const element = document.querySelector("prism-semantic-viewer") as unknown as HTMLElement & Record<string, unknown>;
    await act(async () => undefined);
    element.cancelMove = vi.fn();
    const send = (phase: string, pose: unknown, unsaved: boolean) => act(() => {
      element.dispatchEvent(new CustomEvent("prism-semantic-viewer:move", { detail: {
        phase, allowed: true, enabled: true, space: "world", dragging: false,
        target: { occurrence: "/sin_OBC-1", instanceId: "sin_OBC-1", displayPath: "OBC-1", kind: "board", restricted: false,
          pose, source: "auto", unsaved },
      } }));
    });
    const poseCalls = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes("/poses")) as unknown as [string, RequestInit][];
    send("target", { translationMm: [-8, -1, -9], rotation: flip }, false);
    expect(screen.getByText("Mated")).toBeTruthy();
    send("commit", { translationMm: [2, -1, -9], rotation: flip }, true);
    await screen.findByRole("group", { name: "Moving a mated board" });
    expect(poseCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Move with its stack" }));
    await waitFor(() => expect(poseCalls()).toHaveLength(1));
    const [url, init] = poseCalls()[0];
    expect([url.endsWith("/poses"), init.method]).toEqual([true, "PATCH"]);
    const body = JSON.parse(String(init.body));
    expect(body.clear).toEqual([]);
    expect(body.poses.map((p: { instanceId: string }) => p.instanceId)).toEqual(["sin_CMBD"]);
    expect(body.poses[0].translationMm.map((v: number) => Math.round(v * 1e6) / 1e6)).toEqual([10, 0, 0]);

    const revert = screen.getByRole("button", { name: "Revert" }) as HTMLButtonElement;
    await waitFor(() => expect(revert.disabled).toBe(false));
    fireEvent.click(revert);
    await waitFor(() => expect(poseCalls()).toHaveLength(2));
    expect(JSON.parse(String(poseCalls()[1][1].body))).toEqual({ poses: [], clear: ["sin_CMBD"] });
  });

  it("traces a clicked board net to its system net and lights it on every board (D-P2-28)", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const spi = { groupId: "g_spi", name: "OBC_SPI_SCK", aliases: ["OBC_SPI_SCK", "SPI_SCK"], pinCount: 2, large: false, boards: 2 };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/scene")) return json(mixed);
      if (String(url).includes("/semantic-index/")) return new Response(JSON.stringify({ detail: "no index here" }), { status: 404 });
      if (String(url).includes("/nets?")) return json({ systemId: "sys_1", groups: [spi], total: 1 });
      return json({ ...spi, members: [
        { occurrence: "/sin_OBC-1", displayPath: "OBC-1", net: "/SPI_SCK" },
        { occurrence: "/sin_OBC-2", displayPath: "OBC-2", net: "OBC_SPI_SCK" },
      ], hops: [{ kind: "row", linkName: "OBC-1 J3 ↔ OBC-2 J1",
        from: { occurrence: "/sin_OBC-2", displayPath: "OBC-2", reference: "J1", pad: "12" },
        to: { occurrence: "/sin_OBC-1", displayPath: "OBC-1", reference: "J3", pad: "12" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    await screen.findByTitle(/^4 boards/);
    const element = document.querySelector("prism-semantic-viewer") as unknown as HTMLElement & Record<string, unknown>;
    element.setNetEmphasis = vi.fn(() => []);
    element.frameParts = vi.fn(() => true);
    await act(async () => undefined);
    const select = (selection: unknown) => act(() => {
      element.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange", { detail: { selection } }));
    });
    select({ kind: "net", sourceContext: "3D", netName: "/SPI_SCK", occurrence: "/sin_OBC-1" });

    expect(await screen.findByText("SPI_SCK")).toBeTruthy();
    const lookup = fetchMock.mock.calls.map((call) => String(call[0])).find((url) => url.includes("/nets?") && url.includes("net="))!;
    expect(new URL(lookup, "http://x").searchParams.get("occurrence")).toBe("/sin_OBC-1");
    expect(new URL(lookup, "http://x").searchParams.get("net")).toBe("/SPI_SCK");
    await waitFor(() => expect(element.setNetEmphasis).toHaveBeenLastCalledWith([{
      key: "trace", color: "#14ff33",
      members: [{ occurrence: "/sin_OBC-1", net: "/SPI_SCK" }, { occurrence: "/sin_OBC-2", net: "OBC_SPI_SCK" }],
    }]));
    // The hop reads from the clicked board outward, and frames its two connectors.
    fireEvent.click(screen.getByTitle("Frame this connection"));
    expect(element.frameParts).toHaveBeenCalledWith([
      { occurrence: "/sin_OBC-1", reference: "J3" }, { occurrence: "/sin_OBC-2", reference: "J1" },
    ]);

    select(null);
    await waitFor(() => expect(element.setNetEmphasis).toHaveBeenLastCalledWith([]));
    expect(screen.queryByText("SPI_SCK")).toBeNull();
  });

  it("searches system nets: a pick traces one, Shift adds it to the highlighted nets (SB2-33)", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const can = { groupId: "g_can", name: "CAN0_N", aliases: ["CAN0_N"], pinCount: 2, large: false, boards: 1,
      members: [{ occurrence: "/sin_OBC-1", net: "CAN0_N" }] };
    const fetchMock = vi.fn(async (url: string) => {
      const text = String(url);
      if (text.endsWith("/scene")) return json(mixed);
      if (text.includes("/semantic-index/")) return json({
        schema: "prism.semantic_index_a0", sourceRevisionKey: "src", components: [], terminals: [], indexes: {},
        nets: [{ netUid: "n1", name: "CAN0_N", netCode: 1 }],
      });
      if (text.includes("/nets?")) return json({ systemId: "sys_1", groups: [can], total: 1 });
      return json({ ...can, members: [{ occurrence: "/sin_OBC-1", displayPath: "OBC-1", net: "CAN0_N" }], hops: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    await screen.findByTitle(/^4 boards/);
    const element = document.querySelector("prism-semantic-viewer") as unknown as HTMLElement & Record<string, unknown>;
    element.setSelection = vi.fn();
    element.setNetEmphasis = vi.fn(() => []);
    element.frameNetEmphasis = vi.fn(() => true);
    await act(async () => undefined);
    const field = screen.getByRole("combobox", { name: "Find component or net" });
    fireEvent.focusIn(field); // SB2-98: the system-net index loads when the search opens
    const find = async (query: string) => {
      fireEvent.change(field, { target: { value: query } });
      return screen.findByRole("option", { name: /CAN0_N\s*System net · OBC-1/ });
    };

    fireEvent.click(await find("can0"));
    expect(element.setSelection).toHaveBeenCalledWith({ occurrence: "/sin_OBC-1", netName: "CAN0_N" });
    expect(await screen.findByLabelText("System net CAN0_N")).toBeTruthy();

    await find("can0_n");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    await waitFor(() => expect(element.setNetEmphasis).toHaveBeenLastCalledWith([
      expect.objectContaining({ key: "trace" }),
      { key: "g_can", members: [{ occurrence: "/sin_OBC-1", net: "CAN0_N" }] },
    ]));
    expect(screen.getByRole("button", { name: "System nets" }).textContent).toBe("1");
  });

  it("asks before lighting a net over 200 pins, then lights its members", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    const gnd = { groupId: "g1", name: "GND", aliases: ["GND", "GND_3"], pinCount: 600, large: true };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/scene")) return json(mixed);
      if (String(url).includes("/nets?")) return json({ systemId: "sys_1", groups: [gnd], total: 1 });
      return json({ ...gnd, hops: [], members: [
        { occurrence: "/sin_OBC-1", displayPath: "OBC-1", net: "GND" },
        { occurrence: null, redacted: true },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);
    // The workspace's Nets tray holds the net list.
    const tray = document.body.appendChild(document.createElement("div"));
    render(<Scene3dTab {...props} netsSlot={tray} />);
    await screen.findByTitle(/^4 boards/);
    const element = document.querySelector("prism-semantic-viewer") as unknown as HTMLElement & Record<string, unknown>;
    element.setNetEmphasis = vi.fn(() => [{ key: "g1", color: "#14ff33", lit: 1, unresolved: [] }]);
    element.frameNetEmphasis = vi.fn(() => true);
    expect(tray.querySelector("[aria-label='Search system nets']")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search system nets"), { target: { value: "gnd" } });
    fireEvent.click(await screen.findByRole("button", { name: "Show" }));
    expect(await screen.findByText("Highlight GND?")).toBeTruthy();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/nets/g1"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    await waitFor(() => expect(element.setNetEmphasis).toHaveBeenLastCalledWith([
      { key: "g1", members: [{ occurrence: "/sin_OBC-1", net: "GND" }] },
    ]));
    expect(await screen.findByText(/1 on restricted boards/)).toBeTruthy();
    // A newly shown net is framed once, on the first board it reaches.
    expect(element.frameNetEmphasis).toHaveBeenCalledWith("g1", "/sin_OBC-1");
    fireEvent.click(screen.getByRole("button", { name: "Stop highlighting GND" }));
    await waitFor(() => expect(element.setNetEmphasis).toHaveBeenLastCalledWith([]));
  });

  it("shows a notice without WebGPU, and never reads the scene", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: undefined });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Scene3dTab {...props} />);
    expect(screen.getByText(/The 3D view needs WebGPU/)).toBeTruthy();
    expect(document.querySelector("prism-semantic-viewer")).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String((call as unknown[])[0]).includes("/scene"))).toBe(false));
  });
});
