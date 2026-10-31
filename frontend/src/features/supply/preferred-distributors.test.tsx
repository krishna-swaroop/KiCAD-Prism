import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssessmentSettings, SupplyConnector } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./supply-api")>()), listSupplyConnectors: vi.fn() }));

import { PreferredDistributors } from "./preferred-distributors";
import * as api from "./supply-api";

afterEach(cleanup);

const connector = (id: string, name: string, provider: string) => ({ id, display_name: name, provider, enabled: true, metered: true, assembly_only: false }) as SupplyConnector;
const draft = (extra: Partial<AssessmentSettings> = {}) =>
  ({ lead_time_days: 84, late_hours: 48, base_currency: "EUR", severity: {}, prefer_distributors: true, distributor_order: [], ...extra }) as unknown as AssessmentSettings;

describe("preferred distributors in the settings", () => {
  it("is off by default and turns on with a checkbox", async () => {
    vi.mocked(api.listSupplyConnectors).mockResolvedValue([]);
    const onChange = vi.fn();
    render(<PreferredDistributors draft={draft({ prefer_distributors: false })} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prefer_distributors: true }));
    expect(screen.queryByRole("list", { name: "Order of preferred distributors" })).toBeNull();
  });

  it("orders the distributors with arrows", async () => {
    vi.mocked(api.listSupplyConnectors).mockResolvedValue([connector("c1", "DigiKey", "digikey"), connector("c2", "Mouser", "mouser")]);
    const onChange = vi.fn();
    render(<PreferredDistributors draft={draft({ distributor_order: ["c1", "c2"] })} onChange={onChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "Move Mouser up" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ distributor_order: ["c2", "c1"] }));
  });
});
