import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", () => ({ addRohsExemption: vi.fn(), removeRohsExemption: vi.fn() }));

import { RohsExemptions } from "./rohs-exemptions";
import * as api from "./supply-api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.addRohsExemption).mockResolvedValue(undefined);
  vi.mocked(api.removeRohsExemption).mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("RoHS exemptions", () => {
  it("names one and removes one", async () => {
    const changed = vi.fn();
    render(<RohsExemptions partId="p1" items={[{ code: "6(c)", note: "", declared_by: "a@example.com" }]} canEdit onChanged={changed} />);
    fireEvent.change(screen.getByLabelText("Exemption"), { target: { value: "7(a)" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "high melting solder" } });
    fireEvent.click(screen.getByRole("button", { name: "Name it" }));
    await waitFor(() => expect(api.addRohsExemption).toHaveBeenCalledWith("p1", "7(a)", "high melting solder"));
    fireEvent.click(screen.getByRole("button", { name: "Remove exemption 6(c)" }));
    await waitFor(() => expect(api.removeRohsExemption).toHaveBeenCalledWith("p1", "6(c)"));
  });

  it("shows nothing to a reader when there are none", () => {
    const { container } = render(<RohsExemptions partId="p1" items={[]} canEdit={false} onChanged={() => undefined} />);
    expect(container.textContent).toBe("");
  });
});
