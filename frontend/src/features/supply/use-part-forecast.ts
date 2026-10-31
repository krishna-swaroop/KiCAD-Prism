import { useCallback } from "react";

import type { PartForecast } from "@/types/supply";
import { getPartForecast } from "./supply-api";
import { useLoaded } from "./use-loaded";

/** A part's forecast at a quantity (the part's own by default). Asking at another quantity saves nothing. */
export function usePartForecast(partId: string, quantity: number | null, base: number | undefined) {
  const fetcher = useCallback((signal: AbortSignal) => getPartForecast(partId, quantity, signal), [partId, quantity]);
  // The part's own price quantity is part of the key: changing it on the sheet asks again.
  return useLoaded<PartForecast>(`parts/${partId}/forecast/${quantity ?? "own"}|${base ?? ""}`, fetcher, "Could not load the forecast");
}
