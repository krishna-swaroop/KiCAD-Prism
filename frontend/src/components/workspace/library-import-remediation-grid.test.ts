import { describe, expect, it } from "vitest";

import {
  groupProblems,
  groupProposals,
  rowProblems,
  type RowEdits,
} from "./library-import-remediation-grid";
import type { ProjectComponentImportProposal } from "@/types/catalog";

function proposal(
  overrides: Partial<ProjectComponentImportProposal> = {}
): ProjectComponentImportProposal {
  return {
    id: "proposal-1",
    session_id: "session-1",
    dedupe_key: "key-1",
    component_uid: "uid-1",
    reference: "C149",
    status: "candidate",
    accepted_component_id: "",
    metadata: {
      value: "22uF_25V_1210",
      manufacturer: "TDK Corporation",
      manufacturer_part_number: "CGA6P3X7R1E226M250AE",
      description: "Unpolarized capacitor, small symbol",
      datasheet: "https://product.tdk.com/en/system/datasheet.pdf",
      footprint: "Pixxel_Capacitors:CAP1210",
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
    ],
    provenance: [],
    findings: [],
    ...overrides,
  };
}

const NO_EDITS: RowEdits = {};

describe("rowProblems", () => {
  it("reports a complete row with a linked footprint as ready", () => {
    const row = proposal();
    const edits: RowEdits = { "proposal-1": { metadata: {}, footprintAssetId: "asset-9" } };
    expect(rowProblems(row, edits)).toEqual([]);
  });

  it("clears a footprint_not_resolved finding once a footprint is linked", () => {
    // The reported bug: every field filled and a footprint linked, yet the row stayed
    // flagged because the scan-time error finding was treated as permanent.
    const row = proposal({
      findings: [
        {
          code: "footprint_not_resolved",
          severity: "error",
          message: "Embedded footprint for C149 was not found.",
        },
      ],
    });

    expect(rowProblems(row, NO_EDITS).length).toBeGreaterThan(0);

    const linked: RowEdits = { "proposal-1": { metadata: {}, footprintAssetId: "asset-9" } };
    expect(rowProblems(row, linked)).toEqual([]);
  });

  it("keeps blocking on an unresolved symbol even when a footprint is linked", () => {
    const row = proposal({
      assets: [],
      findings: [
        {
          code: "symbol_not_resolved",
          severity: "error",
          message: "Embedded symbol for C149 was not found.",
        },
      ],
    });
    const linked: RowEdits = { "proposal-1": { metadata: {}, footprintAssetId: "asset-9" } };
    const problems = rowProblems(row, linked);
    expect(problems).toContain("No symbol was extracted");
    expect(problems).toContain("Embedded symbol for C149 was not found.");
  });

  it("treats a saved draft link the same as a local edit", () => {
    const row = proposal({
      findings: [
        {
          code: "footprint_not_resolved",
          severity: "error",
          message: "Embedded footprint for C149 was not found.",
        },
      ],
      draft: { asset_links: { footprint: "asset-9" } },
    });
    expect(rowProblems(row, NO_EDITS)).toEqual([]);
  });

  it("still requires the mandatory metadata fields", () => {
    const row = proposal({ metadata: { ...proposal().metadata, manufacturer: "" } });
    const linked: RowEdits = { "proposal-1": { metadata: {}, footprintAssetId: "asset-9" } };
    expect(rowProblems(row, linked)).toContain("Manufacturer is required");
  });

  it("rejects a datasheet that is not an HTTP(S) URL", () => {
    const row = proposal({ metadata: { ...proposal().metadata, datasheet: "see intranet" } });
    const linked: RowEdits = { "proposal-1": { metadata: {}, footprintAssetId: "asset-9" } };
    expect(rowProblems(row, linked)).toContain("Datasheet must be an HTTP(S) URL");
  });
});

