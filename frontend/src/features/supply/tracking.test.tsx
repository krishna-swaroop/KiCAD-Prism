import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectTrackingPreview, SupplyConnector } from "@/types/supply";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./tracking-api", () => ({
  getProjectTracking: vi.fn(), readProjectBom: vi.fn(), previewTrackProject: vi.fn(), trackProject: vi.fn(), untrackProject: vi.fn(),
  getPartTracking: vi.fn(), previewFollow: vi.fn(), followPart: vi.fn(), stopTrackingPart: vi.fn(),
  chooseTrackLine: vi.fn(), getTrackProgress: vi.fn(),
}));
vi.mock("./supply-api", () => ({ listSupplyConnectors: vi.fn(), updateSupplyConnector: vi.fn(), getAssessmentSettings: vi.fn() }));

import * as api from "./tracking-api";
import * as supply from "./supply-api";
import { TrackProjectButton } from "./track-project-dialog";
import { TrackingControl } from "./tracking-control";

const tracking = vi.mocked(api);

const connector = (id: string, name: string, extra: Partial<SupplyConnector> = {}) =>
  ({ id, display_name: name, enabled: true, metered: true, assembly_only: false, daily_budget: 1000, ...extra }) as SupplyConnector;

const preview = (extra: Partial<ProjectTrackingPreview> = {}): ProjectTrackingPreview => ({
  fits_nowhere: false,
  connectors: [{
    connector_id: "c1", name: "DigiKey", account: "a1", capacity: 900, committed: 100, free: 800, by_tier: {}, admitted: 10, waiting: 0,
    adds_calls: 120, admitted_new: 100, waiting_new: 4,
  }],
  tracked: { project_id: "prj_1", variants: [""], parts_created: 0, skipped: [] },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supply.listSupplyConnectors).mockResolvedValue([connector("c1", "DigiKey"), connector("j1", "JLCPCB", { assembly_only: true })]);
  vi.mocked(supply.getAssessmentSettings).mockRejectedValue(new Error("not needed"));
});
afterEach(cleanup);

describe("the distributors in the track dialog", () => {
  it("lists them in the workspace's preferred order when that is on", async () => {
    vi.mocked(supply.listSupplyConnectors).mockResolvedValue([connector("c1", "DigiKey"), connector("c2", "Mouser")]);
    vi.mocked(supply.getAssessmentSettings).mockResolvedValue({ settings: { prefer_distributors: true, distributor_order: ["c2", "c1"] } } as never);
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: [] });
    tracking.previewTrackProject.mockResolvedValue(preview());
    render(<MemoryRouter><TrackProjectButton projectId="prj_1" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Track this project/ }));
    await screen.findByLabelText("Mouser");
    const labels = screen.getAllByRole("checkbox").map((box) => box.id);
    expect(labels.indexOf("con-c2")).toBeLessThan(labels.indexOf("con-c1"));
  });
});

describe("the track button of a tracked project", () => {
  it("shows a Tracked chip and a settings button instead of asking to track again", async () => {
    tracking.getProjectTracking.mockResolvedValue({
      tracked: {
        project_id: "prj_1", variants: [""], all_variants: false, packaging: "cut_tape", build_quantity: 100, spares: null, connector_ids: null,
        tracked_by: "a", tracked_at: "2026-10-01",
      },
      has_usage: true, variants: [],
    });
    render(<MemoryRouter><TrackProjectButton projectId="prj_1" /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Tracking settings" })).toBeTruthy();
    expect(screen.getByText("Tracked")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Track this project/ })).toBeNull();
  });
});

