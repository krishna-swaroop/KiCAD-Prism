import { describe, expect, it } from "vitest";

import { KiCadRpcError } from "./kicad-bridge";
import { classifyPlacementError, formatPlacementError } from "./panel-placement";

describe("placement error classification", () => {
  it("treats missing session and unused transport as pre-dispatch", () => {
    expect(classifyPlacementError(new KiCadRpcError("pre_dispatch", "KiCad transport is unavailable.")))
      .toBe("pre_dispatch");
    expect(formatPlacementError(new Error("Network error: 502"))).toMatch(/^Placement did not start:/);
  });

  it("does not treat a dropped acknowledgement as a safe retry", () => {
    const error = new KiCadRpcError("unknown_outcome", "Response timeout");
    expect(classifyPlacementError(error)).toBe("unknown_outcome");
    expect(formatPlacementError(error)).toContain("Check the schematic before placing again");
  });

  it("keeps an explicit KiCad rejection distinct from an unknown outcome", () => {
    const error = new KiCadRpcError("rpc", "invalid footprint");
    expect(classifyPlacementError(error)).toBe("rpc");
    expect(formatPlacementError(error)).toBe("Placement failed: invalid footprint");
  });
});
