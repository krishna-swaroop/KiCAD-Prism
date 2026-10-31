import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./supply-api", () => ({ getCrossReference: vi.fn(), addComponentSource: vi.fn(), askSubstitutes: vi.fn(), listSupplyConnectors: vi.fn() }));
vi.mock("./tracking-api", () => ({ followNumber: vi.fn() }));

import { CrossReferenceSection } from "./cross-reference-section";
import * as api from "./supply-api";
import * as trackingApi from "./tracking-api";

const result = {
  candidates: [
    { part_id: "p2", manufacturer: "Globex", mpn: "G-10K", grade: "ratings_met" as const, grade_label: "Ratings met", same: ["resistance", "package"], differs: [], unknown: [], stock: 500, status: "ok" as const, lifecycle: "active" as const, problem: null, fetched_at: null },
    { part_id: "p3", manufacturer: "Globex", mpn: "G-10K-0805", grade: "other_package" as const, grade_label: "Same value, other package", same: ["resistance"], differs: ["package"], unknown: [], stock: null, status: "unknown" as const, lifecycle: "unknown" as const, problem: null, fetched_at: null },
  ],
  suggested_by_distributors: ["R-10K-NEW"], judged_on: ["resistance", "package"], suggestions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getCrossReference).mockResolvedValue(result);
  vi.mocked(api.listSupplyConnectors).mockResolvedValue([{ provider: "digikey", enabled: true }] as never);
});
afterEach(cleanup);

describe("alternatives to a part", () => {
  it("offers to ask DigiKey only while a DigiKey connector is on", async () => {
    vi.mocked(api.listSupplyConnectors).mockResolvedValue([{ provider: "fake", enabled: true }, { provider: "digikey", enabled: false }] as never);
    render(<CrossReferenceSection partId="p1" canEdit />);
    await waitFor(() => expect(api.listSupplyConnectors).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Find alternatives" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask DigiKey for substitutes" })).toBeNull();
  });

  it("looks only when asked or opened and grades each", async () => {
    render(<CrossReferenceSection partId="p1" canEdit />);
    expect(api.getCrossReference).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find alternatives" }));
    expect(await screen.findByText("Ratings met")).toBeTruthy();
    expect(screen.getByText("Same value, other package")).toBeTruthy();
    expect(screen.getByText(/Distributors suggest: R-10K-NEW/)).toBeTruthy();
    expect(screen.getByText(/Differs: package/)).toBeTruthy();
  });

  it("loads what is stored when the section is opened, without a distributor call", async () => {
    vi.mocked(api.getCrossReference).mockResolvedValue({ ...result, suggestions: [] });
    render(<CrossReferenceSection partId="p1" canEdit />);
    expect(api.getCrossReference).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("heading", { name: "Alternatives" }));
    expect(await screen.findByText("Ratings met")).toBeTruthy();
    expect(api.getCrossReference).toHaveBeenCalledTimes(1);
    expect(api.askSubstitutes).not.toHaveBeenCalled();
  });

  const suggestions = [
    { manufacturer: "Globex", mpn: "G-10K-NEW", sku: "C1", notes: ["Direct", "SOT-23-5L"], sources: [{ provider: "digikey", name: "DigiKey" }, { provider: "lcsc", name: "LCSC" }], asked: true, part_id: null, stock: null, status: null, tracked: false },
    { manufacturer: "", mpn: "", sku: "595-R-10K", notes: ["Mouser number"], sources: [{ provider: "mouser", name: "Mouser" }], asked: false, part_id: null, stock: null, status: null, tracked: false },
    { manufacturer: "Globex", mpn: "G-10K", sku: "", notes: [], sources: [{ provider: "lcsc", name: "LCSC" }], asked: false, part_id: "p2", stock: 500, status: "ok" as const, tracked: true },
  ];

  it("lists what distributors suggest first, with who said it, in their words, and says they are not compared", async () => {
    vi.mocked(api.getCrossReference).mockResolvedValue({ ...result, suggestions });
    render(<CrossReferenceSection partId="p1" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Find alternatives" }));
    expect(await screen.findByText("Suggested by distributors")).toBeTruthy();
    expect(screen.getByText(/DigiKey, LCSC: Direct, SOT-23-5L, asked at DigiKey/)).toBeTruthy();
    expect(screen.getByText(/a distributor number, not a part number/)).toBeTruthy();
    expect(screen.getByText(/500 in stock, tracked/)).toBeTruthy();
    expect(screen.getByText(/Prism has not compared them with the part/)).toBeTruthy();
  });

  it("tracks a suggested part and proposes it, but offers neither for a distributor number or an already tracked part", async () => {
    vi.mocked(api.getCrossReference).mockResolvedValue({ ...result, suggestions });
    vi.mocked(trackingApi.followNumber).mockResolvedValue({} as never);
    render(<CrossReferenceSection partId="p1" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Find alternatives" }));
    await screen.findByText("Suggested by distributors");
    expect(screen.getAllByRole("button", { name: "Track" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    await waitFor(() => expect(trackingApi.followNumber).toHaveBeenCalledWith({ manufacturer: "Globex", mpn: "G-10K-NEW" }));
  });

  it("asks DigiKey for substitutes and shows what it names, or why it could not", async () => {
    vi.mocked(api.getCrossReference).mockResolvedValue({ ...result, suggestions });
    vi.mocked(api.askSubstitutes).mockResolvedValue({ asked: 1, found: 3, resolved: 0, problems: [] });
    render(<CrossReferenceSection partId="p1" canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask DigiKey for substitutes" }));
    await waitFor(() => expect(api.askSubstitutes).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("Suggested by distributors")).toBeTruthy();
  });

  it("does not offer the DigiKey question to someone who cannot edit", () => {
    render(<CrossReferenceSection partId="p1" canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Ask DigiKey for substitutes" })).toBeNull();
  });
});
