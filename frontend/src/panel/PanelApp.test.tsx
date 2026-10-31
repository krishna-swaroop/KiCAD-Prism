import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PanelApp } from "./PanelApp";
import { sendRpcCommand, uninstallBridge } from "./lib/kicad-bridge";

vi.mock("./lib/panel-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./lib/panel-api")>(),
  getCategories: vi.fn(async () => []),
}));
vi.mock("./screens/SymbolFinderScreen", () => ({ SymbolFinderScreen: () => <div>Finder</div> }));
vi.mock("./screens/CategoryListScreen", () => ({ CategoryListScreen: () => null }));
vi.mock("./screens/PartDetailScreen", () => ({ PartDetailScreen: ({ componentId }: { componentId: string }) => <div>Detail {componentId}</div> }));

type Envelope = { command: string; session_id: string; message_id: number; response_to?: number };
const native = window as unknown as {
  webkit?: { messageHandlers: { kicad: { postMessage: (payload: string) => void } } };
  kiclient?: { postMessage?: (payload: unknown) => void; _msgBacklog?: unknown[] };
};

afterEach(() => {
  uninstallBridge();
  delete native.webkit;
  delete native.kiclient;
});

it("keeps the native bridge installed through Strict Mode effect replay", async () => {
  const posted: Envelope[] = [];
  native.kiclient = { _msgBacklog: [{ command: "NEW_SESSION", session_id: "strict-mode", message_id: 1 }] };
  native.webkit = { messageHandlers: { kicad: { postMessage(payload) {
    const request = JSON.parse(payload) as Envelope;
    posted.push(request);
    if (request.command === "GET_SOURCE_INFO") {
      native.kiclient?.postMessage?.({ session_id: request.session_id, response_to: request.message_id, status: "OK", parameters: {} });
    }
  } } } };
  const { unmount } = render(<StrictMode><PanelApp /></StrictMode>);
  await waitFor(() => expect(posted.filter((request) => request.command === "GET_SOURCE_INFO")).toHaveLength(1));
  expect(native.kiclient.postMessage).toBeTypeOf("function");
  let pending!: Promise<unknown>;
  act(() => { pending = sendRpcCommand("PLACE_COMPONENT"); });
  const rejected = expect(pending).rejects.toMatchObject({ kind: "unknown_outcome" });
  unmount();
  await rejected;
});

it("opens the component named in the address, the one whose part page in Prism was closed, and drops it from the address", async () => {
  window.history.replaceState(null, "", "/remote-provider/panel?component=cmp-7");
  const { unmount } = render(<StrictMode><PanelApp /></StrictMode>);
  expect(await screen.findByText("Detail cmp-7")).toBeTruthy();
  expect(window.location.search).toBe("");
  unmount();
});

it("starts at the finder when the address names no component", async () => {
  window.history.replaceState(null, "", "/remote-provider/panel");
  const { unmount } = render(<PanelApp />);
  expect(await screen.findByText("Finder")).toBeTruthy();
  unmount();
});
