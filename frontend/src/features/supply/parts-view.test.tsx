import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "@/lib/api";
import type { User, UserRole } from "@/types/auth";
import { partForecastFixture } from "./forecast-test-fixtures";
import { connectorFixture, insightFixture, partDetailFixture, partRowFixture, priceFixture } from "./supply-test-fixtures";
import { forgetServerState } from "@/lib/server-state";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Recharts is slow to load cold and is not what these tests are about; part-history.test.tsx covers the chart.
vi.mock("./part-history-chart", () => ({
  default: ({ threshold, kind }: { threshold: number | null; kind: string }) => (
    <div role="img" aria-label={`${kind} chart`} data-threshold={threshold ?? "none"} />
  ),
}));

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  listSupplyParts: vi.fn(),
  listSupplyConnectors: vi.fn(),
  getLibraryComponentOf: vi.fn(),
  getPartForecast: vi.fn(),
  getSupplyPart: vi.fn(),
  getPartHistory: vi.fn(),
  listSupplyManufacturers: vi.fn(),
  refreshSupplyUsage: vi.fn(),
  getSupplyAssessment: vi.fn(),
  getPartDatasheet: vi.fn(),
  getPartCompliance: vi.fn(),
  listPartNotices: vi.fn(),
}));
vi.mock("./tracking-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tracking-api")>()),
  followNumber: vi.fn(),
  followPart: vi.fn(),
  stopTrackingPart: vi.fn(),
}));

import { PartsView } from "./parts-view";
import * as api from "./supply-api";
import * as trackingApi from "./tracking-api";

const mocked = vi.mocked(api);
const tracking = vi.mocked(trackingApi);

function userWith(role: UserRole): User {
  return { name: role, email: `${role}@example.com`, role };
}

function Location() {
  const location = useLocation();
  return <output aria-label="location">{location.search}</output>;
}

function renderView(role: UserRole = "designer", url = "/?section=supply") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <PartsView user={userWith(role)} />
      <Location />
    </MemoryRouter>,
  );
}

const search = () => screen.getByLabelText("location").textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listPartNotices.mockResolvedValue([]);
  mocked.getPartCompliance.mockResolvedValue({ rohs: { state: "unknown", reason: "" }, reach: { state: "unknown", reason: "" }, substances: [], exemptions: [], facts: [], list: { loaded: false, substances: 0, loaded_at: null, loaded_by: "", source_name: "" } });
  mocked.getPartDatasheet.mockResolvedValue({ url: "" });
  mocked.listSupplyParts.mockResolvedValue({ items: [partRowFixture()], total: 1, limit: 100, offset: 0, next_offset: null, forecast_state: {} });
  mocked.getSupplyPart.mockResolvedValue(partDetailFixture());
  mocked.getPartHistory.mockResolvedValue({
    days: 90, currency: "EUR", total: [["2026-03-01", 12500]], events: [],
    connectors: [{ connector_id: "c1", name: "Mouser EU", provider: "mouser", last_read: "2026-03-01T00:00:00Z", stale: false, stock: [["2026-03-01", 12500]], price: [] }],
  });
  mocked.listSupplyConnectors.mockResolvedValue([connectorFixture({ id: "c-mouser", provider: "mouser", display_name: "Mouser EU", enabled: true })]);
  mocked.getLibraryComponentOf.mockResolvedValue({ component_id: null });
  mocked.getPartForecast.mockResolvedValue(partForecastFixture());
  mocked.refreshSupplyUsage.mockResolvedValue({ updated: 0, unchanged: 0, without_index: 0, removed: 0 });
  mocked.listSupplyManufacturers.mockResolvedValue({ items: [{ id: "m1", name: "Texas Instruments", part_count: 3 }] });
});
afterEach(cleanup);

