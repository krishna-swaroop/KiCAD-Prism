export type PartsLayout = "compact" | "detailed";

/** The layout from the address; compact unless it asks for the detailed one. */
export function layoutFromParam(value: string | null): PartsLayout {
  return value === "detailed" ? "detailed" : "compact";
}

/** The quantities each vendor's price is shown at. */
export const PRICE_QUANTITIES = [1, 10, 100, 1000, 10000] as const;

/** The unit price at a quantity: the break with the largest quantity not above it. None where the smallest order is above it. */
export function priceAt(breaks: ReadonlyArray<readonly [number, string]>, quantity: number): string | null {
  let found: string | null = null;
  let from = -1;
  for (const [start, price] of breaks) {
    if (start <= quantity && start > from) {
      found = price;
      from = start;
    }
  }
  return found;
}
