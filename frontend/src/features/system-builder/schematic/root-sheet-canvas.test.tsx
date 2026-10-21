import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { SystemBundle, SystemDocument, SystemOp } from "../model/types";
import { RootSheetCanvas, type Tool } from "./root-sheet-canvas";

const COMMIT = "c".repeat(40);
const board = (id: string, label: string) => ({
  id,
  label,
  source: { kind: "board" as const, projectId: "prj_000000000001", track: { kind: "pinned" as const, commit: COMMIT } },
});

const DOCUMENT: SystemDocument = {
  schema: "prism.system.v2",
  name: "Stack",
  sheets: [],
  occurrences: [board("occ_a", "A"), board("occ_b", "B")],
  subPorts: [],
  dismissedSuggestions: [],
  bodyConnectors: [],
  mates: [],
  harnesses: [],
  exports: [],
  waivers: [],
  layout: {
    occ_a: { xNm: 0, yNm: 0, rotationDeg: 0, mirror: false },
    occ_b: { xNm: 101_600_000, yNm: 0, rotationDeg: 0, mirror: false },
  },
};

const BUNDLE = {
  occurrences: [
    { occurrence: "occ_a", state: "ready", connectors: [{ refdes: "J1", value: "", candidate: true, placement: { angleDeg: 0, side: "top" }, pins: [] }] },
    { occurrence: "occ_b", state: "ready", connectors: [{ refdes: "J9", value: "", candidate: true, placement: { angleDeg: 180, side: "top" }, pins: [] }] },
  ],
} as unknown as SystemBundle;

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  // jsdom has no PointerEvent; without one, fireEvent drops button and coordinates.
  if (!("PointerEvent" in globalThis)) {
    class PointerEventStub extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventStub;
  }
});

/** The default view draws 6 px per millimetre from the sheet origin (no layout in jsdom). */
const px = (nm: number) => (nm / 1_000_000) * 6;

function Harness({ apply, initialTool = "select" }: { apply: (ops: SystemOp[]) => Promise<unknown>; initialTool?: Tool }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>(initialTool);
  return (
    <>
      <RootSheetCanvas document={DOCUMENT} bundle={BUNDLE} selected={selected} onSelect={setSelected} canEdit apply={apply} tool={tool} onToolChange={setTool} />
      <output data-testid="selected">{[...selected].sort().join(",")}</output>
    </>
  );
}

const symbolRect = (id: string) => document.querySelector(`[data-hit="symbol"][data-id="${id}"]`) as Element;
const port = (id: string, key: string) => document.querySelector(`[data-hit="port"][data-id="${id}"][data-key="${key}"]`) as Element;
const canvas = () => screen.getByRole("application");

