import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { SupplyRecentChange } from "@/types/supply";
import { RecentChanges } from "./recent-changes";

afterEach(cleanup);

const change = (type: SupplyRecentChange["type"], detail: Record<string, unknown>): SupplyRecentChange => ({
  at: new Date().toISOString(), type, part_id: "p1", mpn: "LM358D", manufacturer: "TI", alert: null, sku: "S-1", detail,
});

describe("the recent changes", () => {
  it("say what a reading showed that the one before did not", () => {
    render(<RecentChanges onOpenPart={() => undefined} changes={[
      change("lifecycle_changed", { from: "active", to: "last_time_buy" }),
      change("normally_stocking_lost", {}),
      change("moq_jump", { from: 1, to: 2500 }),
      change("listing_gone", { packaging: "cut_tape" }),
      change("family_member_new", { mpn: "LM358DT", manufacturer: "ST" }),
      change("param_changed", { provider: "digikey", name: "Package / Case", from: "0603", to: "0805" }),
    ]} />);
    expect(screen.getByText("Lifecycle changed from active to last time buy (S-1)")).toBeTruthy();
    expect(screen.getByText("A distributor no longer stocks it normally (S-1)")).toBeTruthy();
    expect(screen.getByText("Smallest order went from 1 to 2500 (S-1)")).toBeTruthy();
    expect(screen.getByText("A distributor stopped listing it (S-1, cut tape)")).toBeTruthy();
    expect(screen.getByText("A new number turned up beside it: LM358DT (ST)")).toBeTruthy();
    expect(screen.getByText("digikey changed Package / Case from 0603 to 0805 with no notice")).toBeTruthy();
  });

  it("say what a tracked project's new revision changed, linked to the project", () => {
    render(
      <MemoryRouter>
        <RecentChanges onOpenPart={() => undefined} changes={[{
          at: new Date().toISOString(), type: "project_bom_changed", part_id: null, mpn: "", manufacturer: "", alert: null, sku: "",
          detail: { project_id: "prj_1", project_name: "Power board", added_count: 2, removed_count: 1,
            added: [{ mpn: "LM358D" }, { mpn: "TL072" }], removed: [{ mpn: "NE555" }] },
        }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Power board" }).getAttribute("href")).toBe("/project/prj_1?section=supply");
    expect(screen.getByText(/New BOM revision: 2 added \(LM358D, TL072\); 1 removed \(NE555\)/)).toBeTruthy();
  });
});

describe("the recent changes pages", () => {
  it("show 25 to a page and move between pages", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...change("moq_jump", { from: 1, to: 2 }), mpn: `P${i}`, at: new Date(Date.now() - i * 1000).toISOString() }));
    render(<RecentChanges onOpenPart={() => undefined} changes={many} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("26–30 of 30")).toBeTruthy();
  });
});
