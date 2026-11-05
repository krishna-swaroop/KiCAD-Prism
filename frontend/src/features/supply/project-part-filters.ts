/** What a "needs a look" chip counts and filters a project's parts by; the server works out which parts each takes. */
export type Chip = "unchecked" | "out" | "short" | "limiting" | "end_of_life" | "alerts" | "not_priced";

export const CHIPS: ReadonlyArray<{ key: Chip; label: string }> = [
  { key: "unchecked", label: "Unchecked" },
  { key: "out", label: "Out of stock" },
  { key: "short", label: "Short for this build" },
  { key: "limiting", label: "Limiting the build" },
  { key: "not_priced", label: "Not priced" },
  { key: "end_of_life", label: "End of life" },
  { key: "alerts", label: "Open alerts" },
];
