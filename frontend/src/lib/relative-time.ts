const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short "how long ago" for list rows: "just now", "5m ago", "3h ago", "2d ago",
 * then the plain date once it is older than 30 days. A future or unreadable time
 * falls back to the date, so a clock skew never prints "-3m ago".
 */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "—";
    const age = now - then;
    if (age < 0) return new Date(then).toLocaleDateString();
    if (age < MINUTE) return "just now";
    if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`;
    if (age < DAY) return `${Math.floor(age / HOUR)}h ago`;
    if (age < 30 * DAY) return `${Math.floor(age / DAY)}d ago`;
    return new Date(then).toLocaleDateString();
}
