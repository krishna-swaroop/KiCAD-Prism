import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectComponentImportProposal } from "@/types/catalog";
import { LibraryImportRemediationGrid } from "./library-import-remediation-grid";

const proposal: ProjectComponentImportProposal = {
  id: "proposal-1",
  session_id: "session-1",
  dedupe_key: "key-1",
  component_uid: "uid-1",
  reference: "C1",
  status: "candidate",
  accepted_component_id: "",
  metadata: {
    value: "10uF_50V_1210",
    manufacturer: "Samsung Electro-Mechanics",
    manufacturer_part_number: "CL32B106KBJNNNE",
    description: "Unpolarized capacitor",
    datasheet: "https://example.com/datasheet.pdf",
    footprint: "Capacitor_SMD:C_1210_3225Metric",
  },
  assets: [
    {
      asset_type: "symbol",
      filename: "C.kicad_sym",
      sha256: "a".repeat(64),
      size_bytes: 128,
      target_library: "Prism_Imported",
      target_name: "C",
      source_path: "project/C.kicad_sym",
    },
    {
      asset_type: "footprint",
      filename: "C_1210.kicad_mod",
      sha256: "b".repeat(64),
      size_bytes: 256,
      target_library: "Prism_Imported",
      target_name: "C_1210",
      source_path: "project/C_1210.kicad_mod",
    },
  ],
  provenance: [],
  findings: [],
};

describe("LibraryImportRemediationGrid layout", () => {
  it("keeps controls and column headings outside the scrolling rows", () => {
    render(
      <LibraryImportRemediationGrid
        sessionId="session-1"
        proposals={[proposal]}
        canWrite
        onShowDetailView={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("import-remediation-grid")).toHaveClass("h-full", "min-h-0", "flex-col");
    expect(screen.getByTestId("import-remediation-controls")).toHaveClass("shrink-0");
    expect(screen.getByTestId("import-remediation-scroll-region")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-auto",
    );
    expect(screen.getByTestId("import-remediation-column-headings")).toHaveClass(
      "sticky",
      "top-0",
      "bg-muted",
    );
    expect(screen.queryByText(/Each row is one catalog component/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing one row per placed reference/)).not.toBeInTheDocument();
  });
});
