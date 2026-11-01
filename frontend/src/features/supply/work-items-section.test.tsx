import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./work-items-api", () => ({
  listWorkItems: vi.fn(), createWorkItem: vi.fn(), updateWorkItem: vi.fn(), decideWorkItem: vi.fn(), workItemHistory: vi.fn(),
}));

import type { SupplyWorkItem } from "./work-items-api";
import * as api from "./work-items-api";
import { WorkItemButton } from "./work-item-dialog";
import { WorkItemsSection } from "./work-items-section";
import { forgetServerState } from "@/lib/server-state";

const mocked = vi.mocked(api);
const item = (over: Partial<SupplyWorkItem> = {}): SupplyWorkItem => ({
  id: "w1", subject_kind: "part", subject_id: "p1", subject_name: "OLD-1, Acme", title: "Find a second source", action: "alternate",
  owner: "dee@example.com", state: "open", evidence: [{ text: "Obsolete since March", by: "dee@example.com", at: "2026-10-20T10:00:00Z" }],
  projects: [{ project_id: "prj", name: "Power board" }], recheck_on: "2026-11-01", created_by: "dee@example.com",
  created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listWorkItems.mockResolvedValue([item()]);
  mocked.decideWorkItem.mockResolvedValue(item({ state: "accepted" }));
  mocked.workItemHistory.mockResolvedValue([{ at: "2026-10-20T10:00:00Z", actor: "dee@example.com", action: "create", detail: {} }]);
});
afterEach(() => {
  cleanup();
  forgetServerState([]);
});

describe("work items in Review", () => {
  it("lists an item with its subject, action, owner, recheck and projects, and QA accepts it", async () => {
    render(<WorkItemsSection email="qa@example.com" canFollow canDecide />);
    expect(await screen.findByText("OLD-1, Acme · Find an alternate · dee@example.com · Recheck 2026-11-01 · Power board")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocked.decideWorkItem).toHaveBeenCalledWith("w1", "accepted"));
  });

  it("offers a designer no decision, only Done on an item they own, and switches lists", async () => {
    render(<WorkItemsSection email="dee@example.com" canFollow canDecide={false} />);
    const row = within((await screen.findByText("Find a second source")).closest("li")!);
    expect(row.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(row.getByRole("button", { name: "Done" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    await waitFor(() => expect(mocked.listWorkItems).toHaveBeenLastCalledWith("mine", expect.anything()));
  });

  it("keeps the lists when nothing is open, so a done item can still be found and reopened", async () => {
    mocked.listWorkItems.mockImplementation(async (list) => (list === "done" ? [item({ state: "done" })] : []));
    render(<WorkItemsSection email="qa@example.com" canFollow canDecide />);
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(mocked.decideWorkItem).toHaveBeenCalledWith("w1", "open"));
  });

  it("says a list could not be read instead of showing it empty", async () => {
    mocked.listWorkItems.mockRejectedValueOnce(new Error("Service Unavailable"));
    render(<WorkItemsSection email="qa@example.com" canFollow canDecide />);
    expect(await screen.findByText("Service Unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Find a second source")).toBeTruthy();
  });

  it("offers no Done to someone who neither owns nor opened the item", async () => {
    render(<WorkItemsSection email="eve@example.com" canFollow canDecide={false} />);
    const row = within((await screen.findByText("Find a second source")).closest("li")!);
    expect(row.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("shows an item's evidence and history, and adds a note", async () => {
    mocked.updateWorkItem.mockResolvedValue(item({ evidence: [...item().evidence, { text: "Asked the maker", by: "dee@example.com", at: "2026-10-21T10:00:00Z" }] }));
    render(<WorkItemsSection email="dee@example.com" canFollow canDecide={false} />);
    fireEvent.click(await screen.findByText("Find a second source"));
    expect(await screen.findByText("Obsolete since March")).toBeTruthy();
    expect(await screen.findByText(/^create · dee@example.com/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Asked the maker" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Asked the maker")).toBeTruthy();
    expect(mocked.updateWorkItem).toHaveBeenCalledWith("w1", { note: "Asked the maker" });
  });

  it("opens an item about a component from its button", async () => {
    mocked.createWorkItem.mockResolvedValue(item());
    const created = vi.fn();
    render(<WorkItemButton subject={{ kind: "component", id: "c1" }} title="Op amp: ending" action="alternate" onCreated={created} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a work item" }));
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "dee@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(mocked.createWorkItem).toHaveBeenCalledWith({
      subject_kind: "component", subject_id: "c1", title: "Op amp: ending", action: "alternate", owner: "dee@example.com", note: "", recheck_on: null,
    }));
    expect(created).toHaveBeenCalledTimes(1);
  });
});
