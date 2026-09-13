import { KiCadRpcError, type KiCadRpcFailureKind } from "@/panel/lib/kicad-bridge";
import { PanelApiError } from "@/panel/lib/panel-api";

export type PlacementFailureKind = KiCadRpcFailureKind;

/** KiCad may decompress and register an inline bundle before acknowledging. */
export const PLACEMENT_RESPONSE_TIMEOUT_MS = 30_000;

export function classifyPlacementError(error: unknown): PlacementFailureKind {
  if (error instanceof KiCadRpcError) {
    return error.kind;
  }
  if (error instanceof PanelApiError) {
    return "pre_dispatch";
  }
  return "rpc";
}

export function formatPlacementError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  switch (classifyPlacementError(error)) {
    case "pre_dispatch":
      return `Placement did not start: ${message}`;
    case "unknown_outcome":
      return `KiCad did not acknowledge placement. Check the schematic before placing again. (${message})`;
    default:
      return `Placement failed: ${message}`;
  }
}
