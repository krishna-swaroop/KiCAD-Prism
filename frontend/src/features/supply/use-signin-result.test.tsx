import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { useSigninResult } from "./use-signin-result";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

let seen = "";

function Probe() {
  useSigninResult();
  seen = useLocation().search;
  return null;
}

function at(search: string) {
  render(<MemoryRouter initialEntries={[`/${search}`]}><Probe /></MemoryRouter>);
}

describe("the DigiKey sign-in result", () => {
  it("says it worked once and takes it out of the address", async () => {
    at("?section=supply&supplyView=connectors&signin=ok");
    await waitFor(() => expect(seen).toBe("?section=supply&supplyView=connectors"));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("gives the reason when it failed", async () => {
    at("?supplyView=connectors&signin=failed&reason=expired");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The DigiKey sign-in did not finish", { description: expect.stringContaining("expired") }));
    expect(seen).toBe("?supplyView=connectors");
  });

  it("never shows wording that came in the address", async () => {
    at("?supplyView=connectors&signin=ok&message=Signed+in+somewhere+else");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Signed in at DigiKey", expect.anything()));
    cleanup();
    at("?supplyView=connectors&signin=failed&reason=%3Cb%3Eany+text&message=Call+this+number");
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("The DigiKey sign-in did not finish", undefined));
  });

  it("does nothing without a result", () => {
    at("?supplyView=connectors");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
