/** Keep the viewer's local time while making the comment date unambiguous. */
export function formatCommentTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}, ${date.toLocaleTimeString()}`;
}
