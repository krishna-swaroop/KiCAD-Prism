import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { ApiHttpError } from "@/lib/api";
import type { User } from "@/types/auth";
import { connectorFixture, providerFixture } from "./supply-test-fixtures";
import { forgetServerState } from "@/lib/server-state";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "toast-id") } }));

vi.mock("./supply-api", async (importOriginal) => ({
  // Keep the real error classes and constants; replace only what talks to the network.
  ...(await importOriginal<typeof import("./supply-api")>()),
  listSupplyProviders: vi.fn(),
  listSupplyConnectors: vi.fn(),
  createSupplyConnector: vi.fn(),
  updateSupplyConnector: vi.fn(),
  setSupplyConnectorCredentials: vi.fn(),
  pauseSupplyConnector: vi.fn(),
  resumeSupplyConnector: vi.fn(),
  deleteSupplyConnector: vi.fn(),
  uploadSupplyCsv: vi.fn(),
  clearSupplyCsv: vi.fn(),
  testSupplyConnector: vi.fn(),
}));


import * as api from "./supply-api";
import { SupplyConnectorsView } from "./connectors-view";

const mocked = vi.mocked(api);
const admin: User = { name: "Ana", email: "ana@example.com", role: "admin" };
const designer: User = { name: "Dee", email: "dee@example.com", role: "designer" };

function load(connectors = [connectorFixture()], providers = [providerFixture()]) {
  mocked.listSupplyProviders.mockResolvedValue(providers);
  mocked.listSupplyConnectors.mockResolvedValue(connectors);
}

async function openMenu(name: string) {
  const trigger = await screen.findByRole("button", { name: `Actions for ${name}` });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("connectors list", () => {
  it("shows each connector with its state, budget and which credentials are set", async () => {
    load([connectorFixture({ credentials: { api_key: true, secret: false } })]);
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    const card = await screen.findByRole("article", { name: "Demo EU" });
    expect(within(card).getByText("Needs credentials")).toBeTruthy();
    expect(within(card).getByText("Demo distributor · EUR")).toBeTruthy();
    expect(within(card).getByText("120 / 1,000")).toBeTruthy();
    expect(within(card).getByText("api_key")).toBeTruthy();
    expect(within(card).getByText("secret")).toBeTruthy();
    expect(within(card).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("12");
  });

  it("offers the reset time the readings agree on, and applies it on request", async () => {
    const guess = { from: "22:20", to: "22:55", suggested: "22:55", tz: "UTC", windows: 2 };
    load([connectorFixture({ reset_suggestion: guess, rate_limits: { products: { "x-ratelimit-remaining": "9" } }, rate_limits_at: "2026-10-15T10:00:00Z" })]);
    mocked.updateSupplyConnector.mockResolvedValue(connectorFixture({ reset_from_provider: true, reset_time: "22:55", reset_tz: "UTC" }));
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    const card = await screen.findByRole("article", { name: "Demo EU" });
    expect(within(card).getByText(/between 22:20 and 22:55 UTC/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Use 22:55" }));
    await waitFor(() => expect(mocked.updateSupplyConnector).toHaveBeenCalledWith("c1", { reset_time: "22:55", reset_tz: "UTC", reset_from_provider: true }));
  });

  it("lets readers look but not change", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={designer} /></MemoryRouter>);
    await screen.findByRole("article", { name: "Demo EU" });
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
    expect((screen.getByRole("button", { name: /Add connector/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains an empty list, with and without providers", async () => {
    load([], []);
    const { unmount } = render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    expect(await screen.findByText(/No distributor providers are installed/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Add connector/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    forgetServerState([]);

    load([], [providerFixture()]);
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    expect(await screen.findByText(/Add a distributor to start/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Add connector/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reports a load failure and retries", async () => {
    mocked.listSupplyProviders
      .mockRejectedValueOnce(new Error("Could not load providers"))
      .mockResolvedValue([providerFixture()]);
    mocked.listSupplyConnectors.mockResolvedValue([connectorFixture()]);
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    expect(await screen.findByText("Could not load providers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("article", { name: "Demo EU" })).toBeTruthy();
  });
});

describe("adding a connector", () => {
  it("sends the form and shows the new connector", async () => {
    load([], [providerFixture()]);
    mocked.createSupplyConnector.mockImplementation(async () => {
      const made = connectorFixture({ id: "c2", display_name: "Demo distributor" });
      load([made]);
      return made;
    });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Add connector/ }));
    const submit = await screen.findByRole("button", { name: "Add connector", hidden: false });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "KEY-1" } });
    expect((screen.getByLabelText("API key") as HTMLInputElement).type).toBe("password");
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "eur" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add connector" }).at(-1)!);

    await waitFor(() => expect(mocked.createSupplyConnector).toHaveBeenCalledTimes(1));
    expect(mocked.createSupplyConnector).toHaveBeenCalledWith({
      provider: "demo",
      storefront: "",
      display_name: "",
      currency: "EUR",
      credentials: { api_key: "KEY-1" },
      daily_budget: 1000,
      interactive_reserve_pct: 10,
    });
    expect(await screen.findByRole("article", { name: "Demo distributor" })).toBeTruthy();
    expect(screen.queryByLabelText("API key")).toBeNull();
  });

  it("keeps the dialog open and shows the server's reason", async () => {
    load([], [providerFixture()]);
    mocked.createSupplyConnector.mockRejectedValue(new ApiHttpError(409, "A connector for this provider and storefront already exists.", "duplicate"));
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Add connector/ }));
    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "KEY-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add connector" }).at(-1)!);
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(screen.getByLabelText("API key")).toBeTruthy();
  });
});

