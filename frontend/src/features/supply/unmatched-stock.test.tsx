import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InventorySource, InventoryUnmatchedPart } from "@/types/supply";

const listInventorySources = vi.fn();
const listUnmatchedParts = vi.fn();
const countUnmatchedParts = vi.fn();
const setUnmatchedIgnored = vi.fn();
vi.mock("./inventory-api", () => ({
  listInventorySources: () => listInventorySources(),
  listUnmatchedParts: (id: string, _signal?: AbortSignal, page?: unknown) => listUnmatchedParts(id, page),
  countUnmatchedParts: (id: string) => countUnmatchedParts(id),
  setUnmatchedIgnored: (id: string, parts: string[], ignore: boolean) => setUnmatchedIgnored(id, parts, ignore),
  linkUnmatchedPart: vi.fn(),
}));

const counts = (over: Record<string, number> = {}) => ({ waiting: 0, no_component: 0, sap_code_shared: 0, mpn_shared: 0, linked: 0, ignored: 0, ...over });

import { sameIdentity, UNMATCHED_PAGE, UnmatchedStockSection } from "./unmatched-stock";
import { forgetServerState } from "@/lib/server-state";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { countUnmatchedParts.mockImplementation(async () => counts({ waiting: 2, no_component: 2 })); });

const source = (id: string, unmatched: number, extra: Partial<InventorySource> = {}) => ({ id, display_name: id === "a" ? "Stores" : "Lab", unmatched, ...extra }) as InventorySource;
const part = (remote_part: string, quantity: number, extra: Partial<InventoryUnmatchedPart> = {}): InventoryUnmatchedPart => ({
  remote_part, ipn: "", mpn: `MPN-${remote_part}`, manufacturer: "Unknown manufacturer", name: `Part ${remote_part}`, quantity, records: 1,
  reason: "no_component", seen_at: "2026-10-28T10:00:00Z", ...extra,
});

