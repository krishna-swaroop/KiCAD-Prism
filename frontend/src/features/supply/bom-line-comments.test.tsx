import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  listBomComments: vi.fn(),
  addBomComment: vi.fn(),
  removeBomComment: vi.fn(),
}));

import { BomLineComments } from "./bom-line-comments";
import * as api from "./supply-api";

const mocked = vi.mocked(api);
const designer: User = { name: "Dee", email: "designer@example.com", role: "designer" };
const comment = (overrides = {}) => ({
  id: "c1", line_key: "acme | r1", body: "Check the 0402 alternative", author: "qa@example.com", author_name: "Quinn",
  created_at: new Date(Date.now() - 3600 * 1000).toISOString(), ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listBomComments.mockResolvedValue([comment(), comment({ id: "c2", line_key: "other", body: "Not here" })]);
  mocked.addBomComment.mockResolvedValue(comment({ id: "c3" }));
  mocked.removeBomComment.mockResolvedValue();
});
afterEach(cleanup);

describe("the comments on a BOM line", () => {
  it("shows only this line's comments, with who wrote them", async () => {
    render(<BomLineComments projectId="prj_1" lineKey="acme | r1" user={designer} />);
    expect(await screen.findByText("Check the 0402 alternative")).toBeTruthy();
    expect(screen.getByText(/Quinn, 1 h ago/)).toBeTruthy();
    expect(screen.queryByText("Not here")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove comment" }), "not the designer's own").toBeNull();
  });

  it("adds a comment and lets an author remove their own", async () => {
    mocked.listBomComments.mockResolvedValue([comment({ author: "designer@example.com", author_name: "Dee" })]);
    render(<BomLineComments projectId="prj_1" lineKey="acme | r1" user={designer} />);
    fireEvent.change(await screen.findByLabelText("Add a comment"), { target: { value: " Looks fine " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mocked.addBomComment).toHaveBeenCalledWith("prj_1", "acme | r1", "Looks fine"));
    fireEvent.click(await screen.findByRole("button", { name: "Remove comment" }));
    await waitFor(() => expect(mocked.removeBomComment).toHaveBeenCalledWith("prj_1", "c1"));
  });

  it("lets an administrator remove anyone's comment", async () => {
    render(<BomLineComments projectId="prj_1" lineKey="acme | r1" user={{ ...designer, email: "root@example.com", role: "admin" }} />);
    expect(await screen.findByRole("button", { name: "Remove comment" })).toBeTruthy();
  });
});
