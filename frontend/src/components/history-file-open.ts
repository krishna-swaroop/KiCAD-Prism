/** How a History file row should respond to a click. */

const CAD_FILE = /\.(kicad_pcb|kicad_sch|kicad_pro|kicad_sym|kicad_mod)$/i;
const BROWSER_FILE = /\.(pdf|csv|txt|md|markdown)$/i;

export type HistoryFileOpenAction = "visualizer" | "browser" | "none";

export function historyFileOpenAction(filename: string): HistoryFileOpenAction {
  const name = filename.split(/[/\\]/).pop() || filename;
  if (CAD_FILE.test(name)) return "visualizer";
  if (BROWSER_FILE.test(name)) return "browser";
  return "none";
}

export function visualizerTabForFile(filename: string): "pcb" | "sch" | undefined {
  const name = filename.split(/[/\\]/).pop() || filename;
  if (name.endsWith(".kicad_pcb")) return "pcb";
  if (name.endsWith(".kicad_sch")) return "sch";
  return undefined;
}
