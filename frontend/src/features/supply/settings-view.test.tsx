import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User, UserRole } from "@/types/auth";
import type { AssessmentSettings, AssessmentSettingsView } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getAssessmentSettings: vi.fn(),
  saveAssessmentSettings: vi.fn(),
  listSupplyConnectors: vi.fn(),
}));
vi.mock("./schedule-settings", () => ({ ScheduleSettings: () => <div>Spare work switches</div> }));
vi.mock("./maker-spellings", () => ({ MakerSpellings: () => <div>Maker spellings</div> }));
vi.mock("./number-endings", () => ({ NumberEndings: () => <div>Number endings</div> }));
vi.mock("./exchange-rates", () => ({ ExchangeRates: () => <div>Exchange rates</div> }));
vi.mock("./svhc-list-upload", () => ({ SvhcListUpload: () => <div>REACH list</div> }));

import { SettingsDialog } from "./settings-view";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

const defaults: AssessmentSettings = {
  lead_time_days: 84, last_buy_error_days: 180, late_hours: 48,
  spares_mode: "flat", spares_percent: 0, spares_small_passives: 2, spares_others: 0,
  alert_price_rise_percent: 20, alert_likely_out_percent: 70,
  base_currency: "EUR", price_quantity: 100, prefer_distributors: false, distributor_order: [],
  severity: { nrnd: "warning", obsolete: "fatal", no_distributor_stock: "error" },
};
const view = (settings: AssessmentSettings = defaults): AssessmentSettingsView => ({
  settings, defaults,
  checks: [
    { id: "nrnd", label: "Not recommended for new designs", area: "Lifecycle" },
    { id: "obsolete", label: "Manufacturer lists it as obsolete", area: "Lifecycle" },
    { id: "no_distributor_stock", label: "No distributor has it in stock", area: "Stock" },
  ],
  ranges: {
    lead_time_days: [1, 730], last_buy_error_days: [30, 730], late_hours: [1, 720], price_quantity: [1, 1_000_000],
    spares: [0, 100], alert_price_rise_percent: [1, 500], alert_likely_out_percent: [50, 99],
  },
  currencies: ["EUR", "INR", "USD"],
});

async function chooseCurrency(name: RegExp) {
  fireEvent.click(await screen.findByLabelText(/^Currency/));
  fireEvent.click(await screen.findByRole("option", { name }));
}
const person = (role: UserRole): User => ({ name: role, email: `${role}@example.com`, role });

function open(role: UserRole = "admin") {
  render(<SettingsDialog open onOpenChange={() => undefined} user={person(role)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAssessmentSettings.mockResolvedValue(view());
  mocked.listSupplyConnectors.mockResolvedValue([]);
  mocked.saveAssessmentSettings.mockImplementation(async (settings) => view(settings));
});
afterEach(cleanup);

describe("the Supply settings window", () => {
  it("shows a reader every setting and no way to change it", async () => {
    open("designer");
    const currency = await screen.findByLabelText(/^Currency/);
    expect(currency.matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Only administrators can change these.")).toBeTruthy();
  });

  it("saves one group by sending the whole settings with that group's fields changed, and shows the default beside a changed field", async () => {
    open();
    await chooseCurrency(/^USD/);
    expect(screen.getByText("default EUR")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Price quantity/), { target: { value: "1000" } });
    fireEvent.click(screen.getByLabelText("By part type"));
    fireEvent.change(screen.getByLabelText(/Small passives/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.saveAssessmentSettings).toHaveBeenCalledWith({
      ...defaults, base_currency: "USD", price_quantity: 1000, spares_mode: "package", spares_small_passives: 3,
    }));
  });

  it("offers the currencies with a rate, rupees among them, and costs in the one chosen", async () => {
    open();
    await chooseCurrency(/^INR · ₹/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.saveAssessmentSettings).toHaveBeenCalledWith({ ...defaults, base_currency: "INR" }));
  });

  it("keeps a group's save from carrying the figures of another that has not been saved", async () => {
    open();
    await chooseCurrency(/^USD/);
    fireEvent.click(screen.getByRole("button", { name: "Alerts" }));
    fireEvent.change(await screen.findByLabelText(/Price rise alert/), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.saveAssessmentSettings).toHaveBeenCalledWith({ ...defaults, alert_price_rise_percent: 35 }));
  });

  it("lists the checks under their areas and marks one changed from its default", async () => {
    mocked.getAssessmentSettings.mockResolvedValue(view({ ...defaults, severity: { ...defaults.severity, nrnd: "error" } }));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Health checks" }));
    expect(await screen.findByRole("heading", { name: "Lifecycle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stock" })).toBeTruthy();
    expect(screen.getByText("default warning")).toBeTruthy();
  });

  it("puts a group back to its defaults without touching the others", async () => {
    mocked.getAssessmentSettings.mockResolvedValue(view({ ...defaults, alert_price_rise_percent: 35, base_currency: "USD" }));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Alerts" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back to defaults" }));
    await waitFor(() => expect(mocked.saveAssessmentSettings).toHaveBeenCalledWith({ ...defaults, base_currency: "USD", alert_price_rise_percent: 20 }));
  });

  it("lets a figure with a floor above one be cleared and typed again", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Alerts" }));
    const chance = await screen.findByLabelText(/Likely to run out/);
    for (const text of ["", "8", "85"]) fireEvent.change(chance, { target: { value: text } });
    expect((chance as HTMLInputElement).value).toBe("85");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.saveAssessmentSettings).toHaveBeenCalledWith({ ...defaults, alert_likely_out_percent: 85 }));
  });

  it("offers the lists as they are", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reading" }));
    expect(within(await screen.findByRole("region", { name: "Reading" })).getByText("Spare work switches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Matching" }));
    expect(await screen.findByText("Maker spellings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reference data" }));
    expect(await screen.findByText("Exchange rates")).toBeTruthy();
  });
});
