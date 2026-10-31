import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tracking-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tracking-api")>()),
  getComponentFollow: vi.fn(),
  followComponent: vi.fn(),
  stopFollowingComponent: vi.fn(),
}));

import { ComponentWatch } from "./component-watch";
import * as api from "./tracking-api";

const mocked = vi.mocked(api);
const watch = { component_id: "cmp_1", packaging: "any" as const, tier: 2, rate: "weekly", owner: "ana@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.followComponent.mockResolvedValue(watch);
  mocked.stopFollowingComponent.mockResolvedValue();
});
afterEach(cleanup);

describe("the component watch", () => {
  it("starts a watch with the options chosen", async () => {
    mocked.getComponentFollow.mockResolvedValue(null);
    const changed = vi.fn();
    render(<ComponentWatch componentId="cmp_1" canEdit onChanged={changed} />);
    fireEvent.change(await screen.findByLabelText("Count stock of"), { target: { value: "tape_reel" } });
    fireEvent.click(screen.getByRole("button", { name: "Watch component" }));
    await waitFor(() => expect(mocked.followComponent).toHaveBeenCalledWith("cmp_1", "tape_reel"));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it("stops a watch that exists", async () => {
    mocked.getComponentFollow.mockResolvedValue(watch);
    render(<ComponentWatch componentId="cmp_1" canEdit onChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Stop watching" }));
    await waitFor(() => expect(mocked.stopFollowingComponent).toHaveBeenCalledWith("cmp_1"));
  });

  it("offers a reader nothing to do, and says nothing when there is no watch", async () => {
    mocked.getComponentFollow.mockResolvedValue(null);
    const { container } = render(<ComponentWatch componentId="cmp_1" canEdit={false} onChanged={() => undefined} />);
    await waitFor(() => expect(mocked.getComponentFollow).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
