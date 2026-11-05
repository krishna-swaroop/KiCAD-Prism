import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { partDetailFixture } from "./supply-test-fixtures";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  findSupplyPart: vi.fn(),
  getSupplyPart: vi.fn(),
}));

import BomWhereUsed from "./bom-where-used";
import * as api from "./supply-api";
import { forgetServerState } from "@/lib/server-state";

const mocked = vi.mocked(api);

const uses = [
  { project_id: "prj_1", project_name: "Imported board", quantity: 2, references: "R1 R2", only_in_variants: [] },
  { project_id: "prj_2", project_name: "BOM only board", quantity: 44, references: "C1", only_in_variants: [] },
];

function renderIt(manufacturer = "TI", mpn = "LM358D", known = new Set(["prj_1"])) {
  render(
    <MemoryRouter>
      <BomWhereUsed manufacturer={manufacturer} mpn={mpn} knownProjectIds={known} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.findSupplyPart.mockResolvedValue("p1");
  mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ used_in: uses }));
});
afterEach(cleanup);

describe("Also in project BOMs", () => {
  it("lists the boards the imports do not already show", async () => {
    renderIt();
    const link = await screen.findByRole("link", { name: "BOM only board" });
    expect(link.getAttribute("href")).toBe("/project/prj_2");
    expect(screen.queryByRole("link", { name: "Imported board" })).toBeNull();
    expect(screen.getByText("Also in project BOMs (1)")).toBeTruthy();
  });

  it("shows nothing when every board is already listed, or Prism does not know the part", async () => {
    renderIt("TI", "LM358D", new Set(["prj_1", "prj_2"]));
    await waitFor(() => expect(mocked.getSupplyPart).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "In project BOMs" })).toBeNull();
    cleanup();
    forgetServerState([]);
    mocked.findSupplyPart.mockResolvedValue(null);
    renderIt();
    await waitFor(() => expect(mocked.findSupplyPart).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region", { name: "In project BOMs" })).toBeNull();
  });

  it("asks for nothing without a part number", () => {
    renderIt("TI", " ");
    expect(mocked.findSupplyPart).not.toHaveBeenCalled();
  });
});
