import type { ForecastChance } from "@/types/supply";

const WORDS: ReadonlyArray<readonly [number, string]> = [
  [0.9, "Almost certain"],
  [0.7, "Likely"],
  [0.4, "Uncertain"],
  [0.1, "Unlikely"],
];

/** The one scale of words for a chance, the same as the server's (`forecast.store.chance_word`). */
export function forecastWord(probability: number): ForecastChance {
  const word = WORDS.find(([floor]) => probability >= floor)?.[1] ?? "Very unlikely";
  return { probability, percent: Math.round(probability * 100), word };
}
