import { StrictMode, useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AssetTextHttpError } from "@/lib/ecad-renderer";
import { loadPanelAssetText } from "./panel-api";
import { usePanelAssetLoader } from "./use-panel-asset-loader";

vi.mock("./panel-api", () => ({ loadPanelAssetText: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function Preview({ load }: { load: (url: string) => Promise<string> }) {
  useEffect(() => {
    void load("symbol").catch(() => undefined);
    void load("footprint").catch(() => undefined);
  }, [load]);
  return null;
}
function Detail({ onAuth }: { onAuth: () => void }) {
  return <Preview load={usePanelAssetLoader(onAuth)} />;
}

it.each([401, 403])("reports concurrent preview %s failures once, including StrictMode remounts", async (status) => {
  vi.mocked(loadPanelAssetText).mockRejectedValue(new AssetTextHttpError(status));
  const onAuth = vi.fn();
  const view = render(<StrictMode><Detail onAuth={onAuth} /></StrictMode>);
  await waitFor(() => expect(onAuth).toHaveBeenCalledTimes(1));
  view.unmount();
});

it("ignores authentication failures from a detail screen that has closed", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(loadPanelAssetText).mockReturnValue(new Promise<string>((_resolve, fail) => { reject = fail; }));
  const onAuth = vi.fn();
  const view = render(<Detail onAuth={onAuth} />);
  view.unmount();
  await act(async () => reject(new AssetTextHttpError(401)));
  expect(onAuth).not.toHaveBeenCalled();
});

it("leaves transient errors to the preview retry UI", async () => {
  vi.mocked(loadPanelAssetText).mockRejectedValue(new AssetTextHttpError(503));
  const onAuth = vi.fn();
  const view = render(<Detail onAuth={onAuth} />);
  await act(async () => {});
  expect(onAuth).not.toHaveBeenCalled();
  view.unmount();
});
