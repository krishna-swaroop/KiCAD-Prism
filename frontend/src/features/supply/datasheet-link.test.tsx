import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getPartDatasheet: vi.fn(),
}));

import { DatasheetLink } from "./datasheet-link";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getPartDatasheet.mockResolvedValue({ url: "https://acme.example/abc1.pdf" });
});
afterEach(cleanup);

describe("the datasheet icon", () => {
  it("is an icon that opens the manufacturer's datasheet and keeps nothing", async () => {
    render(<DatasheetLink partId="p1" />);
    const link = await screen.findByRole("link", { name: "Open the datasheet" });
    expect(link.getAttribute("href")).toBe("https://acme.example/abc1.pdf");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.textContent).toBe("");
  });

  it("offers no way to set the address", async () => {
    render(<DatasheetLink partId="p1" />);
    await screen.findByRole("link", { name: "Open the datasheet" });
    expect(screen.queryByRole("button", { name: /datasheet address/i })).toBeNull();
  });

  it("shows nothing when the part has no datasheet", async () => {
    mocked.getPartDatasheet.mockResolvedValue({ url: "" });
    const { container } = render(<DatasheetLink partId="p1" />);
    await waitFor(() => expect(mocked.getPartDatasheet).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
