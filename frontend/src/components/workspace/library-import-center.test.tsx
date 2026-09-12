import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/types/project";
import type { ProjectComponentImportProposal, ProjectComponentImportSession } from "@/types/catalog";
import { fetchJson } from "@/lib/api";
import { LibraryImportCenter } from "./library-import-center";

vi.mock("@/lib/api", () => ({
  fetchApi: vi.fn(),
  fetchJson: vi.fn(),
  readApiError: vi.fn(),
}));

const project: Project = {
  id: "project-1",
  name: "thunderscope",
  display_name: "Thunderscope Rev 5.3",
  description: "",
  path: "/projects/thunderscope",
  last_modified: "2026-08-27T00:00:00Z",
};

describe("LibraryImportCenter sources", () => {
  beforeEach(() => {
    vi.mocked(fetchJson).mockImplementation(async <T,>(input: RequestInfo | URL) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (path === "/api/catalog/import-sessions") return { items: [] } as T;
      if (path === "/api/catalog/import-sources/folder-roots") {
        return { items: [{ name: "cern", path_hint: "/libraries/cern" }] } as T;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it("separates library and project imports and uses source-oriented project labels", async () => {
    render(
      <LibraryImportCenter
        projects={[project]}
        user={{ name: "Admin", email: "admin@example.com", role: "admin" }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "KiCad libraries" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project components" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose local folder" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Import server folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import From Project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import From All Projects" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Import Center" })).not.toBeInTheDocument();
    expect(screen.getByTestId("import-source-groups")).toHaveClass("grid-cols-1", "gap-2");
    expect(screen.getByTestId("import-source-groups")).not.toHaveClass("import-source-groups--split");
    expect(screen.getByRole("heading", { name: "KiCad libraries" }).closest("section")).toHaveClass("p-2");
    expect(screen.getByRole("heading", { name: "Project components" }).closest("section")).toHaveClass("p-2");
  });

  it("allocates more space to project imports when the cards share a row", async () => {
    vi.mocked(fetchJson).mockImplementation(async <T,>(input: RequestInfo | URL) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (path === "/api/catalog/import-sessions") return { items: [] } as T;
      if (path === "/api/catalog/import-sources/folder-roots") return { items: [] } as T;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <LibraryImportCenter
        projects={[project]}
        user={{ name: "Admin", email: "admin@example.com", role: "admin" }}
      />,
    );

    expect(await screen.findByTestId("import-source-groups")).toHaveClass(
      "grid-cols-1",
      "import-source-groups--split",
    );
  });
});

function importSession(id: string, status: ProjectComponentImportSession["status"] = "staged"): ProjectComponentImportSession {
  return {
    id,
    scope: "folder",
    project_id: "",
    project_ids: [],
    project_revisions: {},
    source_revision: "",
    status,
    created_by: "admin@example.com",
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    error_message: "",
    proposal_count: 1,
    selection: { display_name: id },
  };
}

function importProposal(sessionId: string, reference: string): ProjectComponentImportProposal {
  return {
    id: `${sessionId}-${reference}`,
    session_id: sessionId,
    dedupe_key: reference,
    component_uid: reference,
    reference,
    status: "candidate",
    accepted_component_id: "",
    metadata: { references: [reference], value: "10k" },
    assets: [],
    provenance: [],
    findings: [],
  };
}

describe("LibraryImportCenter session proposals", () => {
  beforeEach(() => {
    vi.mocked(fetchJson).mockReset();
  });

  it("does not show session A proposals after switching to session B", async () => {
    let finishA: ((value: { items: ProjectComponentImportProposal[] }) => void) | undefined;
    vi.mocked(fetchJson).mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/catalog/import-sessions") {
        return { items: [importSession("session-a"), importSession("session-b")] };
      }
      if (path === "/api/catalog/import-sources/folder-roots") return { items: [] };
      if (path.endsWith("/session-a/proposals")) {
        return new Promise((resolve) => {
          finishA = resolve;
        });
      }
      if (path.endsWith("/session-b/proposals")) {
        return { items: [importProposal("session-b", "R-B")] };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <LibraryImportCenter
        projects={[project]}
        user={{ name: "Admin", email: "admin@example.com", role: "admin" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /session-b/i }));
    expect(await screen.findByText("R-B")).toBeInTheDocument();

    await act(async () => {
      finishA!({ items: [importProposal("session-a", "R-A")] });
    });
    await waitFor(() => expect(screen.queryByText("R-A")).not.toBeInTheDocument());
    expect(screen.getByText("R-B")).toBeInTheDocument();
  });
});
