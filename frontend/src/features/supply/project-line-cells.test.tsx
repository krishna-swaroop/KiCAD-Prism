import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProjectSupplyPart } from "@/types/supply";
import { CostCell, LinePriceCell, type ProjectLines } from "./project-line-cells";

afterEach(cleanup);

const line = (fields: Partial<ProjectSupplyPart>) => ({
  key: "k", manufacturer: "Acme", mpn: "USB-1", quantity: 1, references: "J1", part_id: "p1", state: "tracked", status: "ok", stock: 10,
  lifecycle: "active", short: false, notes: 0, buy_quantity: 10, ...fields,
}) as ProjectSupplyPart;

function row(part: ProjectSupplyPart, lines: ProjectLines) {
  return render(<table><tbody><tr><LinePriceCell line={part} lines={lines} /><CostCell line={part} lines={lines} /></tr></tbody></table>);
}

describe("a project line's prices", () => {
  it("shows the unit price in the total's currency, so the line reads as its cost, with the offer's own price as its title", () => {
    const lines = { currency: "INR" } as ProjectLines;
    row(line({ unit_price: "0.2092", unit_currency: "USD", unit_price_in_total: "19.9", line_cost: "199" }), lines);
    const cells = screen.getAllByRole("cell");
    expect(cells[0].textContent).toContain("₹19.90");
    expect(cells[0].getAttribute("title")).toBe("Converted from $0.2092");
    expect(cells[1].textContent).toContain("10 × ₹19.90");
    expect(cells[1].textContent).not.toContain("0.2092");
  });

  it("shows the offer's own price as it is when it is already in the total's currency", () => {
    row(line({ unit_price: "0.5", unit_currency: "EUR", unit_price_in_total: "0.5", line_cost: "5" }), { currency: "EUR" } as ProjectLines);
    expect(screen.getAllByRole("cell")[0].getAttribute("title")).toBeNull();
  });
});
