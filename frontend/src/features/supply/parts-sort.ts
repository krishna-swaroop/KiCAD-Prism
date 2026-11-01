/** What a parts list is sorted by: nothing (worst first), "runout", or a column and a direction as "<column>:<asc|desc>". */
export type PartsSort = string;

export type SortColumn = "part" | "stock" | "price";
/** The columns only a project's list has: pieces a board uses, pieces the build needs, and what the line costs. */
export type ProjectColumn = "per_board" | "need" | "cost";
export type Direction = "asc" | "desc";

const COLUMNS: readonly SortColumn[] = ["part", "stock", "price"];
const PROJECT_COLUMNS: readonly string[] = [...COLUMNS, "per_board", "need", "cost"];

/** The sort an address asks for, or none when it is not one Prism knows. */
export function sortFromParam(value: string | null): PartsSort {
  if (value === "runout") return "runout";
  const [column, direction] = (value ?? "").split(":");
  return COLUMNS.some((item) => item === column) && (direction === "asc" || direction === "desc") ? `${column}:${direction}` : "";
}

/** The column and direction a sort is on, or null when it is on none (the list's own order or "runout"). */
export function columnOf(sort: PartsSort): { column: SortColumn | ProjectColumn; direction: Direction } | null {
  const [column, direction] = sort.split(":");
  return PROJECT_COLUMNS.includes(column) && (direction === "asc" || direction === "desc") ? { column: column as SortColumn | ProjectColumn, direction } : null;
}

/** The sort after a click on a column: the first click puts the most first (the part number, A first), the next reverses it, the third lets go. */
export function clickColumn(sort: PartsSort, column: SortColumn | ProjectColumn): PartsSort {
  const now = columnOf(sort);
  const first: Direction = column === "part" ? "asc" : "desc";
  if (now?.column !== column) return `${column}:${first}`;
  return now.direction === first ? `${column}:${first === "asc" ? "desc" : "asc"}` : "";
}
