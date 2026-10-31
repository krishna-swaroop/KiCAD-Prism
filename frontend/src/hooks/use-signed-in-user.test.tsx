import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { forgetServerState, useServerState } from "@/lib/server-state";
import type { User } from "@/types/auth";

import { useSignedInUser } from "./use-signed-in-user";

const admin = { email: "a@example.com", name: "A", role: "admin" } as User;
const designer = { email: "b@example.com", name: "B", role: "designer" } as User;
const KEY = ["supply", "dashboard"] as const;

/** Read the key once with `load`, then unmount, leaving the answer kept. */
async function keep(load: () => Promise<string>) {
  const read = renderHook(() => useServerState(KEY, load));
  await waitFor(() => expect(read.result.current.data).toBe("Private customer project"));
  read.unmount();
}

function readAgain(load: () => Promise<string>) {
  return renderHook(() => useServerState(KEY, load));
}

afterEach(() => {
  cleanup();
  forgetServerState([]);
});

describe("useSignedInUser", () => {
  it("drops the previous account's kept reads when another account signs in", async () => {
    const session = renderHook(() => useSignedInUser());
    act(() => session.result.current[1](admin));
    await keep(async () => "Private customer project");
    act(() => session.result.current[1](null));
    act(() => session.result.current[1](designer));
    const read = readAgain(() => Promise.reject(new Error("403 Forbidden")));
    expect(read.result.current.data).toBeUndefined();
    await waitFor(() => expect(read.result.current.error?.message).toBe("403 Forbidden"));
    expect(read.result.current.data).toBeUndefined();
  });

  it("drops them on a role change too, and keeps them for the same account", async () => {
    const session = renderHook(() => useSignedInUser());
    act(() => session.result.current[1](admin));
    await keep(async () => "Private customer project");
    act(() => session.result.current[1]({ ...admin }));
    const same = readAgain(() => new Promise<string>(() => undefined));
    expect(same.result.current.data).toBe("Private customer project");
    same.unmount();
    act(() => session.result.current[1]({ ...admin, role: "viewer" } as User));
    expect(readAgain(() => new Promise<string>(() => undefined)).result.current.data).toBeUndefined();
  });
});
