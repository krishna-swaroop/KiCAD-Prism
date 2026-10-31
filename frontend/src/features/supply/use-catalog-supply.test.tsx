import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./catalog-supply-api", () => ({ getComponentsStatus: vi.fn() }));

import { CatalogSupplyDot } from "./catalog-supply-dot";
import * as api from "./catalog-supply-api";
import { useCatalogSupply } from "./use-catalog-supply";
import { standingFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);
const rows = [
  { id: "c1", manufacturer: "Acme", mpn: "ABC-1" },
  { id: "c2", manufacturer: "Acme", mpn: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getComponentsStatus.mockResolvedValue({ c1: standingFixture({ status: "warning", stock: 40, watched: true }) });
});
afterEach(cleanup);

describe("supply status in the catalog", () => {
  it("asks once for the rows that have a manufacturer and a part number", async () => {
    const { result } = renderHook(() => useCatalogSupply(rows, "designer"));
    await waitFor(() => expect(result.current.standing.c1?.status).toBe("warning"));
    expect(mocked.getComponentsStatus).toHaveBeenCalledTimes(1);
    expect(mocked.getComponentsStatus.mock.calls[0][0]).toEqual([{ id: "c1", manufacturer: "Acme", mpn: "ABC-1" }]);
  });

  it("asks again when a row keeps its id but its maker or number is edited", async () => {
    const { result, rerender } = renderHook(({ shown }) => useCatalogSupply(shown, "designer"), { initialProps: { shown: rows } });
    await waitFor(() => expect(result.current.standing.c1).toBeTruthy());
    rerender({ shown: [{ id: "c1", manufacturer: "Acme", mpn: "ABC-2" }, rows[1]] });
    await waitFor(() => expect(mocked.getComponentsStatus).toHaveBeenCalledTimes(2));
    expect(mocked.getComponentsStatus.mock.calls[1][0]).toEqual([{ id: "c1", manufacturer: "Acme", mpn: "ABC-2" }]);
  });

  it("asks nothing for a role without supply access", () => {
    const { result } = renderHook(() => useCatalogSupply(rows, "viewer"));
    expect(result.current.standing).toEqual({});
    expect(mocked.getComponentsStatus).not.toHaveBeenCalled();
  });

  it("shows a dot for a tracked component and nothing otherwise", () => {
    const { container, rerender } = render(<CatalogSupplyDot standing={standingFixture({ status: "error", stock: 0, watched: true })} />);
    expect(screen.getByRole("img", { name: "At risk" })).toBeTruthy();
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe("Watched, 0 in stock");
    rerender(<CatalogSupplyDot standing={undefined} />);
    expect(container.textContent).toBe("");
    expect(container.querySelector("[role=img]")).toBeNull();
  });
});
