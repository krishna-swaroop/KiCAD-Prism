import { describe, expect, it, vi } from "vitest";

import { partCommand, projectSupplyCommand, supplyCommands, supplyPartPath, trackCommand } from "./command-palette-supply";
import type { PartSearchRow } from "./use-part-search";

describe("the Supply entries of the command palette", () => {
  it("go to each Supply view for roles that may open it", () => {
    const goTo = vi.fn((params: string) => () => params);
    const commands = supplyCommands("designer", goTo);
    const labels = commands.map((command) => command.label);
    expect(labels.slice(0, 5)).toEqual(["Supply: Dashboard", "Supply: Tracking", "Supply: Review", "Supply: Insights", "Supply: Sources"]);
    expect(goTo).toHaveBeenCalledWith("?section=supply&supplyView=tracking");
  });

  it("open Parts on a group when it is named in words", () => {
    const goTo = vi.fn((params: string) => () => params);
    const commands = supplyCommands("qa", goTo);
    expect(commands.map((command) => command.label)).toContain("Supply: parts out of stock");
    expect(goTo).toHaveBeenCalledWith("?section=supply&supplyView=tracking&partsOnly=out_of_stock");
    expect(goTo).toHaveBeenCalledWith("?section=supply&supplyView=tracking&partsScope=waiting");
    expect(goTo).toHaveBeenCalledWith("?section=supply&supplyView=tracking&tool=bom-file");
  });

  it("are absent for a viewer or a signed-out user", () => {
    expect(supplyCommands("viewer", vi.fn())).toEqual([]);
    expect(supplyCommands(undefined, vi.fn())).toEqual([]);
  });
});

const both: PartSearchRow = {
  key: "component:c1", label: "LM358DR", manufacturer: "Texas Instruments",
  library: { component_id: "c1", name: "LM358", stage: "released" },
  supply: { part_id: "p1", status: "ok", stock: 12500, tracked: true },
};
const options = (canLibrary: boolean) => ({ canLibrary, libraryPath: (id: string) => `/lib/${id}`, open: vi.fn() });

describe("a part row in the command palette", () => {
  it("is one row with the library state and the stock", () => {
    const command = partCommand(both, options(true));
    expect(command.group).toBe("Parts");
    expect(command.detail).toBe("Texas Instruments · released · 12,500 in stock");
  });

  it("opens the library component for library users and the supply sheet as the second action", () => {
    const opened = options(true);
    const command = partCommand(both, opened);
    command.run();
    expect(opened.open).toHaveBeenLastCalledWith("/lib/c1");
    expect(command.alt?.label).toBe("Open supply sheet");
    command.alt?.run();
    expect(opened.open).toHaveBeenLastCalledWith(supplyPartPath("p1"));
  });

  it("opens the supply sheet first for people without the library", () => {
    const opened = options(false);
    const command = partCommand(both, opened);
    command.run();
    expect(opened.open).toHaveBeenLastCalledWith(supplyPartPath("p1"));
    expect(command.alt?.label).toBe("Open in library");
  });

  it("has no second action when the part is in one place only", () => {
    const supplyOnly = partCommand({ ...both, library: null }, options(true));
    expect(supplyOnly.alt).toBeUndefined();
    expect(partCommand({ ...both, supply: null }, options(true)).alt).toBeUndefined();
  });

  it("says when a part has not been read or is out of stock", () => {
    expect(partCommand({ ...both, supply: { part_id: "p1", stock: null } }, options(true)).detail).toContain("not read yet");
    expect(partCommand({ ...both, supply: { part_id: "p1", stock: 0 } }, options(true)).detail).toContain("out of stock");
  });
});

const known: PartSearchRow = { key: "part:p1", label: "LM358DR", manufacturer: "TI", library: null, supply: { part_id: "p1" } };

describe("the other Supply entries of the command palette", () => {
  it("offers to track a number nothing found, to people who can", () => {
    const track = vi.fn();
    const [command] = trackCommand("LM358X", "designer", [known], track);
    expect(command.label).toBe("Track a part: LM358X");
    command.run();
    expect(track).toHaveBeenCalledWith("LM358X");
  });

  it("does not, for a number already tracked, a short or spaced query, or someone who cannot", () => {
    expect(trackCommand("lm358dr", "designer", [known], vi.fn())).toEqual([]);
    expect(trackCommand("LM", "designer", [], vi.fn())).toEqual([]);
    expect(trackCommand("op amp", "designer", [], vi.fn())).toEqual([]);
    expect(trackCommand("LM358X", "viewer", [], vi.fn())).toEqual([]);
  });

  it("opens a project's Supply tab for roles that read Supply", () => {
    const open = vi.fn();
    const [command] = projectSupplyCommand({ id: "p 1", name: "Power board" }, "qa", open);
    expect(command.label).toBe("Power board: Supply");
    command.run();
    expect(open).toHaveBeenCalledWith("/project/p%201?section=supply");
    expect(projectSupplyCommand({ id: "p1", name: "x" }, "viewer", open)).toEqual([]);
  });
});
