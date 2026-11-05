import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackingRoom, TrackingRoomAccount } from "@/types/supply";

vi.mock("./tracking-api", () => ({ getTrackingRoom: vi.fn() }));

import * as api from "./tracking-api";
import { TrackingRoomSection, roughly } from "./tracking-room";

const mocked = vi.mocked(api);

function account(overrides: Partial<TrackingRoomAccount> = {}): TrackingRoomAccount {
  return {
    connector_ids: ["c1"], name: "DigiKey", assembly_only: false, capacity: 900, free: 893, waiting: 0, searched: 22,
    carried_percent: 95, estimated_per_day: 6.2, measured_per_day: null, factor: 1, by_tier: { "1": { calls: 6, parts: 5 }, "2": { calls: 1, parts: 9 } }, yesterday: { expected: 7, spent: 7 },
    room: { daily: 794, weekly: 3146 }, ...overrides,
  };
}

function room(accounts: TrackingRoomAccount[], headline: TrackingRoom["headline"]): TrackingRoom {
  return { accounts, headline };
}

afterEach(cleanup);

describe("room to track", () => {
  it("rounds to two significant figures", () => {
    expect([roughly(42), roughly(794), roughly(3146), roughly(32176)]).toEqual(["42", "790", "3,100", "32,000"]);
  });

  it("shows a bar each for tier 1 and tier 2 without a distributor's name, and a table per distributor behind a toggle", async () => {
    mocked.getTrackingRoom.mockResolvedValue(room(
      [
        account(),
        account({ connector_ids: ["c2"], name: "TME", measured_per_day: 1.5, estimated_per_day: 1.2, room: { daily: 32176, weekly: 218292 } }),
        account({ connector_ids: ["c3"], name: "JLCPCB", assembly_only: true, searched: 0, room: { daily: null, weekly: null } }),
      ],
      { daily: { room: 794, limited_by: "DigiKey" }, weekly: { room: 3146, limited_by: "DigiKey" } },
    ));
    render(<TrackingRoomSection />);
    const section = await screen.findByRole("region", { name: "Daily call limit" });
    expect(within(section).getByRole("progressbar", { name: "Tier 1 committed calls" })).toBeTruthy();
    expect(within(section).getByRole("progressbar", { name: "Tier 2 committed calls" })).toBeTruthy();
    expect(within(section).getByText("6 calls for 5 parts · about 790 more fit")).toBeTruthy();
    expect(within(section).getByText("1 calls for 9 parts · about 3,100 more fit")).toBeTruthy();
    expect(within(section).getByText("Yesterday: expected 7, spent 7")).toBeTruthy();
    expect(within(section).queryByRole("row", { name: /TME/ })).toBeNull();
    fireEvent.click(within(section).getByRole("button", { name: /Per distributor/ }));
    const tme = within(section).getByRole("row", { name: /TME/ });
    expect(within(tme).getByText("32,000")).toBeTruthy();
    expect(within(tme).getByText(/spent 1.5 calls a day last week, against 1.2 estimated/)).toBeTruthy();
    expect(within(within(section).getByRole("row", { name: /JLCPCB/ })).getByText("Too few parts searched there to tell")).toBeTruthy();
  });
});
