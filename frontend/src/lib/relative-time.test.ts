import { describe, expect, it } from "vitest";

import { formatRelative } from "./relative-time";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatRelative", () => {
    it("steps through seconds, minutes, hours and days", () => {
        expect(formatRelative(ago(20_000), NOW)).toBe("just now");
        expect(formatRelative(ago(5 * 60_000), NOW)).toBe("5m ago");
        expect(formatRelative(ago(3 * 3_600_000), NOW)).toBe("3h ago");
        expect(formatRelative(ago(2 * 86_400_000), NOW)).toBe("2d ago");
    });

    it("falls back to the date after 30 days, for the future, and for junk", () => {
        const old = ago(40 * 86_400_000);
        expect(formatRelative(old, NOW)).toBe(new Date(old).toLocaleDateString());
        const future = new Date(NOW + 3_600_000).toISOString();
        expect(formatRelative(future, NOW)).toBe(new Date(future).toLocaleDateString());
        expect(formatRelative("nope", NOW)).toBe("—");
        expect(formatRelative(null, NOW)).toBe("—");
    });
});
