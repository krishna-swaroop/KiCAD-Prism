import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./ending-api", () => ({ getEndingParts: vi.fn(), setRestriction: vi.fn(), retireComponent: vi.fn(), dismissEnding: vi.fn() }));

import type { EndingPart } from "@/types/supply";
import * as api from "./ending-api";
import { EndingNotifications } from "./ending-notifications";
import { forgetServerState } from "@/lib/server-state";

const item = (over: Partial<EndingPart> = {}): EndingPart => ({
  component: { id: "c1", name: "Op amp", mpn: "LM358DR", manufacturer: "Texas Instruments", stage: "released" },
  part_id: "p1",
  reasons: [{ kind: "nrnd", text: "Not recommended for new designs", source: "Distributors" }, { kind: "outlook", text: "Outlook: under two years", source: "Prism's outlook" }],
  last_buy: [{ source: "DigiKey", value: "2027-03-31" }],
  stock: 4200,
  status: "warning",
  problem: null,
  lifecycle: "nrnd",
  fetched_at: null,
  projects: [{ project_id: "pr1", name: "Power board", quantity: 2 }],
  restriction: null,
  dismissed: false,
  dismissal_waiting: false,
  role: "main",
  healthy: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getEndingParts).mockResolvedValue({ items: [item()], tracked: 10, more: 0 });
  vi.mocked(api.setRestriction).mockResolvedValue(undefined);
  vi.mocked(api.retireComponent).mockResolvedValue(undefined);
  vi.mocked(api.dismissEnding).mockResolvedValue({ id: "d1", state: "approved" });
});
afterEach(cleanup);

describe("ending parts on the Dashboard", () => {
  it("names the component with why, the last buy date, stock and the projects that use it", async () => {
    render(<EndingNotifications role="qa" onOpenComponent={vi.fn()} />);
    expect(await screen.findByText("1 library component's part is ending")).toBeTruthy();
    expect(screen.getByText("Not recommended for new designs · Outlook: under two years · Last buy 2027-03-31 · Power board")).toBeTruthy();
    expect(screen.getByText("4,200")).toBeTruthy();
  });

  it("opens the component", async () => {
    const open = vi.fn();
    render(<EndingNotifications role="qa" onOpenComponent={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "Op amp" }));
    expect(open).toHaveBeenCalledWith("c1");
  });

  it("marks a component not for new designs with a reason", async () => {
    render(<EndingNotifications role="qa" onOpenComponent={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Not for new designs" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "NRND since 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark" }));
    await waitFor(() => expect(api.setRestriction).toHaveBeenCalledWith("c1", "not_for_new_designs", "NRND since 2026"));
  });

  it("shows the projects that use it before retiring, and retires through the catalog", async () => {
    render(<EndingNotifications role="admin" onOpenComponent={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retire" }));
    expect(screen.getByText("Tracked projects that use it")).toBeTruthy();
    expect(screen.getByText(/Power board, 2 per board/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Retire" }).at(-1) as HTMLElement);
    await waitFor(() => expect(api.retireComponent).toHaveBeenCalledWith("c1", expect.stringContaining("Not recommended")));
  });

  it("lists an ending alternate as one, and offers no retirement while the component has healthy parts", async () => {
    vi.mocked(api.getEndingParts).mockResolvedValue({ items: [item({ role: "alternate", healthy: 1 })], tracked: 10, more: 0 });
    render(<EndingNotifications role="admin" onOpenComponent={vi.fn()} />);
    expect(await screen.findByText(/^Alternate · 1 healthy part · Not recommended/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not for new designs" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
  });

  it("dismisses for the reasons it has now", async () => {
    render(<EndingNotifications role="qa" onOpenComponent={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.dismissEnding).toHaveBeenCalledWith("c1", ["nrnd", "outlook"]));
  });

  it("lets a designer ask QA to dismiss, once", async () => {
    vi.mocked(api.dismissEnding).mockResolvedValue({ id: "d1", state: "proposed" });
    render(<EndingNotifications role="designer" onOpenComponent={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Ask QA to dismiss" }));
    await waitFor(() => expect(api.dismissEnding).toHaveBeenCalledWith("c1", ["nrnd", "outlook"]));
    cleanup();
    // The mocked write skips `changesSupply`, so the kept list is forgotten here, as a real write would have it read again.
    forgetServerState([]);
    vi.mocked(api.getEndingParts).mockResolvedValue({ items: [item({ dismissal_waiting: true })], tracked: 10, more: 0 });
    render(<EndingNotifications role="designer" onOpenComponent={vi.fn()} />);
    expect((await screen.findByRole("button", { name: "Asked QA" })).hasAttribute("disabled")).toBe(true);
  });

  it("lists only components nobody has decided about, and nothing when there are none", async () => {
    vi.mocked(api.getEndingParts).mockResolvedValue({
      items: [item({ restriction: { level: "not_for_new_designs", reason: "", replacement_component_id: null, set_by: "qa", set_at: "2026-10-17" } }), item({ component: { ...item().component, id: "c2" }, dismissed: true })],
      tracked: 2, more: 0,
    });
    const { container } = render(<EndingNotifications role="qa" onOpenComponent={vi.fn()} />);
    await waitFor(() => expect(api.getEndingParts).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });

  it("offers no decision to someone who cannot make it, and says why it failed to load", async () => {
    render(<EndingNotifications role="designer" onOpenComponent={vi.fn()} />);
    await screen.findByText("Op amp");
    expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
    cleanup();
    forgetServerState([]);
    vi.mocked(api.getEndingParts).mockRejectedValueOnce(new Error("Could not load the ending parts"));
    render(<EndingNotifications role="qa" onOpenComponent={vi.fn()} />);
    expect(await screen.findByText("Could not load the ending parts")).toBeTruthy();
  });
});