describe("changing a connector", () => {
  it("pauses with a reason", async () => {
    load();
    mocked.pauseSupplyConnector.mockImplementation(async () => { load([connectorFixture({ paused_reason: "over budget" })]); return connectorFixture({ paused_reason: "over budget" }); });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Demo EU");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pause" }));
    const pause = await screen.findByRole("button", { name: "Pause" });
    expect((pause as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "over budget" } });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(mocked.pauseSupplyConnector).toHaveBeenCalledWith("c1", "over budget"));
    const card = await screen.findByRole("article", { name: "Demo EU" });
    expect(await within(card).findByText("over budget")).toBeTruthy();
    expect(within(card).getAllByText("Paused")).toHaveLength(2);
  });

  it("offers resume for a paused connector and applies the result", async () => {
    load([connectorFixture({ paused_reason: "over budget" })]);
    mocked.resumeSupplyConnector.mockImplementation(async () => { load(); return connectorFixture(); });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Demo EU");
    expect(screen.queryByRole("menuitem", { name: "Pause" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Resume" }));
    await waitFor(() => expect(mocked.resumeSupplyConnector).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("Active")).toBeTruthy();
  });

  it("saves only the fields that changed", async () => {
    load();
    mocked.updateSupplyConnector.mockResolvedValue(connectorFixture({ daily_budget: 500 }));
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Demo EU");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit settings" }));
    const save = await screen.findByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Daily call budget"), { target: { value: "500" } });
    fireEvent.click(save);
    await waitFor(() => expect(mocked.updateSupplyConnector).toHaveBeenCalledWith("c1", { daily_budget: 500 }));
  });

  it("never prefills credentials when replacing them", async () => {
    load();
    mocked.setSupplyConnectorCredentials.mockResolvedValue(connectorFixture());
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Demo EU");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Replace credentials" }));
    const input = (await screen.findByLabelText("API key")) as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(mocked.setSupplyConnectorCredentials).toHaveBeenCalledWith("c1", { api_key: "NEW" }));
  });

  it("deletes after confirmation", async () => {
    load();
    mocked.deleteSupplyConnector.mockImplementation(async () => { load([]); });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await openMenu("Demo EU");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(mocked.deleteSupplyConnector).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocked.deleteSupplyConnector).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Demo EU" })).toBeNull());
  });
});


describe("testing a connection", () => {
  async function clickTest() {
    await openMenu("Demo EU");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Test connection" }));
  }

  it("makes one call, says the provider answered, and reloads the numbers", async () => {
    load();
    mocked.testSupplyConnector.mockResolvedValue({ ok: true, code: "ok", message: "The provider accepted the credentials and answered.", took_ms: 812, checked_at: "2026-03-01T10:00:00Z" });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await clickTest();
    await waitFor(() => expect(mocked.testSupplyConnector).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      "Demo EU answered",
      expect.objectContaining({ description: "The provider accepted the credentials and answered. (812 ms)" }),
    ));
    await waitFor(() => expect(mocked.listSupplyConnectors).toHaveBeenCalledTimes(2));
  });

  it("shows why a test failed", async () => {
    load();
    mocked.testSupplyConnector.mockResolvedValue({ ok: false, code: "auth_failed", message: "The provider rejected the credentials.", took_ms: 90, checked_at: "2026-03-01T10:00:00Z" });
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await clickTest();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Demo EU failed",
      expect.objectContaining({ description: "The provider rejected the credentials." }),
    ));
  });

  it("does not start a second call while one is running", async () => {
    load();
    let finish!: (value: Awaited<ReturnType<typeof api.testSupplyConnector>>) => void;
    mocked.testSupplyConnector.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await clickTest();
    await clickTest();
    expect(mocked.testSupplyConnector).toHaveBeenCalledTimes(1);
    finish({ ok: true, code: "ok", message: "fine", took_ms: 1, checked_at: "2026-03-01T10:00:00Z" });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("reports a test that could not run at all", async () => {
    load();
    mocked.testSupplyConnector.mockRejectedValue(new ApiHttpError(503, "Credential encryption is not set up"));
    render(<MemoryRouter><SupplyConnectorsView user={admin} /></MemoryRouter>);
    await clickTest();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "The test could not run",
      expect.objectContaining({ description: "Credential encryption is not set up" }),
    ));
  });

  it("is for administrators: others get no menu", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={designer} /></MemoryRouter>);
    await screen.findByRole("article", { name: "Demo EU" });
    expect(screen.queryByRole("button", { name: "Actions for Demo EU" })).toBeNull();
  });
});

describe("the connectors page", () => {
  it("opens the settings window from a gear for everyone who reads supply, beside Add connector", async () => {
    load();
    render(<MemoryRouter><SupplyConnectorsView user={designer} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Supply settings" }));
    expect(await screen.findByRole("dialog", { name: "Supply settings" })).toBeTruthy();
  });
});