describe("the parts list", () => {
  it("narrows to a group from the URL and lets it go", async () => {
    renderView("designer", "/?section=supply&partsOnly=out_of_stock");
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenCalledWith("followed", "", expect.anything(), "out_of_stock", 0, 50, "", ""));
    fireEvent.click(await screen.findByRole("button", { name: /Showing only Out of stock/ }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", ""));
    expect(search()).not.toContain("partsOnly");
  });

  it("filters by one vendor from the menu, in its colour", async () => {
    renderView("designer", "/?section=supply");
    fireEvent.click(await screen.findByRole("combobox", { name: "Vendor" }));
    const option = await screen.findByRole("option", { name: "Mouser EU" });
    expect(option.querySelector("[style]")).not.toBeNull();
    fireEvent.click(option);
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", "c-mouser"));
    expect(search()).toContain("partsVendor=c-mouser");
  });

  it("filters by one lifecycle from the menu", async () => {
    renderView("designer", "/?section=supply");
    fireEvent.click(await screen.findByRole("combobox", { name: "Lifecycle" }));
    fireEvent.click(await screen.findByRole("option", { name: "Obsolete" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "lifecycle_obsolete", 0, 50, "", ""));
    expect(search()).toContain("partsOnly=lifecycle_obsolete");
  });

  it("shows each part with its status, stock, price and lifecycle", async () => {
    renderView();
    const row = (await screen.findByRole("button", { name: "LM358D" })).closest("tr")!;
    expect(within(row).getByText("Texas Instruments")).toBeTruthy();
    expect(within(row).getByRole("img", { name: "OK" })).toBeTruthy();
    expect(within(row).getByText((12500).toLocaleString())).toBeTruthy();
    expect(within(row).getByText(/0\.52/)).toBeTruthy();
    expect(within(row).queryByRole("img", { name: "Active" })).toBeNull();
    expect(within(row).queryByRole("img", { name: "Read 2 h ago" })).toBeNull();
    expect(within(row).queryByRole("img", { name: /^Tracked/ })).toBeNull();
    expect(screen.getByText("1 part")).toBeTruthy();
    expect(mocked.listSupplyParts).toHaveBeenCalledWith("followed", "", expect.anything(), "", 0, 50, "", "");
  });

  it("says plainly when a part has not been read yet", async () => {
    mocked.listSupplyParts.mockResolvedValue({
      items: [partRowFixture({ status: "unknown", stock: null, listings: 0, unit_price: null, currency: "", fetched_at: null, tier: null })],
      total: 1, limit: 100, offset: 0, next_offset: null, forecast_state: {},
    });
    renderView();
    const row = (await screen.findByRole("button", { name: "LM358D" })).closest("tr")!;
    expect(within(row).getByText("None yet")).toBeTruthy();
    expect(within(row).getByRole("img", { name: "No data" })).toBeTruthy();
  });

  it("loads the next page when the end of the list comes into view", async () => {
    class Seen { constructor(private readonly callback: IntersectionObserverCallback) {} observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); } disconnect() {} unobserve() {} }
    vi.stubGlobal("IntersectionObserver", Seen);
    mocked.listSupplyParts
      .mockResolvedValueOnce({ items: [partRowFixture()], total: 2, limit: 50, offset: 0, next_offset: 50, forecast_state: {} })
      .mockResolvedValueOnce({ items: [partRowFixture({ id: "p2", mpn: "LM324" })], total: 2, limit: 50, offset: 50, next_offset: null, forecast_state: {} });
    renderView();
    expect(await screen.findByRole("button", { name: "LM324" })).toBeTruthy();
    expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.any(AbortSignal), "", 50, 50, "", "");
    expect(screen.getByText("2 parts")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("does not read a failed page again while its end stays in view, only on Retry", async () => {
    // An observer that reports the end in view every time one is made, as a sentinel left on screen would be.
    class Seen { constructor(private readonly callback: IntersectionObserverCallback) {} observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); } disconnect() {} unobserve() {} }
    vi.stubGlobal("IntersectionObserver", Seen);
    mocked.listSupplyParts
      .mockResolvedValueOnce({ items: [partRowFixture()], total: 2, limit: 50, offset: 0, next_offset: 50, forecast_state: {} })
      .mockRejectedValueOnce(new Error("Service Unavailable"))
      .mockResolvedValueOnce({ items: [partRowFixture({ id: "p2", mpn: "LM324" })], total: 2, limit: 50, offset: 50, next_offset: null, forecast_state: {} });
    renderView();
    const retry = await screen.findByRole("button", { name: "Retry" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocked.listSupplyParts).toHaveBeenCalledTimes(2);
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "LM324" })).toBeTruthy();
    expect(mocked.listSupplyParts).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("switches scope through the URL and asks for the other list", async () => {
    renderView();
    await screen.findByRole("button", { name: "LM358D" });
    fireEvent.click(screen.getByRole("button", { name: "Tier 1" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("tier1", "", expect.anything(), "", 0, 50, "", ""));
    expect(search()).toContain("partsScope=tier1");
    expect(screen.getByRole("button", { name: "Tier 1" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Tracked and in projects" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", ""));
    expect(search()).not.toContain("partsScope");
  });

  it("searches through the URL, and a link with a search starts there", async () => {
    renderView();
    await screen.findByRole("button", { name: "LM358D" });
    fireEvent.change(screen.getByLabelText("Search parts"), { target: { value: "  lm358  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "lm358", expect.anything(), "", 0, 50, "", ""));
    expect(search()).toContain("partsQ=lm358");
    cleanup();
    forgetServerState([]);

    renderView("designer", "/?section=supply&partsScope=tier1&partsQ=tps");
    await screen.findByRole("button", { name: "LM358D" });
    expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("tier1", "tps", expect.anything(), "", 0, 50, "", "");
    expect((screen.getByLabelText("Search parts") as HTMLInputElement).value).toBe("tps");
  });

  it("explains an empty list for each case", async () => {
    mocked.listSupplyParts.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0, next_offset: null, forecast_state: {} });
    mocked.listSupplyParts.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, next_offset: null, forecast_state: {} });
    renderView();
    expect(await screen.findByText("No tracked parts yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Track a part" })).toHaveLength(2);
    cleanup();
    forgetServerState([]);
    renderView("qa");
    expect(await screen.findByText("No tracked parts yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Track a part" })).toHaveLength(2);
    cleanup();
    forgetServerState([]);
    renderView("designer", "/?partsQ=zzz");
    expect(await screen.findByText("No parts match")).toBeTruthy();
    cleanup();
    forgetServerState([]);
    // All known left for the catalog: its old address shows the tracked parts.
    renderView("designer", "/?partsScope=all");
    expect(await screen.findByText("No tracked parts yet")).toBeTruthy();
  });

  it("reports a load failure and retries", async () => {
    mocked.listSupplyParts.mockRejectedValueOnce(new Error("Could not load parts"));
    renderView();
    expect(await screen.findByText("Could not load parts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "LM358D" })).toBeTruthy();
  });
});

describe("a part", () => {
  it("opens beside the list from the URL and shows stock, history and listings", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "LM358D" }));
    expect(search()).toContain("part=p1");
    const sheet = await screen.findByRole("dialog");
    const stock = await within(sheet).findByRole("region", { name: "Stock" });
    expect(within(stock).getByText("In stock")).toBeTruthy();
    expect(within(stock).getAllByText((12500).toLocaleString()).length).toBeGreaterThan(0);
    expect(within(sheet).getByRole("img", { name: "OK" })).toBeTruthy();
    expect(await within(sheet).findByRole("img", { name: "stock chart" })).toBeTruthy();
    expect(within(sheet).getByRole("article", { name: "Listing 595-LM358D" })).toBeTruthy();
    expect(mocked.getSupplyPart).toHaveBeenCalledWith("p1", expect.anything());
  });

  it("heads the sheet with the maker beside the number, no status words, a coloured lifecycle and a library link", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ part: { id: "p1", mpn: "LM358D", manufacturer: "Texas Instruments", first_seen: "2026-10-16" } as never, status: "error", lifecycle: "obsolete" }));
    mocked.getLibraryComponentOf.mockResolvedValue({ component_id: "cmp 1" });
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const title = await within(sheet).findByRole("heading", { name: /LM358D/ });
    expect(title.textContent).toContain("Texas Instruments");
    expect(within(sheet).queryByText(/Known to Prism/)).toBeNull();
    expect(within(sheet).queryByText(/At risk\./)).toBeNull();
    expect(within(sheet).getByText("Obsolete").className).toContain("destructive");
    const link = await within(sheet).findByRole("link", { name: "Open in the component library" });
    expect(link.getAttribute("href")).toBe("/?section=library-manager&libraryView=catalog&component=cmp%201&componentTab=sourcing");
  });

  it("keeps one legend for the stock, with each vendor's stock, and puts the forecast under the price and the quantity try above the listings", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ price: priceFixture({ currency: "EUR", history: [["2026-03-01", 0.5]] as never, trend: null }) }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const stock = await within(sheet).findByRole("region", { name: "Stock" });
    expect(within(stock).getAllByRole("list", { name: "Distributors drawn" })).toHaveLength(1);
    const legend = await within(stock).findByRole("button", { name: /Mouser EU/ });
    expect(legend.textContent).toContain("12,500");
    const order = [...sheet.querySelectorAll("section[aria-label], details[aria-label], [data-slot='collapsible'][aria-label]")].map((node) => node.getAttribute("aria-label") ?? node.id);
    const at = (name: string) => order.findIndex((item) => item === name || item.startsWith(`${name} (`));
    expect(at("Price")).toBeGreaterThan(at("Stock"));
    expect(at("Forecast")).toBeGreaterThan(at("Price"));
    // The notices follow the outlook, and the listings follow the notices.
    expect(at("Outlook")).toBeGreaterThan(at("Forecast"));
    expect(at("Notices")).toBe(at("Outlook") + 1);
    expect(at("Listings")).toBe(at("Notices") + 1);
    expect(at("Alternatives")).toBeGreaterThan(at("Listings"));
    expect(at("Compliance")).toBeGreaterThan(at("Alternatives"));
    // Listings fold, and start open.
    expect(within(sheet).getByRole("heading", { name: /^Listings \(/ }).closest("[data-state]")?.getAttribute("data-state")).toBe("open");
    // The forecast is folded until its chevron is opened.
    expect(within(sheet).queryByRole("heading", { name: "Forecast" })?.closest("[data-state]")?.getAttribute("data-state")).toBe("closed");
  });

  it("gives the price its own heading, vendors legend and chart like the stock", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({
      price: priceFixture({ currency: "EUR", history: [["2026-03-01", 0.5]] as never, trend: null }),
      distributor_history: {
        days: 90, currency: "EUR", total: [["2026-03-01", 12500]], events: [],
        connectors: [{ connector_id: "c1", name: "Mouser EU", provider: "mouser", last_read: "2026-03-01T00:00:00Z", stale: false, stock: [["2026-03-01", 12500]], price: [["2026-03-01", 0.5]] }],
      },
    }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const price = await within(sheet).findByRole("region", { name: "Price" });
    expect(await within(price).findByRole("img", { name: "price chart" })).toBeTruthy();
    expect(within(price).getByRole("list", { name: "Distributors drawn" })).toBeTruthy();
  });

  it("marks listings that do not count and offers that have not been read", async () => {
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(await within(sheet).findByRole("button", { name: /Show 1 more/ }));
    const near = await screen.findByRole("article", { name: "Listing 595-LM358DR" });
    expect(within(near).getByText("Near match, not counted")).toBeTruthy();
    expect(within(near).getByText("Not read yet.")).toBeTruthy();
    const main = screen.getByRole("article", { name: "Listing 595-LM358D" });
    expect(within(main).getByText("Cut tape")).toBeTruthy();
    expect(within(main).getByText("On order")).toBeTruthy();
    expect(within(main).getByText("5,000 due 2026-04-01")).toBeTruthy();
    const link = within(main).getByLabelText("Open Mouser EU product page");
    expect(link.getAttribute("href")).toBe("https://example.invalid/p");
    expect(link.textContent).toBe("595-LM358D");
    expect(main.querySelector("svg.lucide-external-link")).toBeNull();
  });

  it("tries a quantity from an icon on the Listings line, with the vendor in colour and its number in grey", async () => {
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const icon = await within(sheet).findByRole("button", { name: "Try a quantity" });
    const heading = within(sheet).getByRole("heading", { name: /^Listings \(/ });
    expect(heading.closest("[data-slot='collapsible']")?.contains(icon)).toBe(true);
    fireEvent.click(icon);
    fireEvent.change(await screen.findByLabelText("Try a quantity", { selector: "input" }), { target: { value: "500" } });
    const row = (await screen.findByText("(595-LM358D)")).closest("li")!;
    expect(within(row).getByText("Mouser EU").className).not.toContain("muted");
    expect(within(row).getByText("(595-LM358D)").className).toContain("text-muted-foreground");
    fireEvent.click(icon);
    await waitFor(() => expect(screen.queryByLabelText("Try a quantity", { selector: "input" })).toBeNull());
  });

  it("opens the stock trend beside the figure under its own Trend title, with no native hint", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({
      insight: insightFixture({
        confidence: "high", trend: "falling", decrease_per_day: 50, days_to_zero: 6, days_to_threshold: 2,
        restocks: 0, restock_interval_days: null, restock_expected_in_days: null,
        inputs: { points: 35, span_days: 34, points_in_run: 35, current: 300 },
      }),
    }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const icon = await within(sheet).findByRole("button", { name: "Show the stock trend and restock promises" });
    expect(icon.hasAttribute("title")).toBe(false);
    expect(icon.parentElement?.textContent).toContain("12,500");
    fireEvent.mouseEnter(icon);
    expect(await screen.findByRole("heading", { name: "Trend" })).toBeTruthy();
  });

  it("keeps the restock promises in the stock info modal, and has no datasheet or parameters section", async () => {
    mocked.getPartDatasheet.mockResolvedValue({ url: "https://acme.example/lm358.pdf" });
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({
      restock_record: [{ connector_id: "c1", name: "Mouser EU", provider: "mouser", open: { kind: "dated", quantity: 5000, expected: "2026-04-01", late: false, quoted_lead_days: null }, resolved: 3, kept: 2, stock_outs: 3 }] as never,
    }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("region", { name: "Restock promises" })).toBeNull();
    fireEvent.mouseEnter(await within(sheet).findByRole("button", { name: "Show the stock trend and restock promises" }));
    const promises = await screen.findByLabelText("Restock promises");
    expect(within(promises).getByText("kept 2 of 3 here")).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: "Open the datasheet" }).getAttribute("href")).toBe("https://acme.example/lm358.pdf");
    expect(within(sheet).queryByRole("heading", { name: "Datasheet" })).toBeNull();
    expect(within(sheet).queryByRole("heading", { name: "Parameters" })).toBeNull();
  });

  it("puts the alert rules behind a bell, only for a watched part, and keeps the alternatives closed", async () => {
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByRole("button", { name: "Alert rules for this part" })).toBeTruthy();
    expect(within(sheet).queryByRole("region", { name: "Alert rules" })).toBeNull();
    const alternatives = within(sheet).getByRole("heading", { name: "Alternatives" }).closest("[data-slot='collapsible']")!;
    expect(alternatives.getAttribute("data-state")).toBe("closed");
    expect(within(alternatives as HTMLElement).getByRole("button", { name: "Find alternatives" })).toBeTruthy();
    cleanup();
    forgetServerState([]);
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ watch: null }));
    renderView("designer", "/?part=p1");
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Alert rules for this part" })).toBeNull());
  });

  it("closes on one Escape, even with a hover popover open", async () => {
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    fireEvent.mouseEnter(await within(sheet).findByRole("button", { name: /Show how the outlook/ }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(search()).not.toContain("part="));
  });

  it("puts the lifecycle tag left of the number and has no Numbers section", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ lifecycle: "last_time_buy" }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const title = await within(sheet).findByRole("heading", { name: /LM358D/ });
    const tag = within(title).getByText("Last time buy");
    const maker = within(title).getByText("Texas Instruments");
    expect(maker.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sheet).queryByRole("region", { name: "Numbers" })).toBeNull();
    expect(within(sheet).queryByRole("heading", { name: "Distributors compared" })).toBeNull();
  });

  it("closes by clearing the URL", async () => {
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(search()).not.toContain("part="));
  });

  it("reports a part that cannot be loaded and retries", async () => {
    mocked.getSupplyPart.mockRejectedValueOnce(new ApiHttpError(404, "Not found"));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Not found")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Retry" }));
    expect(await within(sheet).findByRole("article", { name: "Listing 595-LM358D" })).toBeTruthy();
  });

  it("draws the stock chart with the watch threshold", async () => {
    renderView("designer", "/?part=p1");
    const chart = await screen.findByRole("img", { name: "stock chart" });
    expect(chart.getAttribute("data-threshold")).toBe("500");
  });

  it("asks for history rather than drawing a line through nothing", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ distributor_history: { days: 90, currency: "EUR", connectors: [], total: [], events: [] } }));
    renderView("designer", "/?part=p1");
    expect(await screen.findByText("History builds up as the part is read.")).toBeTruthy();
  });
});

