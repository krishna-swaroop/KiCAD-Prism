import { describe, expect, it } from "vitest";
import {
  adoptViewerNets,
  highlightRefs,
  netFromSelection,
  removeHighlightedNet,
  sameHighlightedNets,
  toggleHighlightedNet,
  type HighlightedNet,
} from "./net-highlights";
import type { PrismSemanticIndex } from "@/types/prism-selection";

const INDEX: PrismSemanticIndex = {
  sourceRevisionKey: "rev",
  components: [],
  terminals: [],
  nets: [
    { netUid: "net-a", name: "/Power/VBUS", netCode: 4, pcbRefs: [{ trackUuids: ["t1", "t2"], viaUuids: ["v1"] }] },
    { netUid: "net-b", name: "GND", netCode: 1 },
  ],
  indexes: { netByName: { "/Power/VBUS": 0, GND: 1 } },
} as unknown as PrismSemanticIndex;

const A: HighlightedNet = { netName: "/Power/VBUS", netUid: "net-a", netCode: 4 };
const B: HighlightedNet = { netName: "GND", netUid: "net-b", netCode: 1 };

describe("netFromSelection", () => {
  it("takes a net selection with the index's uid, code and copper uuids", () => {
    expect(netFromSelection({ kind: "net", sourceContext: "PCB", netName: "/Power/VBUS" }, INDEX)).toEqual({
      netName: "/Power/VBUS",
      netUid: "net-a",
      netCode: 4,
      pcbUuids: ["t1", "t2", "v1"],
    });
  });

  it("takes a terminal's net and resolves it by uid first", () => {
    expect(
      netFromSelection({ kind: "terminal", sourceContext: "SCH", reference: "R1", pin: "1", netUid: "net-b", netName: "gnd?" }, INDEX)?.netName,
    ).toBe("GND");
  });

  it("falls back to the selection's own name without an index", () => {
    expect(netFromSelection({ kind: "net", sourceContext: "PCB", netName: "CLK", netCode: 9 }, null)).toEqual({
      netName: "CLK",
      netUid: undefined,
      netCode: 9,
      pcbUuids: undefined,
    });
  });

  it("has nothing for components or unnamed nets", () => {
    expect(netFromSelection({ kind: "component", sourceContext: "PCB", reference: "R1" }, INDEX)).toBeNull();
    expect(netFromSelection({ kind: "net", sourceContext: "PCB", netName: "", uuid: "u" }, null)).toBeNull();
    expect(netFromSelection(null, INDEX)).toBeNull();
  });
});

describe("collection edits", () => {
  it("toggles by identity and keeps insertion order", () => {
    let nets = toggleHighlightedNet([], A);
    nets = toggleHighlightedNet(nets, B);
    expect(nets.map((n) => n.netName)).toEqual(["/Power/VBUS", "GND"]);
    nets = toggleHighlightedNet(nets, { netName: "/Power/VBUS" });
    expect(nets.map((n) => n.netName)).toEqual(["GND"]);
    nets = toggleHighlightedNet(nets, { netName: "other", netUid: "net-b" });
    expect(nets).toEqual([]);
  });

  it("removes without touching the others", () => {
    expect(removeHighlightedNet([A, B], A)).toEqual([B]);
    expect(removeHighlightedNet([A, B], { netName: "nope" })).toEqual([A, B]);
  });

  it("builds viewer refs with copper uuids only when present", () => {
    expect(highlightRefs([{ ...A, pcbUuids: ["t1"] }, B])).toEqual([
      { name: "/Power/VBUS", netCode: 4, uuids: ["t1"] },
      { name: "GND", netCode: 1, uuids: undefined },
    ]);
  });
});

describe("adoptViewerNets", () => {
  it("returns the same list when the viewer reports the same names", () => {
    const current = [A, B];
    expect(adoptViewerNets(current, [{ name: "/Power/VBUS", netCode: 4 }, { name: "GND", netCode: 1 }])).toBe(current);
  });

  it("keeps known hints and takes the viewer's code for new names", () => {
    const next = adoptViewerNets([A], [{ name: "GND", netCode: 1 }]);
    expect(next).toEqual([{ netName: "GND", netCode: 1 }]);
    const kept = adoptViewerNets([A, B], [{ name: "GND", netCode: 7 }]);
    expect(kept).toEqual([B]);
  });

  it("adopts an empty report as a clear", () => {
    expect(adoptViewerNets([A], [])).toEqual([]);
    expect(sameHighlightedNets([A], [A])).toBe(true);
    expect(sameHighlightedNets([A], [B])).toBe(false);
  });
});