describe("RootSheetCanvas", () => {
  it("moves a dragged symbol in one set-layout request, snapped to the grid", async () => {
    const apply = vi.fn<(ops: SystemOp[]) => Promise<undefined>>(async () => undefined);
    render(<Harness apply={apply} />);
    fireEvent.pointerDown(symbolRect("occ_a"), { button: 0, clientX: px(10_000_000), clientY: px(10_000_000), pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: px(20_000_000), clientY: px(10_000_000), pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: px(20_000_000), clientY: px(10_000_000), pointerId: 1 });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    const ops = apply.mock.calls[0][0] as SystemOp[];
    expect(ops).toEqual([{ kind: "set-layout", item: "occ_a", placement: { xNm: 10_160_000, yNm: 0, rotationDeg: 0, mirror: false } }]);
  });

  it("selects on click without sending anything, and removes the selection with Delete", async () => {
    const apply = vi.fn<(ops: SystemOp[]) => Promise<undefined>>(async () => undefined);
    render(<Harness apply={apply} />);
    fireEvent.pointerDown(symbolRect("occ_b"), { button: 0, clientX: px(110_000_000), clientY: px(10_000_000), pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: px(110_000_000), clientY: px(10_000_000), pointerId: 1 });
    expect(screen.getByTestId("selected").textContent).toBe("occ_b");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.keyDown(canvas(), { key: "Delete" });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith([{ kind: "remove-occurrence", id: "occ_b" }]));
  });

  it("selects only what a left-to-right window encloses, and what a right-to-left crossing touches", () => {
    render(<Harness apply={vi.fn()} />);
    const drag = (from: number, to: number) => {
      fireEvent.pointerDown(canvas(), { button: 0, clientX: px(from), clientY: px(-5_000_000), pointerId: 1 });
      fireEvent.pointerMove(canvas(), { clientX: px(to), clientY: px(60_000_000), pointerId: 1 });
      fireEvent.pointerUp(canvas(), { clientX: px(to), clientY: px(60_000_000), pointerId: 1 });
    };
    drag(-5_000_000, 120_000_000); // window: A whole, B only partly
    expect(screen.getByTestId("selected").textContent).toBe("occ_a");
    drag(120_000_000, 40_000_000); // crossing: touches both
    expect(screen.getByTestId("selected").textContent).toBe("occ_a,occ_b");
  });

  it("draws a mate from one connector to another with the Mate tool", async () => {
    const apply = vi.fn<(ops: SystemOp[]) => Promise<undefined>>(async () => undefined);
    render(<Harness apply={apply} initialTool="mate" />);
    fireEvent.pointerDown(port("occ_a", "J1"), { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerDown(port("occ_b", "J9"), { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    const [op] = apply.mock.calls[0][0] as SystemOp[];
    expect(op).toMatchObject({ kind: "add-mate", mate: { a: { occurrence: "occ_a", connector: "J1" }, b: { occurrence: "occ_b", connector: "J9" } } });
  });

  it("pans with a right drag, as KiCad does, without sending anything or opening the menu", () => {
    const apply = vi.fn<(ops: SystemOp[]) => Promise<undefined>>(async () => undefined);
    render(<Harness apply={apply} />);
    const sheet = () => document.querySelector('[data-testid="root-sheet"] > g')?.getAttribute("transform");
    const before = sheet();
    fireEvent.pointerDown(symbolRect("occ_a"), { button: 2, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 160, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { button: 2, clientX: 160, clientY: 130, pointerId: 1 });
    expect(sheet()).not.toBe(before);
    expect(sheet()).toContain("translate(10 5)");
    expect(screen.getByTestId("selected").textContent).toBe("");
    expect(apply).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(canvas())).toBe(false);
  });

  it("slides a pin along its edge", async () => {
    const apply = vi.fn<(ops: SystemOp[]) => Promise<undefined>>(async () => undefined);
    render(<Harness apply={apply} />);
    // J1 sits on A's right edge (x = 50.8 mm); drag it down to 40 mm.
    fireEvent.pointerDown(port("occ_a", "J1"), { button: 0, clientX: px(50_800_000), clientY: px(25_400_000), pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: px(52_000_000), clientY: px(40_000_000), pointerId: 1 });
    fireEvent.pointerUp(canvas(), { clientX: px(52_000_000), clientY: px(40_000_000), pointerId: 1 });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    const [op] = apply.mock.calls[0][0] as SystemOp[];
    expect(op).toMatchObject({ kind: "set-layout", item: "occ_a", placement: { ports: { J1: { edge: "right", offsetNm: 40_640_000 } } } });
  });

  it("draws the documents' title block with the system, sheet and bundle key", () => {
    render(
      <RootSheetCanvas
        document={DOCUMENT}
        bundle={BUNDLE}
        selected={new Set()}
        onSelect={vi.fn()}
        canEdit
        apply={vi.fn()}
        tool="select"
        onToolChange={vi.fn()}
        systemName="Openswitch"
        version={48}
        bundleKey="eec36c7adf3a24ae9f123"
      />,
    );
    expect(screen.getByText("Openswitch · System schematic")).toBeTruthy();
    expect(screen.getByText("Openswitch v48")).toBeTruthy();
    expect(screen.getByText("Root")).toBeTruthy();
    expect(screen.getByText("eec36c7adf3a24ae")).toBeTruthy();
  });
});
