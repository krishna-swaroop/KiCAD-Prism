import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Scene } from "./scene";
import { SheetSvg } from "./sheet-svg";

const SCENE: Scene = {
  symbols: [],
  connections: [
    {
      id: "mate_a",
      kind: "mate",
      a: { item: "occ_a", key: "J1" },
      b: { item: "occ_b", key: "J2" },
      points: [{ x: 0, y: 0 }, { x: 50_800_000, y: 0 }],
      stored: false,
      dangling: false,
      label: "J1 ↔ J2",
      pins: 120,
    },
  ],
  bounds: { x: 0, y: 0, w: 50_800_000, h: 0 },
};

describe("SheetSvg", () => {
  it("tags a board-to-board mate with its pin count", () => {
    render(
      <svg>
        <SheetSvg scene={SCENE} selected={new Set()} />
      </svg>,
    );
    expect(screen.getByText("120 pins")).toBeTruthy();
  });
});
