/** RFC 4180 quoting. Always quoted: net names and file paths carry commas. */
export function csvCell(value: unknown): string {
    let text = String(value ?? "");
    // Spreadsheet formula injection: Excel/Sheets still treat a leading
    // equals (and siblings) as a formula even inside quoted CSV fields.
    if (/^[=+\-@\t]/.test(text)) {
        text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
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