describe("unmatched local stock", () => {
  it("lists every source's parts, largest stock first", async () => {
    listInventorySources.mockResolvedValue([source("a", 2), source("b", 0)]);
    listUnmatchedParts.mockImplementation(async (id: string) => (id === "a" ? [part("1", 5), part("2", 400, { ipn: "10042", reason: "sap_code_shared" })] : []));
    render(<UnmatchedStockSection canDecide />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual(["Part 2", "Part 1"]);
    expect(screen.getByText("Stores · SAP 10042 · MPN-2 · SAP code on several components")).toBeTruthy();
    // A source counting none unmatched may still hold linked rows waiting for a read.
    expect(listUnmatchedParts).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button", { name: "Link" })).toHaveLength(2);
  });

  it("shows nothing when nothing waits, and no actions to those who cannot decide", async () => {
    listInventorySources.mockResolvedValue([source("a", 1)]);
    listUnmatchedParts.mockResolvedValue([part("1", 5)]);
    render(<UnmatchedStockSection canDecide={false} />);
    expect(await screen.findByText("Part 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
    cleanup();
    forgetServerState([]);
    listInventorySources.mockResolvedValue([]);
    const { container } = render(<UnmatchedStockSection canDecide />);
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });

  it("keeps a linked part listed, with its component and the next read, and does not count it", async () => {
    listInventorySources.mockResolvedValue([source("a", 0, { last_sync_at: "2026-10-28T10:00:00Z", interval_hours: 1 })]);
    listUnmatchedParts.mockResolvedValue([part("1", 825, { linked_component_id: "c1", linked_mpn: "RC0603FR-0710KL" })]);
    countUnmatchedParts.mockResolvedValue(counts({ linked: 1 }));
    render(<UnmatchedStockSection canDecide />);
    fireEvent.click(await screen.findByRole("button", { name: /^Linked/ }));
    expect(await screen.findByText(/^Linked · RC0603FR-0710KL · next read /)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unmatched local stock/ }).textContent).toContain("0");
  });

  it("asks for a page at a time, searches on the server and counts every part waiting", async () => {
    listInventorySources.mockResolvedValue([source("a", 859)]);
    countUnmatchedParts.mockResolvedValue(counts({ waiting: 859, no_component: 859 }));
    listUnmatchedParts.mockImplementation(async (_id: string, page: { limit: number }) =>
      Array.from({ length: page.limit }, (_, index) => part(String(index), 1000 - index)));
    render(<UnmatchedStockSection canDecide />);
    // A long section starts closed.
    fireEvent.click(await screen.findByRole("button", { name: /Unmatched local stock/ }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(UNMATCHED_PAGE);
    expect(listUnmatchedParts).toHaveBeenLastCalledWith("a", { q: "", limit: UNMATCHED_PAGE + 1, group: "waiting" });
    expect(screen.getByRole("button", { name: /Unmatched local stock/ }).textContent).toContain("859");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(UNMATCHED_PAGE * 2));
    fireEvent.change(screen.getByRole("textbox", { name: "Search unmatched stock" }), { target: { value: "MPN-7" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(listUnmatchedParts).toHaveBeenLastCalledWith("a", { q: "MPN-7", limit: UNMATCHED_PAGE + 1, group: "waiting" }));
  });
});

describe("working through unmatched stock in groups", () => {
  it("counts every group across sources and asks for the one chosen", async () => {
    listInventorySources.mockResolvedValue([source("a", 3), source("b", 1)]);
    countUnmatchedParts.mockImplementation(async (id: string) => (id === "a" ? counts({ waiting: 3, mpn_shared: 3, ignored: 2 }) : counts({ waiting: 1, no_component: 1 })));
    listUnmatchedParts.mockResolvedValue([part("1", 5)]);
    render(<UnmatchedStockSection canDecide />);
    const ignored = await screen.findByRole("button", { name: /^Ignored/ });
    expect(ignored.textContent).toContain("2");
    expect(screen.getByRole("button", { name: /^Waiting/ }).textContent).toContain("4");
    fireEvent.click(screen.getByRole("button", { name: /^MPN on several components/ }));
    await waitFor(() => expect(listUnmatchedParts).toHaveBeenLastCalledWith("b", { q: "", limit: UNMATCHED_PAGE + 1, group: "mpn_shared" }));
  });

  it("ignores the rows picked after a confirmation, and restores from Ignored in one step", async () => {
    listInventorySources.mockResolvedValue([source("a", 2)]);
    listUnmatchedParts.mockResolvedValue([part("1", 5), part("2", 9)]);
    setUnmatchedIgnored.mockResolvedValue({ changed: 2 });
    render(<UnmatchedStockSection canDecide />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select every row shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    expect(screen.getByRole("heading", { name: "Ignore 2 unmatched parts" })).toBeTruthy();
    expect(setUnmatchedIgnored).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Ignore" }).at(-1) as HTMLElement);
    await waitFor(() => expect(setUnmatchedIgnored).toHaveBeenCalledWith("a", ["2", "1"], true));
    fireEvent.click(screen.getByRole("button", { name: /^Ignored/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Part 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(setUnmatchedIgnored).toHaveBeenLastCalledWith("a", ["1"], false));
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
  });
});

describe("the identity check before linking", () => {
  it("is the same part on the MPN, spelled any way, or on the SAP code", () => {
    expect(sameIdentity({ mpn: "rc0603fr-0710kl", ipn: "" }, { mpn: "RC0603FR0710KL", sap_code: "" })).toBe(true);
    expect(sameIdentity({ mpn: "", ipn: "10042" }, { mpn: "X", sap_code: "10042" })).toBe(true);
    expect(sameIdentity({ mpn: "TNPW060310K0BEEA", ipn: "12723" }, { mpn: "RC0603FR-0710KL", sap_code: "" })).toBe(false);
    expect(sameIdentity({ mpn: "", ipn: "" }, { mpn: "", sap_code: "" })).toBe(false);
  });
});
