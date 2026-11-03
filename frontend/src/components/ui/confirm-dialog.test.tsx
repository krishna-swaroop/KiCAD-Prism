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

describe("ConfirmDialog layering", () => {
  it("sits on the modal layer, above floating comment cards", async () => {
    const { render, screen } = await import("@testing-library/react");
    const { ConfirmDialog } = await import("./confirm-dialog");
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title="Delete comment"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={() => undefined}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete comment" });
    expect(dialog.className).toContain("z-modal");
    const overlay = document.querySelector("[data-state=open].bg-black\\/80");
    expect(overlay?.className).toContain("z-modal");
  });
});
