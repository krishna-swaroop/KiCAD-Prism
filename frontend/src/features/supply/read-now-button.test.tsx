import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toasts = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("./supply-api", () => ({ readSupplyPartNow: vi.fn() }));

import { ReadNowButton } from "./read-now-button";
import { readNowSummary } from "./read-now-summary";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("readNowSummary", () => {
  it("says what was read and why anything was not", () => {
    expect(readNowSummary({ read: 2, connectors: 2, problems: [] })).toBe("Read 2 listings.");
    expect(readNowSummary({ read: 1, connectors: 1, problems: [] })).toBe("Read 1 listing.");
    expect(readNowSummary({ read: 0, connectors: 1, problems: [{ connector: "TME", reason: "TME has used today's allowance for asking." }] }))
      .toBe("Read 0 listings. TME has used today's allowance for asking.");
    expect(readNowSummary({ read: 0, connectors: 0, problems: [] })).toBe("No distributor lists this part yet, so there is nothing to read.");
  });
});

describe("ReadNowButton", () => {
  it("reads the part, says so and reloads the sheet", async () => {
    mocked.readSupplyPartNow.mockResolvedValue({ read: 2, connectors: 2, problems: [] });
    const onRead = vi.fn().mockResolvedValue(undefined);
    render(<ReadNowButton partId="p1" onRead={onRead} />);
    fireEvent.click(screen.getByRole("button", { name: /Read now/ }));
    await waitFor(() => expect(onRead).toHaveBeenCalled());
    expect(mocked.readSupplyPartNow).toHaveBeenCalledWith("p1");
    expect(toasts.success).toHaveBeenCalledWith("Read 2 listings.");
  });

  it("warns when a distributor could not be asked", async () => {
    mocked.readSupplyPartNow.mockResolvedValue({ read: 1, connectors: 2, problems: [{ connector: "TME", reason: "TME rejected its credentials." }] });
    render(<ReadNowButton partId="p1" onRead={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: /Read now/ }));
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledWith("Read 1 listing. TME rejected its credentials."));
  });

  it("shows the wait the server asks for and does not reload", async () => {
    mocked.readSupplyPartNow.mockRejectedValue(new Error("You read this part a moment ago. You can read it again in 14 minutes."));
    const onRead = vi.fn();
    render(<ReadNowButton partId="p1" onRead={onRead} />);
    fireEvent.click(screen.getByRole("button", { name: /Read now/ }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("You read this part a moment ago. You can read it again in 14 minutes."));
    expect(onRead).not.toHaveBeenCalled();
  });
});
