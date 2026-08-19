import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { setActiveViewerUser, useViewerSettings } from "./viewer-settings";

beforeEach(() => {
    window.localStorage.clear();
    setActiveViewerUser(null);
});

describe("viewer settings", () => {
    it("defaults greyscale to off", () => {
        const { result } = renderHook(() => useViewerSettings("a@example.com"));
        expect(result.current.settings.greyscale).toBe(false);
    });

    it("persists a change and reloads it", () => {
        const first = renderHook(() => useViewerSettings("a@example.com"));
        act(() => first.result.current.update({ greyscale: true }));
        expect(first.result.current.settings.greyscale).toBe(true);

        const second = renderHook(() => useViewerSettings("a@example.com"));
        expect(second.result.current.settings.greyscale).toBe(true);
    });

    it("keeps preferences separate per user", () => {
        const a = renderHook(() => useViewerSettings("a@example.com"));
        act(() => a.result.current.update({ greyscale: true }));

        const b = renderHook(() => useViewerSettings("b@example.com"));
        expect(b.result.current.settings.greyscale).toBe(false);
    });

    it("is case-insensitive on the email key", () => {
        const upper = renderHook(() => useViewerSettings("A@Example.com"));
        act(() => upper.result.current.update({ greyscale: true }));

        const lower = renderHook(() => useViewerSettings("a@example.com"));
        expect(lower.result.current.settings.greyscale).toBe(true);
    });

    it("falls back to the active user when no email is passed", () => {
        setActiveViewerUser("a@example.com");
        const explicit = renderHook(() => useViewerSettings("a@example.com"));
        act(() => explicit.result.current.update({ greyscale: true }));

        const fallback = renderHook(() => useViewerSettings(undefined));
        expect(fallback.result.current.settings.greyscale).toBe(true);
    });

    it("broadcasts a change to another mounted reader", () => {
        const writer = renderHook(() => useViewerSettings("a@example.com"));
        const reader = renderHook(() => useViewerSettings("a@example.com"));
        act(() => writer.result.current.update({ greyscale: true }));
        expect(reader.result.current.settings.greyscale).toBe(true);
    });
});
