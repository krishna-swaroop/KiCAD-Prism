export function formatDate(value: string | null): string {
    if (!value) return "never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString();
}
