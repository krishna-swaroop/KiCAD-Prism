import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", () => ({ listMakerSpellings: vi.fn(), addMakerSpelling: vi.fn(), removeMakerSpelling: vi.fn() }));

import { MakerSpellings } from "./maker-spellings";
import * as api from "./supply-api";

const mocked = vi.mocked(api);
const groups = [{ group_key: "texas instruments", name: "Texas Instruments", spellings: [
  { alias_key: "texas instruments", alias_text: "Texas Instruments", source: "seeded" }, { alias_key: "ti", alias_text: "TI", source: "seeded" },
] }];

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); mocked.listMakerSpellings.mockResolvedValue(groups); });
afterEach(cleanup);

describe("the known spellings of makers", () => {
  it("lists them by maker, adds one to a maker and removes one", async () => {
    mocked.addMakerSpelling.mockResolvedValue(groups);
    mocked.removeMakerSpelling.mockResolvedValue(undefined);
    render(<MakerSpellings />);
    fireEvent.click(await screen.findByRole("button", { name: /Known spellings of makers/ }));
    const row = await screen.findByLabelText("Texas Instruments");
    fireEvent.click(within(row).getByRole("button", { name: "Remove TI" }));
    await waitFor(() => expect(mocked.removeMakerSpelling).toHaveBeenCalledWith("ti"));
    fireEvent.change(screen.getByLabelText("Spelling"), { target: { value: " TXN " } });
    fireEvent.change(screen.getByLabelText("Of the maker"), { target: { value: "texas instruments" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mocked.addMakerSpelling).toHaveBeenCalledWith("TXN", "texas instruments"));
  });

  it("opens for someone who may only read, with no way to add or remove a spelling", async () => {
    render(<MakerSpellings readOnly />);
    const toggle = await screen.findByRole("button", { name: /Known spellings of makers/ });
    expect(toggle.matches(":disabled")).toBe(false);
    fireEvent.click(toggle);
    const row = await screen.findByLabelText("Texas Instruments");
    expect(within(row).getByText("TI")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Remove TI" })).toBeNull();
    expect(screen.queryByLabelText("Spelling")).toBeNull();
  });
});
