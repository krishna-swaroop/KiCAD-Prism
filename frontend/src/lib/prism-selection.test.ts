import { describe, expect, it } from "vitest";
import { netStatisticsRefForSelection } from "./prism-selection";

describe("netStatisticsRefForSelection", () => {
  it("passes a net's name and code through", () => {
    expect(
      netStatisticsRefForSelection({ kind: "net", sourceContext: "PCB", netName: "SIG", netCode: 4 }),
    ).toEqual({ name: "SIG", netCode: 4 });
  });

  it("uses the net a terminal sits on", () => {
    expect(
      netStatisticsRefForSelection({ kind: "terminal", sourceContext: "SCH", reference: "R1", pin: "2", netName: "GND" }),
    ).toEqual({ name: "GND", netCode: undefined });
  });

  it("drops an empty name so an unresolved uuid-only net does not match by accident", () => {
    expect(netStatisticsRefForSelection({ kind: "net", sourceContext: "PCB", netName: "", uuid: "abc" })).toBeNull();
    expect(netStatisticsRefForSelection({ kind: "net", sourceContext: "PCB", netName: "", netCode: 3 })).toEqual({
      name: undefined,
      netCode: 3,
    });
  });

  it("has nothing for components or an empty selection", () => {
    expect(netStatisticsRefForSelection({ kind: "component", sourceContext: "PCB", reference: "R1" })).toBeNull();
    expect(netStatisticsRefForSelection(null)).toBeNull();
  });
});
