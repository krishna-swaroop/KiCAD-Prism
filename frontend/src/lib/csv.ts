/** RFC 4180 quoting. Always quoted: net names and file paths carry commas. */
export function csvCell(value: unknown): string {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Hand a generated CSV to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
    const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
