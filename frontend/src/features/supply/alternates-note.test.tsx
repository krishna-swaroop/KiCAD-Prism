import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSupplyPart, SupplyBomAlternate } from "@/types/supply";
import { AlternatesNote } from "./alternates-note";
import { LineNotes, UnmatchedRow } from "./project-line-cells";
import { projectLineFixture } from "./supply-test-fixtures";

afterEach(cleanup);

const alternate: SupplyBomAlternate = { part_id: "a1", manufacturer: "Acme", mpn: "ALT-1", stock: 5000, status: "ok" };

function line(overrides: Partial<ProjectSupplyPart> = {}): ProjectSupplyPart {
  return projectLineFixture({ mpn: "MAIN-1", quantity: 2, references: "R1 R2", stock: 5000, ...overrides });
}

describe("the alternates note", () => {
  it("counts the alternates and names each with its stock", () => {
    render(<AlternatesNote alternates={[alternate, { ...alternate, part_id: "a2", mpn: "ALT-2", stock: null }]} statusFrom="a1" />);
    const note = screen.getByText("+2 alt");
    expect(note.getAttribute("title")).toBe("ALT-1 (Acme): 5,000 in stock\nALT-2 (Acme): not read\nStatus from ALT-1");
  });

  it("is nothing without alternates", () => {
    const { container } = render(<AlternatesNote alternates={[]} />);
    expect(container.textContent).toBe("");
  });

  it("shows a project line's stock with its alternates", () => {
    render(<LineNotes line={line({ alternates: [alternate] })} />);
    expect(screen.getByText(/5,000 with alternates/)).toBeTruthy();
  });
});

describe("a project line no part matches", () => {
  function renderRow(part: ProjectSupplyPart, onAddToLibrary?: (part: ProjectSupplyPart) => void) {
    render(<table><tbody><UnmatchedRow line={part} lines={{ byPart: new Map(), currency: "EUR", onAddToLibrary }} /></tbody></table>);
  }

  it("says it is not in the library and offers to add it", () => {
    const onAdd = vi.fn();
    const part = line({ part_id: null, state: "unknown", in_library: false });
    renderRow(part, onAdd);
    expect(screen.getByText("Not in library")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to Component Database" }));
    expect(onAdd).toHaveBeenCalledWith(part);
  });

  it("offers nothing to someone who cannot write the catalog, or for a library line", () => {
    renderRow(line({ part_id: null, state: "unknown", in_library: false }));
    expect(screen.queryByRole("button", { name: "Add to Component Database" })).toBeNull();
    cleanup();
    renderRow(line({ part_id: null, state: "unknown", in_library: true }), vi.fn());
    expect(screen.queryByText("Not in library")).toBeNull();
  });
});
