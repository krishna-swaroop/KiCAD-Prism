import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";
import { connectorFixture, providerFixture } from "./supply-test-fixtures";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "toast-id") } }));

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  listSupplyProviders: vi.fn(),
  listSupplyConnectors: vi.fn(),
  createSupplyConnector: vi.fn(),
  updateSupplyConnector: vi.fn(),
  uploadSupplyCsv: vi.fn(),
  clearSupplyCsv: vi.fn(),
  testSupplyConnector: vi.fn(),
}));

import { SupplyConnectorsView } from "./connectors-view";
import * as api from "./supply-api";
import { forgetServerState } from "@/lib/server-state";

const mocked = vi.mocked(api);
const admin: User = { name: "Ana", email: "ana@example.com", role: "admin" };

const csvProvider = providerFixture({
  key: "csv", label: "CSV import", credential_fields: [], metered: false, default_daily_budget: 0, csv_fed: true,
});
const csvConnector = (overrides = {}) => connectorFixture({
  id: "f1", provider: "csv", provider_label: "CSV import", display_name: "Price list",
  credentials: {}, metered: false, csv_fed: true, daily_budget: 0, ...overrides,
});
const uploaded = {
  filename: "stock.csv", imported_by: "ana@example.com", imported_at: "2026-03-02T09:00:00Z", row_count: 1240,
};

function load(connectors = [csvConnector()], providers = [csvProvider]) {
  mocked.listSupplyProviders.mockResolvedValue(providers);
  mocked.listSupplyConnectors.mockResolvedValue(connectors);
}

async function openMenu(name: string) {
  const trigger = await screen.findByRole("button", { name: `Actions for ${name}` });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("a CSV connector", () => {
  it("shows its file instead of a call budget", async () => {
    load([csvConnector({ csv_import: uploaded })]);
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    const card = await screen.findByRole("article", { name: "Price list" });
    expect(within(card).getByText("stock.csv")).toBeTruthy();
    expect(within(card).getByText(/1,240 rows/)).toBeTruthy();
    expect(within(card).getByText("Active")).toBeTruthy();
    expect(within(card).queryByText("Calls today")).toBeNull();
  });

  it("says when nothing has been uploaded", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    const card = await screen.findByRole("article", { name: "Price list" });
    expect(within(card).getByText("No file uploaded")).toBeTruthy();
    expect(within(card).getByText(/No file uploaded\. Local data/)).toBeTruthy();
  });

  it("uploads the chosen file and shows the result", async () => {
    load();
    mocked.uploadSupplyCsv.mockImplementation(async () => { load([csvConnector({ csv_import: uploaded })]); return { ...uploaded, ignored_columns: ["notes"] }; });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    expect(screen.queryByRole("menuitem", { name: "Remove uploaded data" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload CSV" }));
    expect((await screen.findByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true);

    const file = new File(["sku,mpn,manufacturer,stock\n"], "stock.csv", { type: "text/csv" });
    pick(file);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(mocked.uploadSupplyCsv).toHaveBeenCalledWith("f1", file));
    const card = await screen.findByRole("article", { name: "Price list" });
    expect(await within(card).findByText("stock.csv")).toBeTruthy();
    expect(within(card).getByText("Active")).toBeTruthy();
    expect(screen.queryByLabelText("CSV file")).toBeNull();
  });

  it("lists the problems when the file is refused, and keeps the dialog open", async () => {
    load();
    mocked.uploadSupplyCsv.mockRejectedValue(new api.CsvRejectedError(
      "The file was not imported. 52 problem(s) found.",
      [{ line: 3, column: "stock", message: "A whole number, digits only." }, { line: 0, column: "", message: "Odd." }],
      52,
    ));
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload CSV" }));
    await screen.findByLabelText("CSV file");
    pick(new File(["x"], "bad.csv"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("The file was not imported. 52 problem(s) found.")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Problems in the file" });
    expect(within(list).getByText("Line 3, stock: A whole number, digits only.")).toBeTruthy();
    expect(within(list).getByText("File: Odd.")).toBeTruthy();
    expect(within(list).getByText("and 50 more")).toBeTruthy();
    expect(screen.getByLabelText("CSV file")).toBeTruthy();
  });

  it("refuses a file over 5 MB before sending it", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload CSV" }));
    await screen.findByLabelText("CSV file");
    const big = new File(["x"], "big.csv");
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    pick(big);
    expect(screen.getByText("The file is larger than 5 MB.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocked.uploadSupplyCsv).not.toHaveBeenCalled();
  });

  it("offers the template", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload CSV" }));
    const link = (await screen.findByRole("link", { name: "Download a template" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/api/supply/csv-template");
  });

  it("removes uploaded data after confirmation", async () => {
    load([csvConnector({ csv_import: uploaded })]);
    mocked.clearSupplyCsv.mockImplementation(async () => { load(); });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove uploaded data" }));
    expect(mocked.clearSupplyCsv).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocked.clearSupplyCsv).toHaveBeenCalledWith("f1"));
    const card = await screen.findByRole("article", { name: "Price list" });
    expect(await within(card).findByText("No file uploaded")).toBeTruthy();
  });

  it("asks for no budget when adding or editing", async () => {
    load([], [csvProvider]);
    mocked.createSupplyConnector.mockResolvedValue(csvConnector());
    const { unmount } = render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Add connector/ }));
    expect(await screen.findByLabelText("Currency")).toBeTruthy();
    expect(screen.queryByLabelText("Daily call budget")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Add connector" }).at(-1)!);
    await waitFor(() => expect(mocked.createSupplyConnector).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "csv", credentials: {}, daily_budget: 0 }),
    ));
    unmount();
    forgetServerState([]);

    load();
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit settings" }));
    expect(await screen.findByLabelText("Currency")).toBeTruthy();
    expect(screen.queryByLabelText("Daily call budget")).toBeNull();
  });

  it("does not offer credentials for a provider that takes none", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Price list");
    await screen.findByRole("menuitem", { name: "Upload CSV" });
    expect(screen.queryByRole("menuitem", { name: "Replace credentials" })).toBeNull();
  });
});
