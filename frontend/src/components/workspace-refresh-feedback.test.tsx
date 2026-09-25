import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  fetchApi: vi.fn(),
  readApiError: vi.fn(async (_response: Response, fallback: string) => fallback),
}));

vi.mock("@/lib/api", () => api);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

import { clearWorkspaceDataCache } from "@/hooks/use-workspace-data";
import type { User } from "@/types/auth";

import { Workspace } from "./workspace";

const designer: User = { email: "d@example.com", name: "D", role: "designer" } as User;

function bootstrap(tag: string) {
  return {
    projects: [{ id: `project-${tag}`, name: `Board ${tag}`, display_name: `Board ${tag}`, folder_id: null }],
    folders: [],
  };
}

function view() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Workspace searchQuery="" user={designer} />
    </MemoryRouter>
  );
}

describe("workspace refresh feedback", () => {
  beforeEach(() => {
    clearWorkspaceDataCache();
    api.fetchJson.mockReset();
    api.fetchApi.mockReset();
    api.fetchApi.mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });

  it("keeps the loaded projects, says the refresh failed, and clears the notice on a successful retry", async () => {
    api.fetchJson
      .mockResolvedValueOnce(bootstrap("one"))
      .mockRejectedValueOnce(new Error("Backend unreachable"))
      .mockResolvedValueOnce(bootstrap("two"));
    view();
    await waitFor(() => expect(screen.getByText("Board one")).toBeInTheDocument());
    expect(screen.queryByRole("status")).toBeNull();

    // A background refresh fails: the data stays, the failure is visible.
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Backend unreachable"));
    expect(screen.getByText("Board one")).toBeInTheDocument();
    expect(screen.queryByText(/failed to load workspace/i)).toBeNull();

    // Retry from the notice; success replaces the data and removes the notice.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("Board two")).toBeInTheDocument();
    expect(api.fetchJson).toHaveBeenCalledTimes(3);
  });

  it("still shows a hard error when the first load fails and there is nothing to fall back on", async () => {
    api.fetchJson.mockRejectedValueOnce(new Error("Backend unreachable"));
    view();
    await waitFor(() => expect(screen.getByText("Backend unreachable")).toBeInTheDocument());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
