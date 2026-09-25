import { describe, expect, it } from "vitest";

import { historyFileOpenAction, visualizerTabForFile } from "./history-file-open";

describe("historyFileOpenAction", () => {
  it("opens KiCad design files in the visualizer", () => {
    expect(historyFileOpenAction("board.kicad_pcb")).toBe("visualizer");
    expect(historyFileOpenAction("sheet.kicad_sch")).toBe("visualizer");
    expect(historyFileOpenAction("board.kicad_pro")).toBe("visualizer");
    expect(historyFileOpenAction("Device.kicad_sym")).toBe("visualizer");
    expect(historyFileOpenAction("R_0805.kicad_mod")).toBe("visualizer");
  });

  it("opens PDF, CSV, text, and markdown in a new browser tab", () => {
    expect(historyFileOpenAction("notes.pdf")).toBe("browser");
    expect(historyFileOpenAction("bom.csv")).toBe("browser");
    expect(historyFileOpenAction("README.txt")).toBe("browser");
    expect(historyFileOpenAction("NOTES.md")).toBe("browser");
    expect(historyFileOpenAction("guide.markdown")).toBe("browser");
  });

  it("does nothing for gerbers, images, and other non-CAD files", () => {
    expect(historyFileOpenAction("board.gbr")).toBe("none");
    expect(historyFileOpenAction("board.gtl")).toBe("none");
    expect(historyFileOpenAction("preview.png")).toBe("none");
    expect(historyFileOpenAction("photo.jpg")).toBe("none");
    expect(historyFileOpenAction("data.json")).toBe("none");
  });
});

describe("visualizerTabForFile", () => {
  it("routes boards and schematics to their visualizer tabs", () => {
    expect(visualizerTabForFile("board.kicad_pcb")).toBe("pcb");
    expect(visualizerTabForFile("root.kicad_sch")).toBe("sch");
    expect(visualizerTabForFile("board.kicad_pro")).toBeUndefined();
  });
});