describe("tracking a project", () => {
  beforeEach(() => {
    tracking.getTrackProgress.mockResolvedValue({ state: "running", done: 40, total: 100, failed: 0, reason: "", parts: 100, connectors: [{ connector_id: "c1", name: "DigiKey", total: 100, done: 40 }] });
  });

  async function open() {
    render(<MemoryRouter><TrackProjectButton projectId="prj_1" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Track this project/ }));
  }

  it("asks everything in one dialog, shows the cost as a bar, tracks, then shows the first searches", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: ["Lite"] });
    tracking.previewTrackProject.mockResolvedValue(preview());
    tracking.trackProject.mockResolvedValue(preview());
    await open();
    expect(await screen.findByRole("progressbar", { name: "DigiKey committed calls" })).toBeTruthy();
    expect(screen.getByText("+120 calls a day")).toBeTruthy();
    expect(tracking.previewTrackProject).toHaveBeenLastCalledWith(
      "prj_1", { variants: [""], all_variants: false, packaging: "cut_tape", connector_ids: null, build_quantity: 100, spares: "" }, expect.anything(),
    );
    expect(screen.getByLabelText("Built at JLCPCB")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Lite"));
    fireEvent.change(screen.getByRole("combobox", { name: "Packaging" }), { target: { value: "tape_reel" } });
    fireEvent.click(await screen.findByRole("button", { name: "Track (104)" }));
    await waitFor(() => expect(tracking.trackProject).toHaveBeenCalledWith(
      "prj_1", { variants: ["", "Lite"], all_variants: false, packaging: "tape_reel", connector_ids: null, build_quantity: 100, spares: "" },
    ));
    expect(await screen.findByRole("progressbar", { name: "DigiKey searched" })).toBeTruthy();
    expect(screen.getByText("40 of 100")).toBeTruthy();
    expect(screen.getByText("4 wait for room")).toBeTruthy();
  });

  it("raises a budget from a small dialog over the track dialog when parts would wait", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: [] });
    tracking.previewTrackProject.mockResolvedValue(preview());
    vi.mocked(supply.updateSupplyConnector).mockResolvedValue(connector("c1", "DigiKey", { daily_budget: 2000 }));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Raise the budget" }));
    fireEvent.change(await screen.findByLabelText("Calls a day"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Raise" }));
    await waitFor(() => expect(supply.updateSupplyConnector).toHaveBeenCalledWith("c1", { daily_budget: 2000 }));
    await waitFor(() => expect(tracking.previewTrackProject).toHaveBeenCalledTimes(2));
  });

  it("can follow every design, also those added later", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: ["Lite"] });
    tracking.previewTrackProject.mockResolvedValue(preview());
    tracking.trackProject.mockResolvedValue(preview());
    await open();
    fireEvent.click(await screen.findByLabelText("Also designs added later"));
    fireEvent.click(await screen.findByRole("button", { name: "Track (104)" }));
    await waitFor(() => expect(tracking.trackProject).toHaveBeenCalledWith(
      "prj_1", { variants: [""], all_variants: true, packaging: "cut_tape", connector_ids: null, build_quantity: 100, spares: "" },
    ));
  });

  it("tracks with the usual build the person gives, and keeps the one a tracked project has", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: [] });
    tracking.previewTrackProject.mockResolvedValue(preview());
    tracking.trackProject.mockResolvedValue(preview());
    await open();
    fireEvent.change(await screen.findByLabelText("Usual build, in boards"), { target: { value: "250" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Track/ }));
    await waitFor(() => expect(tracking.trackProject).toHaveBeenCalledWith(
      "prj_1", { variants: [""], all_variants: false, packaging: "cut_tape", connector_ids: null, build_quantity: 250, spares: "" },
    ));
  });

  it("tracks with the spares the person picks", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: [] });
    tracking.previewTrackProject.mockResolvedValue(preview());
    tracking.trackProject.mockResolvedValue(preview());
    await open();
    fireEvent.change(await screen.findByLabelText("Spares"), { target: { value: "percent" } });
    fireEvent.change(screen.getByLabelText("Spare parts, percent"), { target: { value: "5" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Track/ }));
    await waitFor(() => expect(tracking.trackProject).toHaveBeenCalledWith(
      "prj_1", { variants: [""], all_variants: false, packaging: "cut_tape", connector_ids: null, build_quantity: 100, spares: "5" },
    ));
  });

  it("refuses to track when nothing fits anywhere", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: [] });
    tracking.previewTrackProject.mockResolvedValue(preview({ fits_nowhere: true }));
    await open();
    expect(await screen.findByText(/Nothing fits at any distributor/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Track/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("settles lines several makers share before tracking, one click each", async () => {
    tracking.getProjectTracking.mockResolvedValue({ tracked: null, has_usage: true, variants: [] });
    tracking.previewTrackProject.mockResolvedValueOnce(preview({
      tracked: { project_id: "prj_1", variants: [""], parts_created: 0, skipped: [{ mpn: "LM358D", reason: "needs_choice", manufacturer: "Some Name", candidates: [{ part_id: "p1", manufacturer: "Texas Instruments" }, { part_id: "p2", manufacturer: "Onsemi" }] }] },
    }));
    tracking.previewTrackProject.mockResolvedValue(preview());
    tracking.chooseTrackLine.mockResolvedValue(undefined);
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("written as Some Name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Texas Instruments" }));
    await waitFor(() => expect(tracking.chooseTrackLine).toHaveBeenCalledWith("prj_1", "p1", "Some Name"));
    await waitFor(() => expect(tracking.previewTrackProject).toHaveBeenCalledTimes(2));
  });

  it("reads the BOM itself when Prism has not, then goes on", async () => {
    // The button and the dialog share one read of the project's tracking.
    tracking.getProjectTracking
      .mockResolvedValueOnce({ tracked: null, has_usage: false, variants: [] })
      .mockResolvedValue({ tracked: null, has_usage: true, variants: ["Lite"] });
    tracking.readProjectBom.mockResolvedValue({ state: "done", done: 1, total: 1, failed: 0, reason: "", changed: true });
    tracking.previewTrackProject.mockResolvedValue(preview());
    await open();
    expect(await screen.findByRole("progressbar", { name: "Reading the BOM" })).toBeTruthy();
    expect(await screen.findByLabelText("Lite")).toBeTruthy();
    expect(tracking.readProjectBom).toHaveBeenCalledWith("prj_1");
  });
});

describe("a part's tracking", () => {
  it("says how and why, previews a change and applies it", async () => {
    tracking.getPartTracking.mockResolvedValue({ tier: { tier: 2, rate: "weekly", reasons: [{ kind: "legacy", ref: "w1" }] }, waiting_at: [], watch: null });
    tracking.previewFollow.mockResolvedValue(preview());
    tracking.followPart.mockResolvedValue({ ...preview(), tier: null, watch: null });
    const changed = vi.fn().mockResolvedValue(undefined);
    render(<TrackingControl partId="p1" canEdit onChanged={changed} />);
    expect(await screen.findByText(/Read weekly \(tier 2\), because of a watch from before tiers/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Tier"), { target: { value: "1" } });
    expect(await screen.findByLabelText("Daily call limit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(tracking.followPart).toHaveBeenCalledWith("p1", { tier: 1, rate: "weekly" }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it("only reads for someone who may not change it", async () => {
    tracking.getPartTracking.mockResolvedValue({ tier: null, waiting_at: ["c1"], watch: null });
    render(<TrackingControl partId="p1" canEdit={false} onChanged={vi.fn()} />);
    expect(await screen.findByText(/Not followed/)).toBeTruthy();
    expect(screen.getByText(/Queued for calls at 1 distributor/)).toBeTruthy();
    expect(screen.queryByLabelText("Tier")).toBeNull();
  });
});
