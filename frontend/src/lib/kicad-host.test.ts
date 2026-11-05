import { describe, expect, it } from "vitest";

import { insideKiCad } from "./kicad-host";

const host = (props: Record<string, unknown>) => props as unknown as Window;

describe("insideKiCad", () => {
  it("knows KiCad's webview by the handler KiCad registers", () => {
    expect(insideKiCad(host({ webkit: { messageHandlers: { kicad: { postMessage: () => {} } } } }))).toBe(true);
    expect(insideKiCad(host({ chrome: { webview: { postMessage: () => {} } } }))).toBe(true);
    expect(insideKiCad(host({ external: { invoke: () => {} } }))).toBe(true);
  });

  it("is false in an ordinary browser, including one with other WebKit handlers or the legacy window.external", () => {
    expect(insideKiCad(host({}))).toBe(false);
    expect(insideKiCad(host({ webkit: { messageHandlers: { other: {} } } }))).toBe(false);
    expect(insideKiCad(host({ external: { AddSearchProvider: () => {} } }))).toBe(false);
    expect(insideKiCad(host({ chrome: { runtime: {} } }))).toBe(false);
  });
});