describe("watching", () => {
  it("watches a new part from the list and opens it", async () => {
    tracking.followNumber.mockResolvedValue({ part_id: "p9", manufacturer: "Acme", mpn: "X1", tier: 2, rate: "weekly", threshold: 50, pinned: false, owner: "d", packaging: "any" });
    renderView();
    await screen.findByRole("button", { name: "LM358D" });
    fireEvent.click(screen.getAllByRole("button", { name: "Track a part" })[0]);
    const submit = await screen.findByRole("button", { name: "Watch part" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Manufacturer (optional)"), { target: { value: " Acme " } });
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: " X1 " } });
    fireEvent.change(screen.getByLabelText("Warn when stock is at or below"), { target: { value: "50" } });
    fireEvent.click(submit);
    await waitFor(() => expect(tracking.followNumber).toHaveBeenCalledWith({ manufacturer: "Acme", mpn: "X1", threshold: 50, pinned: false }));
    await waitFor(() => expect(search()).toContain("part=p9"));
    await waitFor(() => expect(mocked.listSupplyParts.mock.calls.length).toBeGreaterThan(1));
  });

  it("refuses a threshold that is not a whole number", async () => {
    renderView();
    fireEvent.click((await screen.findAllByRole("button", { name: "Track a part" }))[0]);
    fireEvent.change(await screen.findByLabelText("Manufacturer (optional)"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: "X1" } });
    fireEvent.change(screen.getByLabelText("Warn when stock is at or below"), { target: { value: "1.5" } });
    expect(screen.getByText("A whole number, or leave it empty.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Watch part" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the dialog open and shows the server's reason", async () => {
    tracking.followNumber.mockRejectedValue(new ApiHttpError(400, "At most 25 parts can be pinned to the fastest polling."));
    renderView();
    fireEvent.click((await screen.findAllByRole("button", { name: "Track a part" }))[0]);
    fireEvent.change(await screen.findByLabelText("Manufacturer (optional)"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: "X1" } });
    fireEvent.click(screen.getByRole("button", { name: "Watch part" }));
    expect(await screen.findByText(/At most 25 parts/)).toBeTruthy();
    expect(screen.getByLabelText("Part number")).toBeTruthy();
  });

  it("is open to everyone who reads supply, QA included", async () => {
    renderView("qa");
    await screen.findByRole("button", { name: "LM358D" });
    expect((screen.getByRole("button", { name: "Track a part" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

/** The watch's controls open from the clock beside the title. */
async function openWatch() {
  fireEvent.click(await screen.findByRole("button", { name: "How often this part is read" }));
}

describe("the watch settings", () => {
  it("saves a changed threshold and pin", async () => {
    tracking.followPart.mockResolvedValue({ connectors: [], tier: null, watch: { part_id: "p1", manufacturer: "T", mpn: "L", tier: 2, rate: "weekly", threshold: 800, pinned: true, owner: "o", packaging: "any" } } as never);
    renderView("designer", "/?part=p1");
    await openWatch();
    const threshold = (await screen.findByLabelText("Warn when stock is at or below")) as HTMLInputElement;
    expect(threshold.value).toBe("500");
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(threshold, { target: { value: "800" } });
    fireEvent.click(screen.getByLabelText("Always read at the fastest rate"));
    fireEvent.click(save);
    await waitFor(() => expect(tracking.followPart).toHaveBeenCalledWith("p1", { threshold: 800, pinned: true, packaging: "any" }));
    await waitFor(() => expect(mocked.getSupplyPart.mock.calls.length).toBeGreaterThan(1));
  });

  it("clears the threshold with an empty box", async () => {
    tracking.followPart.mockResolvedValue({ connectors: [], tier: null, watch: { part_id: "p1", manufacturer: "T", mpn: "L", tier: 2, rate: "weekly", threshold: null, pinned: false, owner: "o", packaging: "any" } } as never);
    renderView("designer", "/?part=p1");
    await openWatch();
    fireEvent.change(await screen.findByLabelText("Warn when stock is at or below"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(tracking.followPart).toHaveBeenCalledWith("p1", { threshold: null, pinned: false, packaging: "any" }));
  });

  it("saves which packaging the watch counts", async () => {
    tracking.followPart.mockResolvedValue({ connectors: [], tier: null, watch: { part_id: "p1", manufacturer: "T", mpn: "L", tier: 2, rate: "weekly", threshold: 500, pinned: false, owner: "o", packaging: "cut_tape" } } as never);
    renderView("designer", "/?part=p1");
    await openWatch();
    fireEvent.change(await screen.findByLabelText("Count stock of"), { target: { value: "cut_tape" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(tracking.followPart).toHaveBeenCalledWith("p1", { threshold: 500, pinned: false, packaging: "cut_tape" }));
  });

  it("will not save an invalid threshold", async () => {
    renderView("designer", "/?part=p1");
    await openWatch();
    fireEvent.change(await screen.findByLabelText("Warn when stock is at or below"), { target: { value: "-5" } });
    expect(screen.getByText("A whole number, or leave it empty.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks before it stops watching, and keeps watching if told to", async () => {
    tracking.stopTrackingPart.mockResolvedValue(undefined);
    renderView("designer", "/?part=p1");
    await openWatch();
    fireEvent.click(await screen.findByRole("button", { name: "Stop watching…" }));
    expect(tracking.stopTrackingPart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep watching" }));
    expect(screen.getByRole("button", { name: "Stop watching…" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop watching…" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop watching" }));
    await waitFor(() => expect(tracking.stopTrackingPart).toHaveBeenCalledWith("p1"));
  });

  it("says why a part has no stock when it is lost, in the list and in the sheet", async () => {
    mocked.listSupplyParts.mockResolvedValue({
      items: [partRowFixture({ status: "error", problem: "not_found", stock: null, unit_price: null, listings: 0 })], total: 1, limit: 100, offset: 0, next_offset: null, forecast_state: {},
    });
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({
      status: "error", problem: "not_found", problem_text: "No distributor carries this part number",
      stock: null,
      stock_by_connector: [],
    }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByRole("alert")).toHaveProperty("textContent", "No distributor carries this part number");
    expect(screen.getAllByText("No distributor carries this part number").length).toBe(2);
  });

  it("shows the trend with its confidence and the readings it rests on", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({
      insight: insightFixture({
        confidence: "high", trend: "falling", decrease_per_day: 50, days_to_zero: 6, days_to_threshold: 2,
        restocks: 0, restock_interval_days: null, restock_expected_in_days: null,
        inputs: { points: 35, span_days: 34, points_in_run: 35, current: 300 },
      }),
    }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const stock = await within(sheet).findByRole("region", { name: "Stock" });
    expect(within(sheet).queryByRole("heading", { name: "Trend" })).toBeNull();
    fireEvent.mouseEnter(within(stock).getByRole("button", { name: "Show the stock trend and restock promises" }));
    const trend = await screen.findByLabelText("Stock trend");
    expect(within(trend).getByText("High confidence")).toBeTruthy();
    expect(within(trend).getByText("Observed net decrease: 50 a day.")).toBeTruthy();
    expect(within(trend).getByText("At that rate it reaches zero in about 6 days.")).toBeTruthy();
  });

  it("shows no trend section while there is no insight to give", async () => {
    renderView("designer", "/?part=p1");
    await screen.findByRole("region", { name: "Stock" });
    expect(screen.queryByRole("button", { name: "Show the stock trend and restock promises" })).toBeNull();
  });

  it("reads where parts are used when the In use scope is chosen, then reloads the list", async () => {
    mocked.listSupplyParts.mockResolvedValue({ items: [partRowFixture({ used_in: 3 })], total: 1, limit: 100, offset: 0, next_offset: null, forecast_state: {} });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "In use" }));
    expect(search()).toContain("partsScope=in_use");
    await waitFor(() => expect(mocked.refreshSupplyUsage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenCalledWith("in_use", "", expect.anything(), "", 0, 50, "", ""));
    // Once for the first load of the scope and once after the usage was read.
    await waitFor(() => expect(mocked.listSupplyParts.mock.calls.filter((call) => call[0] === "in_use").length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText("Used in 3 projects")).toBeTruthy();
  });

  it("does not read usage for the other scopes", async () => {
    renderView();
    await screen.findByRole("button", { name: "LM358D" });
    fireEvent.click(screen.getByRole("button", { name: "Tier 1" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenCalledWith("tier1", "", expect.anything(), "", 0, 50, "", ""));
    expect(mocked.refreshSupplyUsage).not.toHaveBeenCalled();
  });

  it("says why the In use scope is empty", async () => {
    mocked.listSupplyParts.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, next_offset: null, forecast_state: {} });
    renderView("designer", "/?partsScope=in_use");
    expect(await screen.findByText("No parts in use yet")).toBeTruthy();
    expect(screen.getByText(/Open a project BOM, then watch its parts/)).toBeTruthy();
  });

  it("lists the projects a part is used in, with links", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({
      used_in: [
        { project_id: "prj_1", project_name: "satnogs-comms-hardware", quantity: 44, references: "C201 C202", only_in_variants: [] },
        { project_id: "prj_2", project_name: "Another board", quantity: 1, references: "C1", only_in_variants: [] },
      ],
    }));
    renderView("designer", "/?part=p1");
    const sheet = await screen.findByRole("dialog");
    const used = await within(sheet).findByLabelText("Projects using this part");
    const link = within(used).getByRole("link", { name: "satnogs-comms-hardware" });
    expect(link.getAttribute("href")).toBe("/project/prj_1");
    expect(link.className).not.toContain("text-primary");
    expect(within(used).queryByText(/Used in/)).toBeNull();
    // It sits under the title, before any section.
    const title = within(sheet).getByRole("heading", { name: /LM358D/ });
    expect(title.compareDocumentPosition(used) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers Read now to the people who can watch parts, and to nobody else", async () => {
    renderView("designer", "/?part=p1");
    expect(await screen.findByRole("button", { name: /Read now/ })).toBeTruthy();
    cleanup();
    forgetServerState([]);
    renderView("qa", "/?part=p1");
    await screen.findByRole("region", { name: "Stock" });
    expect(screen.queryByRole("button", { name: /Read now/ })).toBeNull();
  });

  it("shows no Used in section for a part no BOM carries", async () => {
    renderView("designer", "/?part=p1");
    await screen.findByRole("region", { name: "Stock" });
    expect(screen.queryByLabelText("Projects using this part")).toBeNull();
  });

  it("quotes the price at the quantity it applies to", async () => {
    mocked.listSupplyParts.mockResolvedValue({
      items: [partRowFixture({ unit_price: "0.1", price_quantity: 3000 })], total: 1, limit: 100, offset: 0, next_offset: null, forecast_state: {},
    });
    renderView();
    const row = (await screen.findByRole("button", { name: "LM358D" })).closest("tr")!;
    expect(within(row).getByText(`× ${(3000).toLocaleString()}`)).toBeTruthy();
  });

  it("suggests the manufacturers Prism knows when watching a new part", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <PartsView user={userWith("designer")} />
      </MemoryRouter>,
    );
    fireEvent.click((await screen.findAllByRole("button", { name: "Track a part" }))[0]);
    await waitFor(() => expect(mocked.listSupplyManufacturers).toHaveBeenCalled());
    fireEvent.change(await screen.findByLabelText("Manufacturer (optional)"), { target: { value: "texas" } });
    fireEvent.click(await screen.findByRole("option", { name: "Texas Instruments" }));
    expect((screen.getByLabelText("Manufacturer (optional)") as HTMLInputElement).value).toBe("Texas Instruments");
    expect(container).toBeTruthy();
  });

  it("shows the server's reason when a manufacturer is not known", async () => {
    tracking.followNumber.mockRejectedValue(new ApiHttpError(400, "Prism does not know the manufacturer \"TI\". Pick one from the list.", "unknown_manufacturer"));
    renderView();
    fireEvent.click((await screen.findAllByRole("button", { name: "Track a part" }))[0]);
    fireEvent.change(await screen.findByLabelText("Manufacturer (optional)"), { target: { value: "TI" } });
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: "TPS1" } });
    fireEvent.click(screen.getByRole("button", { name: "Watch part" }));
    expect(await screen.findByText(/does not know the manufacturer/)).toBeTruthy();
  });

  it("offers to watch a part that is not watched", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ watch: null }));
    tracking.followPart.mockResolvedValue({ connectors: [], tier: null, watch: null } as never);
    renderView("admin", "/?part=p1");
    await openWatch();
    fireEvent.click(await screen.findByRole("button", { name: "Watch this part" }));
    await waitFor(() => expect(tracking.followPart).toHaveBeenCalledWith("p1", {}));
  });

  it("gives QA the same rules to change", async () => {
    renderView("qa", "/?part=p1");
    await screen.findByRole("dialog");
    await openWatch();
    expect(await screen.findByLabelText("Warn when stock is at or below")).toBeTruthy();
  });

  it("offers QA to watch a part", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ watch: null }));
    renderView("qa", "/?part=p1");
    await screen.findByRole("dialog");
    await openWatch();
    expect(await screen.findByRole("button", { name: "Watch this part" })).toBeTruthy();
  });
});

