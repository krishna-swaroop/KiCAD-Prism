import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";

vi.mock("./library-catalog-workspace", () => ({ LibraryCatalogWorkspace: () => <div>Catalog content</div> }));

import { LibraryManagerWorkspace } from "./library-manager-workspace";

afterEach(cleanup);

function Location() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(url: string) {
  const user: User = { name: "U", email: "u@example.com", role: "admin" };
  render(
    <MemoryRouter initialEntries={[url]}>
      <LibraryManagerWorkspace user={user} projects={[]} />
      <Location />
    </MemoryRouter>,
  );
}

describe("Library Manager", () => {
  it("has the library's own tabs only", async () => {
    renderAt("/?section=library-manager");
    expect((await screen.findAllByRole("tab")).map((tab) => tab.textContent)).toEqual(["Catalog", "Bulk Edit", "Import Center", "Release Queue"]);
  });

  it("sends an old Connectors address to Supply's Sources, keeping a sign-in result", async () => {
    renderAt("/?section=library-manager&libraryView=connectors&signin=ok");
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toBe("/?section=supply&signin=ok&supplyView=sources"));
  });

  it("sends old Review and Ending addresses to Supply", async () => {
    renderAt("/?section=library-manager&libraryView=review");
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toBe("/?section=supply&supplyView=review"));
    cleanup();
    renderAt("/?section=library-manager&libraryView=ending");
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toBe("/?section=supply&supplyView=dashboard"));
  });
});