describe("groupProposals", () => {
  const capacitor = (id: string, reference: string, mpn: string) =>
    proposal({
      id,
      reference,
      metadata: { ...proposal().metadata, manufacturer_part_number: mpn },
    });

  it("collapses references that share a manufacturer and MPN into one row", () => {
    const rows = [
      capacitor("p1", "C149", "CGA6P3X7R1E226M250AE"),
      capacitor("p2", "C150", "CGA6P3X7R1E226M250AE"),
      capacitor("p3", "R7", "RC0603FR-0710KL"),
    ];
    const groups = groupProposals(rows, {}, true);

    expect(groups).toHaveLength(2);
    const shared = groups.find((group) => group.members.length === 2);
    expect(shared?.references).toEqual(["C149", "C150"]);
    expect(shared?.representative.id).toBe("p1");
  });

  it("matches MPN case-insensitively and ignores surrounding whitespace", () => {
    const rows = [
      capacitor("p1", "C149", "CGA6P3X7R1E226M250AE"),
      capacitor("p2", "C150", "  cga6p3x7r1e226m250ae  "),
    ];
    expect(groupProposals(rows, {}, true)).toHaveLength(1);
  });

  it("groups on the edited MPN, so remediation merges rows the scan could not", () => {
    // Scan-time dedupe only groups by MPN when the symbol already carried one.
    const rows = [
      proposal({ id: "p1", reference: "C149", metadata: { ...proposal().metadata, manufacturer_part_number: "" } }),
      proposal({ id: "p2", reference: "C150", metadata: { ...proposal().metadata, manufacturer_part_number: "" } }),
    ];
    expect(groupProposals(rows, {}, true)).toHaveLength(2);

    const edits: RowEdits = {
      p1: { metadata: { manufacturer_part_number: "CGA6P3X7R1E226M250AE" } },
      p2: { metadata: { manufacturer_part_number: "CGA6P3X7R1E226M250AE" } },
    };
    const merged = groupProposals(rows, edits, true);
    expect(merged).toHaveLength(1);
    expect(merged[0].references).toEqual(["C149", "C150"]);
  });

  it("keeps rows apart when the MPN matches but the manufacturer does not", () => {
    const rows = [
      capacitor("p1", "C149", "SHARED-MPN"),
      proposal({
        id: "p2",
        reference: "C150",
        metadata: {
          ...proposal().metadata,
          manufacturer: "Murata",
          manufacturer_part_number: "SHARED-MPN",
        },
      }),
    ];
    expect(groupProposals(rows, {}, true)).toHaveLength(2);
  });

  it("never merges rows that still lack an MPN", () => {
    const rows = [
      proposal({ id: "p1", reference: "C149", metadata: { ...proposal().metadata, manufacturer_part_number: "" } }),
      proposal({ id: "p2", reference: "C150", metadata: { ...proposal().metadata, manufacturer_part_number: "" } }),
    ];
    expect(groupProposals(rows, {}, true)).toHaveLength(2);
  });

  it("returns one row per proposal when grouping is off", () => {
    const rows = [
      capacitor("p1", "C149", "CGA6P3X7R1E226M250AE"),
      capacitor("p2", "C150", "CGA6P3X7R1E226M250AE"),
    ];
    expect(groupProposals(rows, {}, false)).toHaveLength(2);
  });

  it("expands references already merged at scan time", () => {
    const rows = [
      proposal({
        id: "p1",
        reference: "C149",
        metadata: { ...proposal().metadata, references: ["C149", "C150", "C151"] },
      }),
    ];
    expect(groupProposals(rows, {}, true)[0].references).toEqual(["C149", "C150", "C151"]);
  });
});

describe("groupProblems", () => {
  it("blocks the whole group when any member is incomplete", () => {
    // Every member gets imported, so one member's missing symbol blocks the row.
    const healthy = proposal({ id: "p1", reference: "C149" });
    const broken = proposal({ id: "p2", reference: "C150", assets: [] });
    const [group] = groupProposals([healthy, broken], {}, true);

    expect(group.members).toHaveLength(2);
    const linked: RowEdits = {
      p1: { metadata: {}, footprintAssetId: "asset-9" },
      p2: { metadata: {}, footprintAssetId: "asset-9" },
    };
    expect(groupProblems(group, linked)).toContain("No symbol was extracted");
  });

  it("reports each distinct problem once across members", () => {
    const first = proposal({ id: "p1", reference: "C149", assets: [] });
    const second = proposal({ id: "p2", reference: "C150", assets: [] });
    const [group] = groupProposals([first, second], {}, true);
    const linked: RowEdits = {
      p1: { metadata: {}, footprintAssetId: "asset-9" },
      p2: { metadata: {}, footprintAssetId: "asset-9" },
    };
    const problems = groupProblems(group, linked);
    expect(problems.filter((problem) => problem === "No symbol was extracted")).toHaveLength(1);
  });
});
