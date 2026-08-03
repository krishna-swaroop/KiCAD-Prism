import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/types/project";
import { WorkspaceProjectPropertiesSheet } from "./workspace-project-properties-sheet";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "prj_1",
    name: "board",
    description: "",
    path: "/projects/board",
    last_modified: "2026-07-26T00:00:00Z",
    thumbnail_url: "/api/projects/prj_1/thumbnail",
    thumbnail_source: "generated",
    ...overrides,
  };
}

function renderSheet(project: Project, props: Record<string, unknown> = {}) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ project, repository: {}, files: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  return render(
    <WorkspaceProjectPropertiesSheet
      open
      project={project}
      folderById={new Map()}
      onOpenChange={() => {}}
      onOpenProject={() => {}}
      canManageProjects
      {...props}
    />,
  );
}

describe("WorkspaceProjectPropertiesSheet thumbnail controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says a thumbnail was rendered from the PCB", async () => {
    renderSheet(makeProject());
    expect(await screen.findByText("Rendered from the PCB")).toBeInTheDocument();
  });

  it("offers a re-render, not a revert, when the thumbnail is the render", async () => {
    renderSheet(makeProject());
    expect(await screen.findByRole("button", { name: /re-render/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use rendered board/i })).toBeNull();
  });

  it("offers a revert, not a re-render, when someone uploaded an image", async () => {
    // Re-rendering while an upload is showing would change nothing visible, so
    // the useful action at that point is going back to the render.
    renderSheet(makeProject({ thumbnail_source: "custom" }));
    expect(await screen.findByRole("button", { name: /use rendered board/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-render/i })).toBeNull();
  });

  it("names the repository as the source when nothing has been rendered", async () => {
    renderSheet(makeProject({ thumbnail_source: "repository" }));
    expect(await screen.findByText("Committed in the repository")).toBeInTheDocument();
  });

  it("does not claim a source for a project with no thumbnail", async () => {
    renderSheet(makeProject({ thumbnail_url: undefined }));
    expect(await screen.findByText("No thumbnail yet")).toBeInTheDocument();
  });

  it("hides every thumbnail action from someone who cannot manage projects", async () => {
    renderSheet(makeProject(), { canManageProjects: false });
    expect(await screen.findByText("Rendered from the PCB")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-render/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /upload image/i })).toBeNull();
  });

  it("passes the chosen file up to be uploaded", async () => {
    const onUploadThumbnail = vi.fn().mockResolvedValue(undefined);
    const view = renderSheet(makeProject(), { onUploadThumbnail });
    await screen.findByRole("button", { name: /upload image/i });

    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    const file = new File(["png-bytes"], "board.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUploadThumbnail).toHaveBeenCalledTimes(1));
    expect(onUploadThumbnail.mock.calls[0][1]).toBe(file);
  });

  it("blocks a second action while one is still running", async () => {
    // A render takes far longer than the click that starts it.
    let release: (() => void) | undefined;
    const onRegenerateThumbnail = vi.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    renderSheet(makeProject(), { onRegenerateThumbnail });

    const button = await screen.findByRole("button", { name: /re-render/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    release?.();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(onRegenerateThumbnail).toHaveBeenCalledTimes(1);
  });
});
