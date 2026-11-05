import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", () => ({ listNumberEndings: vi.fn(), addNumberEnding: vi.fn(), removeNumberEnding: vi.fn() }));

import { NumberEndings } from "./number-endings";
import * as api from "./supply-api";

const mocked = vi.mocked(api);
const endings = [
  { suffix_key: "TR", suffix_text: "TR", kind: "packaging" as const, source: "seeded" },
  { suffix_key: "Q100", suffix_text: "Q100", kind: "grade" as const, source: "seeded" },
];

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); mocked.listNumberEndings.mockResolvedValue(endings); });
afterEach(cleanup);

describe("the endings of part numbers", () => {
  it("lists packaging and grade apart, adds an ending and removes one", async () => {
    mocked.addNumberEnding.mockResolvedValue(endings);
    mocked.removeNumberEnding.mockResolvedValue(undefined);
    render(<NumberEndings />);
    fireEvent.click(await screen.findByRole("button", { name: /Endings of part numbers/ }));
    const grade = await screen.findByLabelText("Grade");
    fireEvent.click(within(grade).getByRole("button", { name: "Remove Q100" }));
    await waitFor(() => expect(mocked.removeNumberEnding).toHaveBeenCalledWith("Q100"));
    fireEvent.change(screen.getByLabelText("Ending"), { target: { value: " -T7 " } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "packaging" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mocked.addNumberEnding).toHaveBeenCalledWith("-T7", "packaging"));
    expect(within(screen.getByLabelText("Packaging")).getByText("TR")).toBeTruthy();
  });
});
