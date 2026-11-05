import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PartSearchRow } from "./use-part-search";

const search = vi.hoisted(() => ({ rows: [] as PartSearchRow[] }));
vi.mock("@/components/use-part-search", () => ({
  usePartSearch: (open: boolean, enabled: boolean) => ({ rows: open && enabled ? search.rows : [], searching: false }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchJson: vi.fn(() => Promise.resolve({ projects: [] })),
}));

import { CommandPalette } from "./command-palette";
import { TopSearch } from "./top-search";

const row: PartSearchRow = {
  key: "component:c1", label: "RC0603FR-0710KL", manufacturer: "YAGEO",
  library: { component_id: "c1", name: "R 10k", stage: "released" },
  supply: { part_id: "p1", stock: 3567 },
};

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function renderAt(node: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      {node}
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  search.rows = [row];
});

describe("the header search", () => {
  it("lists parts matching a part number and opens the library component", () => {
    const onChange = vi.fn();
    renderAt(<TopSearch value="RC0603FR-0710KL" onChange={onChange} role="designer" />);
    fireEvent.focus(screen.getByRole("textbox"));
    const option = screen.getByRole("option", { name: /RC0603FR-0710KL/ });
    fireEvent.mouseDown(option);
    expect(screen.getByTestId("where").textContent).toContain("component=c1");
  });

  it("opens the supply sheet from the row's second action", () => {
    renderAt(<TopSearch value="RC0603FR-0710KL" onChange={vi.fn()} role="designer" />);
    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Open supply sheet" }));
    expect(screen.getByTestId("where").textContent).toBe("/?section=supply&supplyView=parts&part=p1");
  });

  it("lists no parts without a role", () => {
    renderAt(<TopSearch value="RC0603FR-0710KL" onChange={vi.fn()} role={undefined} />);
    fireEvent.focus(screen.getByRole("textbox"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("the command palette", () => {
  it("opens the supply sheet when its label is clicked", () => {
    renderAt(
      <CommandPalette open onOpenChange={vi.fn()} user={{ username: "a", role: "designer" } as never} onShowShortcuts={vi.fn()} onLogout={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "RC0603FR-0710KL" } });
    fireEvent.click(screen.getByRole("button", { name: /Open supply sheet/ }));
    expect(screen.getByTestId("where").textContent).toBe("/?section=supply&supplyView=parts&part=p1");
  });
});
