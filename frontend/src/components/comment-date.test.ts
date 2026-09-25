import { describe, expect, it } from "vitest";
import { formatCommentTimestamp } from "./comment-date";

describe("formatCommentTimestamp", () => {
    it("shows year/month/day before the local time", () => {
        const timestamp = new Date(2026, 8, 23, 18, 18, 1).toISOString();
        expect(formatCommentTimestamp(timestamp)).toMatch(/^2026\/09\/23, /);
    });
});
