import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User, UserRole } from "@/types/auth";

vi.mock("./dashboard-view", () => ({ DashboardView: () => <div>Dashboard content</div> }));
vi.mock("./insights-view", () => ({ InsightsView: () => <div>Insights content</div> }));
vi.mock("./parts-view", () => ({ PartsView: () => <div>Parts content</div> }));
const getLibraryComponentOf = vi.fn();
vi.mock("./supply-api", () => ({ getLibraryComponentOf: (id: string) => getLibraryComponentOf(id) }));
vi.mock("./projects-view", () => ({ ProjectsView: () => <div>Projects content</div> }));
vi.mock("./review-page", () => ({ ReviewPage: () => <div>Review content</div>, useReviewWaiting: () => 3 }));
vi.mock("./sources-view", () => ({ SourcesView: () => <div>Sources content</div> }));

import { SupplyWorkspace } from "./supply-workspace";

afterEach(cleanup);

function Location() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(role: UserRole | null, url = "/?section=supply") {
  const user: User | null = role ? { name: "U", email: "u@example.com", role } : null;
  render(
    <MemoryRouter initialEntries={[url]}>
      <SupplyWorkspace user={user} />
      <Location />
    </MemoryRouter>,
  );
}

describe("the Supply section", () => {
  it.each<UserRole>(["designer", "qa", "admin"])("opens for %s on the Dashboard tab", async (role) => {
    renderAt(role);
    expect(await screen.findByText("Dashboard content")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Dashboard" }).getAttribute("aria-selected")).toBe("true");
  });

  it("has six tabs, Review with what waits", async () => {
    renderAt("qa");
    expect((await screen.findAllByRole("tab")).map((tab) => tab.textContent)).toEqual(["Dashboard", "Tracking", "Projects", "Insights", "Review3", "Sources"]);
  });

  it("keeps old addresses working", async () => {
    renderAt("qa", "/?section=supply&supplyView=inbox");
    expect(await screen.findByText("Dashboard content")).toBeTruthy();
    cleanup();
    renderAt("qa", "/?section=supply&supplyView=planning");
    expect(await screen.findByText("Insights content")).toBeTruthy();
    cleanup();
    renderAt("qa", "/?section=supply&supplyView=market");
    expect(await screen.findByText("Insights content")).toBeTruthy();
    cleanup();
    renderAt("qa", "/?section=supply&supplyView=bom-file");
    expect(await screen.findByText("Parts content")).toBeTruthy();
  });

  it("opens Sources for an old Connectors address, keeping a sign-in result", async () => {
    renderAt("admin", "/?section=supply&supplyView=connectors&signin=ok");
    expect(await screen.findByText("Sources content")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("location").textContent).toContain("signin=ok");
  });

  it("opens Review", async () => {
    renderAt("qa", "/?section=supply&supplyView=review");
    expect(await screen.findByText("Review content")).toBeTruthy();
  });

  it("opens a linked part's component on its Supply tab, or the part on Tracking when the library has none", async () => {
    getLibraryComponentOf.mockResolvedValueOnce({ component_id: "c1" });
    renderAt("qa", "/?section=supply&supplyView=part&part=p1");
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toBe("/?section=library-manager&libraryView=catalog&component=c1&componentTab=sourcing"));
    cleanup();
    getLibraryComponentOf.mockResolvedValueOnce({ component_id: null });
    renderAt("qa", "/?section=supply&supplyView=part&part=p2");
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toBe("/?section=supply&supplyView=tracking&part=p2"));
  });

  it("titles each tab", async () => {
    renderAt("admin", "/?section=supply&supplyView=parts");
    expect(await screen.findByRole("heading", { name: "Tracking" })).toBeTruthy();
  });

  it("is closed to viewers and signed-out users, and says why", () => {
    renderAt("viewer");
    expect(screen.getByText("Supply data is not available to your role")).toBeTruthy();
    expect(screen.queryByText("Dashboard content")).toBeNull();
    cleanup();
    renderAt(null);
    expect(screen.getByText("Supply data is not available to your role")).toBeTruthy();
  });

  it("falls back to the Dashboard for an unknown view in the URL", async () => {
    renderAt("admin", "/?section=supply&supplyView=nonsense");
    expect(await screen.findByText("Dashboard content")).toBeTruthy();
  });

  it("drops the open part but keeps the Parts search when another tab is chosen", async () => {
    renderAt("admin", "/?section=supply&part=p1&partsQ=lm&partsScope=all&other=1");
    // Radix tabs switch on mouse down, as a real press does.
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Insights" }), { button: 0, ctrlKey: false });
    const location = screen.getByLabelText("location").textContent ?? "";
    expect(location).toContain("supplyView=insights");
    expect(location).toContain("other=1");
    expect(location).not.toContain("part=p1");
    expect(location).toContain("partsQ=lm");
    expect(location).toContain("partsScope=all");
  });

  it("mounts only the shown tab; the store keeps what a tab showed", async () => {
    renderAt("admin", "/?section=supply");
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Insights" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Insights content")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.queryByText("Insights content")).toBeNull());
  });

  it("leaves the URL alone when the open tab is clicked again", async () => {
    renderAt("admin", "/?section=supply&other=1");
    fireEvent.click(await screen.findByRole("tab", { name: "Dashboard" }));
    expect(screen.getByLabelText("location").textContent).toBe("/?section=supply&other=1");
  });
});
