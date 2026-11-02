import type { SupplyReadNow } from "./supply-api";

/** What a read-now did, in a sentence. */
export function readNowSummary(result: SupplyReadNow): string {
  if (result.connectors === 0) return "No distributor lists this part yet, so there is nothing to read.";
  const readText = result.read === 1 ? "Read 1 listing." : `Read ${result.read} listings.`;
  return [readText, ...result.problems.map((problem) => problem.reason)].join(" ");
}
