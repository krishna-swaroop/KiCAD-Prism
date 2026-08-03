import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useConfirmTarget } from "./confirm-dialog";

describe("useConfirmTarget", () => {
  it("starts closed with no subject", () => {
    const { result } = renderHook(() => useConfirmTarget<string>());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("opens on the requested subject so the dialog can name it", () => {
    const { result } = renderHook(() => useConfirmTarget<string>());
    act(() => result.current.request("alice@example.com"));
    expect(result.current.open).toBe(true);
    expect(result.current.target).toBe("alice@example.com");
  });

  it("closes and forgets the subject", () => {
    const { result } = renderHook(() => useConfirmTarget<string>());
    act(() => result.current.request("alice@example.com"));
    act(() => result.current.clear());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("treats an empty-string subject as open", () => {
    // A falsy-but-present subject is still a request to confirm, which is why
    // the hook tests against null rather than truthiness.
    const { result } = renderHook(() => useConfirmTarget<string>());
    act(() => result.current.request(""));
    expect(result.current.open).toBe(true);
  });
});
