import { describe, expect, it } from "vitest";

import type { SupplyReviewQueue } from "@/types/supply";
import { reviewCountOf } from "./review-count";

describe("reviewCountOf", () => {
  it("counts every item the Review page lists to decide, pinned parts by the part, and the matched counter, but not the several-listings section", () => {
    const queue = {
      aliases: [], listings: [], manufacturers: [],
      counts: { aliases: 2, unresolved: 3, near: 1 },
      choices: [{}, {}],
      to_approve: { waivers: [{}], alternates: [{}, {}], dismissals: [{}] },
      other_numbers: [{ listings: [{}, {}] }, { listings: [{}] }],
      matched: { aliases: [{}], parts: [{}, {}] },
    } as unknown as SupplyReviewQueue;
    expect(reviewCountOf(queue)).toBe(2 + 3 + 1 + 2 + 4 + 2 + 3);
  });
});
