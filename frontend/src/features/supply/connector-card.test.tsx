import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupplyConnector } from "@/types/supply";
import { ConnectorCard } from "./connector-card";
import { LibraryBar } from "./connector-card-parts";
import { connectorFixture } from "./supply-test-fixtures";

vi.mock("./connector-signin", () => ({ ConnectorSignin: () => null }));
afterEach(cleanup);

function card(over: Partial<SupplyConnector>) {
  const soon = new Date(Date.now() + 15 * 60_000).toISOString();
  const now = new Date().toISOString();
  render(<MemoryRouter><ConnectorCard connector={connectorFixture({ provider: "jlcpcb", display_name: "JLCPCB", last_ok_at: null, last_error_code: "blocked", last_error_at: now, cooldown_until: soon, ...over })} isAdmin onAction={() => undefined} /></MemoryRouter>);
}

describe("a connector card after a refusal", () => {
  it("says it rests, what was refused and until when, and how pacing stands", () => {
    card({ slow_until: new Date(Date.now() + 3600_000).toISOString() });
    expect(screen.getByText(/^Resting until /)).toBeTruthy();
    expect(screen.getByText(/^Refused .*, resting until /)).toBeTruthy();
    expect(screen.getByText(/^Calls slowed until /)).toBeTruthy();
    expect(screen.queryByText("Last call failed")).toBeNull();
  });

  it("says in one line how the provider is called where it matters", () => {
    card({});
    expect(screen.getByText(/Offers come from an uploaded CSV file/)).toBeTruthy();
    cleanup();
    card({ provider: "arrow", display_name: "Arrow" });
    expect(screen.getByText("Reads 100 parts a call.")).toBeTruthy();
  });
});

describe("the library pass on a connector card", () => {
  it("shows parts searched over the library, what each search found, and the days left", () => {
    render(<LibraryBar library={{ total: 2000, found: 900, not_found: 100, waiting: 1000, calls_a_day: 50, days_left: 2 }} />);
    expect(screen.getByText("1,000 / 2,000")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("2 d")).toBeTruthy();
    cleanup();
    render(<LibraryBar library={{ total: 10, found: 10, not_found: 0, waiting: 0, calls_a_day: 0, days_left: 0 }} />);
    expect(screen.queryByText("Left")).toBeNull();
  });
});
