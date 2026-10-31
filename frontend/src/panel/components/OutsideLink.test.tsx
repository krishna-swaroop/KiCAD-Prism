import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutsideLink } from "./OutsideLink";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "webkit");
  vi.restoreAllMocks();
});

describe("OutsideLink", () => {
  it("opens a new tab in a browser", () => {
    render(<OutsideLink href="https://example.com/ds.pdf" label="Open datasheet">Datasheet</OutsideLink>);
    const link = screen.getByRole("link", { name: "Open datasheet" });
    expect(link.getAttribute("href")).toBe("https://example.com/ds.pdf");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("copies the address inside KiCad instead of navigating the panel away", async () => {
    Object.defineProperty(window, "webkit", { configurable: true, value: { messageHandlers: { kicad: { postMessage: () => {} } } } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<OutsideLink href="http://prism.test/?section=supply" label="Open in Prism">icon</OutsideLink>);
    expect(screen.queryByRole("link")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link: Open in Prism" }));
    });
    expect(writeText).toHaveBeenCalledWith("http://prism.test/?section=supply");
    expect(screen.getByRole("button").getAttribute("title")).toBe("Copied");
  });
});
