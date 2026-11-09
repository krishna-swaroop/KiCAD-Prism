import type { WatchPackaging } from "@/types/supply";

/** The choices for which packaging a watch counts, with the words shown for each. */
export const PACKAGINGS: ReadonlyArray<{ value: WatchPackaging; label: string }> = [
  { value: "any", label: "All packaging" },
  { value: "cut_tape", label: "Cut tape only (prototypes)" },
  { value: "custom_reel", label: "Custom reel only (Digi-Reel, MouseReel)" },
  { value: "tape_reel", label: "Full reel only (production)" },
  { value: "tray", label: "Tray only" },
  { value: "tube", label: "Tube only" },
  { value: "bulk", label: "Bulk only" },
];