describe("the runs out first sort", () => {
  it("asks for the parts likeliest to be out first, and goes back to the usual order", async () => {
    renderView("designer", "/?section=supply");
    const button = await screen.findByRole("button", { name: "Runs out first" });
    fireEvent.click(button);
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", "", "runout"));
    expect(search()).toContain("partsSort=runout");
    fireEvent.click(screen.getByRole("button", { name: "Runs out first" }));
    await waitFor(() => expect(search()).not.toContain("partsSort"));
  });
});

describe("sorting by a column", () => {
  it("sorts by price with the most expensive first, reverses it, and lets go on the third click", async () => {
    renderView("designer", "/?section=supply");
    fireEvent.click(await screen.findByRole("button", { name: "Sort by Price" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", "", "price:desc"));
    expect(search()).toContain("partsSort=price%3Adesc");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Price" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", "", "price:asc"));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Price" }));
    await waitFor(() => expect(search()).not.toContain("partsSort"));
  });

  it("sorts by stock, and a column replaces the runs out first sort", async () => {
    renderView("designer", "/?section=supply&partsSort=runout");
    fireEvent.click(await screen.findByRole("button", { name: "Sort by In stock" }));
    await waitFor(() => expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("followed", "", expect.anything(), "", 0, 50, "", "", "stock:desc"));
    expect(screen.getByRole("button", { name: "Runs out first" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the detailed layout's column names", () => {
  it("drops In stock, Price and Vendors, which have nothing under them there, and keeps the rest", async () => {
    renderView("designer", "/?section=supply&partsLayout=detailed");
    await screen.findByRole("columnheader", { name: /Part/ });
    expect(screen.queryByRole("button", { name: "Sort by In stock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sort by Price" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sort by Part" })).toBeTruthy();
  });
});
