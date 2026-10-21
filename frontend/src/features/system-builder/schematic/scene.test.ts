import { describe, expect, it } from "vitest";

import type { BundleConnector, SchematicPoint, SystemBundle, SystemDocument } from "../model/types";
import { SYMBOL_GAP_NM } from "./geometry";
import { buildScene, naturalCompare } from "./scene";

const COMMIT = "a".repeat(40);
const board = (id: string, label: string) => ({
  id,
  label,
  source: { kind: "board" as const, projectId: "prj_000000000001", track: { kind: "followed" as const, branch: "main", commit: COMMIT } },
});
const connector = (refdes: string, angleDeg: number, side: "top" | "bottom" = "top"): BundleConnector => ({
  refdes,
  value: "QTH-060",
  candidate: true,
  placement: { angleDeg, side },
  pins: [{ pad: "1", nets: [], power: false }, { pad: "2", nets: [], power: false }],
});

const DOCUMENT: SystemDocument = {
  schema: "prism.system.v2",
  name: "Stack",
  sheets: [],
  occurrences: [board("occ_carrier", "Carrier"), board("occ_som", "SoM")],
  subPorts: [],
  dismissedSuggestions: [],
  bodyConnectors: [],
  mates: [{
    id: "mate_a",
    a: { occurrence: "occ_carrier", connector: "J202" },
    b: { occurrence: "occ_som", connector: "J1" },
    orientation: { quarterTurns: 0, flip: false },
    rows: {},
  }],
  harnesses: [{
    id: "har_a", label: "H1",
    ends: [{ id: "end_a", site: { occurrence: "occ_carrier", connector: "J2201" }, contacts: {}, pinMap: [] }],
    links: [], wires: [], splices: [], branchPoints: [], segments: [], coverings: [], cables: [], looseEnds: [], markers: [], waypoints: [],
  }],
  exports: [],
  waivers: [],
  layout: { occ_carrier: { xNm: 0, yNm: 0, rotationDeg: 0, mirror: false } },
};

const BUNDLE = {
  schema: "prism.system_bundle.a0",
  occurrences: [
    { occurrence: "occ_carrier", state: "ready", outline: { widthNm: 100_000_000, heightNm: 100_000_000 }, connectors: [connector("J202", 270), connector("J2201", 180)] },
    { occurrence: "occ_som", state: "ready", outline: { widthNm: 50_000_000, heightNm: 50_000_000 }, connectors: [connector("J1", 270, "bottom")] },
  ],
  nets: [], mates: [], links: [], splices: [], suggestions: [], findings: [],
} as unknown as SystemBundle;

describe("buildScene", () => {
  it("draws boards as sheets with one pin per connector, placed by angle", () => {
    const scene = buildScene(DOCUMENT, BUNDLE);
    const carrier = scene.symbols.find((symbol) => symbol.id === "occ_carrier");
    expect(carrier?.rect).toMatchObject({ x: 0, y: 0, w: 50_800_000, h: 50_800_000 });
    expect(carrier?.ports.map((port) => [port.key, port.edge])).toEqual([["J202", "bottom"], ["J2201", "left"]]);
    const som = scene.symbols.find((symbol) => symbol.id === "occ_som");
    expect(som?.ports[0]).toMatchObject({ key: "J1", edge: "bottom", back: true, connected: true });
  });

  it("puts an unplaced occurrence in a row to the right of the placed ones", () => {
    const scene = buildScene(DOCUMENT, BUNDLE);
    const som = scene.symbols.find((symbol) => symbol.id === "occ_som");
    expect(som?.rect.x).toBe(50_800_000 + SYMBOL_GAP_NM);
    expect(som?.rect.y).toBe(0);
  });

  it("draws a mate between the two pins and a harness end into its block", () => {
    const scene = buildScene(DOCUMENT, BUNDLE);
    const mate = scene.connections.find((connection) => connection.id === "mate_a");
    expect(mate?.pins).toBe(2);
    const carrierPin = scene.symbols[0].ports.find((port) => port.key === "J202");
    expect(mate?.points[0]).toEqual(carrierPin?.point);
    expect(mate?.stored).toBe(false);
    const end = scene.connections.find((connection) => connection.id === "end_a");
    expect(end).toMatchObject({ kind: "harness", harness: "har_a", b: { item: "har_a", key: "end_a" } });
    const block = scene.symbols.find((symbol) => symbol.id === "har_a");
    expect(block?.lines).toEqual(["Carrier.J2201"]);
    // J2201 is on the carrier's left edge, so the block sits out to the left
    // and its pin faces right, back towards the site.
    expect(block?.ports[0].edge).toBe("right");
    expect((block?.rect.x ?? 0) + (block?.rect.w ?? 0)).toBeLessThan(0);
  });

  it("keeps a default harness block off the boards when its sites face each other", () => {
    const facing = structuredClone(DOCUMENT);
    facing.harnesses[0].ends.push({ id: "end_b", site: { occurrence: "occ_carrier", connector: "J9" }, contacts: {}, pinMap: [] });
    const bundle = structuredClone(BUNDLE);
    bundle.occurrences[0].connectors.push(connector("J9", 0));
    const scene = buildScene(facing, bundle);
    const block = scene.symbols.find((symbol) => symbol.id === "har_a")!.rect;
    for (const symbol of scene.symbols.filter((item) => item.kind !== "harness")) {
      const r = symbol.rect;
      expect(block.x < r.x + r.w && r.x < block.x + block.w && block.y < r.y + r.h && r.y < block.y + block.h).toBe(false);
    }
  });

  it("uses a stored route and a layout override", () => {
    const route: [SchematicPoint, SchematicPoint] = [{ xNm: 1, yNm: 2 }, { xNm: 3, yNm: 2 }];
    const scene = buildScene(DOCUMENT, BUNDLE, { override: { mate_a: { xNm: 0, yNm: 0, rotationDeg: 0, mirror: false, route } } });
    const mate = scene.connections.find((connection) => connection.id === "mate_a");
    expect(mate).toMatchObject({ stored: true, points: [{ x: 1, y: 2 }, { x: 3, y: 2 }] });
  });

  it("keeps a connector the document names but the bundle lost, as a dangling pin", () => {
    const lost = { ...BUNDLE, occurrences: [BUNDLE.occurrences[0], { ...BUNDLE.occurrences[1], connectors: [] }] } as SystemBundle;
    const scene = buildScene(DOCUMENT, lost);
    const pin = scene.symbols.find((symbol) => symbol.id === "occ_som")?.ports[0];
    expect(pin).toMatchObject({ key: "J1", missing: true });
    expect(scene.connections.find((connection) => connection.id === "mate_a")?.dangling).toBe(true);
  });

  it("shows named connectors on the left before the bundle arrives", () => {
    const scene = buildScene(DOCUMENT, undefined);
    const carrier = scene.symbols.find((symbol) => symbol.id === "occ_carrier");
    expect(carrier?.ports.map((port) => [port.key, port.edge, port.missing])).toEqual([
      ["J202", "left", false],
      ["J2201", "left", false],
    ]);
  });
});

describe("naturalCompare", () => {
  it("orders reference designators naturally", () => {
    expect(["J10", "J2", "J1", "J2201"].sort(naturalCompare)).toEqual(["J1", "J2", "J10", "J2201"]);
  });
});
