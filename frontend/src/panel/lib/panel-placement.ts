import { KiCadRpcError, type KiCadRpcFailureKind } from "@/panel/lib/kicad-bridge";

export type PlacementFailureKind = KiCadRpcFailureKind;

export function classifyPlacementError(error: unknown): PlacementFailureKind {
  if (error instanceof KiCadRpcError) {
    return error.kind;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.startsWith("Network error:")
    || message.startsWith("Request failed")
    || message === "Cannot place: no session or component."
  ) {
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
