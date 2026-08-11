import { describe, expect, it } from "vitest";

import { isTypingTarget, matchesShortcut, parseShortcut, shortcutKeys } from "./shortcuts";

// jsdom reports a non-Apple platform, so "mod" resolves to Control here.
function keyEvent(init: Partial<KeyboardEventInit> & { key: string; code?: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { code: "", ...init });
}

describe("parseShortcut", () => {
  it("splits modifiers from the key", () => {
    expect(parseShortcut("mod+shift+z")).toEqual({ key: "z", mod: true, shift: true, alt: false });
    expect(parseShortcut("alt+backspace")).toEqual({ key: "backspace", mod: false, shift: false, alt: true });
    expect(parseShortcut("/")).toEqual({ key: "/", mod: false, shift: false, alt: false });
  });
});

describe("matchesShortcut", () => {
  it("matches an exact modifier set", () => {
    expect(matchesShortcut(keyEvent({ key: "k", ctrlKey: true }), parseShortcut("mod+k"))).toBe(true);
  });

  it("rejects a superset of the requested modifiers", () => {
    // Cmd+Shift+K must not trigger a binding registered for Cmd+K.
    expect(matchesShortcut(keyEvent({ key: "k", ctrlKey: true, shiftKey: true }), parseShortcut("mod+k"))).toBe(false);
  });

  it("leaves the browser's own Ctrl/Cmd+digit shortcuts alone", () => {
    const shortcut = parseShortcut("1");
    expect(matchesShortcut(keyEvent({ key: "1", code: "Digit1" }), shortcut)).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "1", code: "Digit1", ctrlKey: true }), shortcut)).toBe(false);
  });

  it("does not fire a plain binding when the other platform's modifier is held", () => {
    // metaKey on a non-Apple platform is the Windows key; it should not pass.
    expect(matchesShortcut(keyEvent({ key: "/", metaKey: true }), parseShortcut("/"))).toBe(false);
  });

  it("matches shift+/ whether the browser reports '/' or '?'", () => {
    const shortcut = parseShortcut("shift+/");
    expect(matchesShortcut(keyEvent({ key: "?", code: "Slash", shiftKey: true }), shortcut)).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "/", code: "Slash", shiftKey: true }), shortcut)).toBe(true);
  });

  it("falls back to the physical code for modified letters", () => {
    // Alt+Backspace and Alt+letter combos report altered key values on macOS.
    expect(matchesShortcut(keyEvent({ key: "Backspace", altKey: true }), parseShortcut("alt+backspace"))).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "ß", code: "KeyS", ctrlKey: true }), parseShortcut("mod+s"))).toBe(true);
  });
});

describe("isTypingTarget", () => {
  it("treats text entry as typing", () => {
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);

    const textarea = document.createElement("textarea");
    expect(isTypingTarget(textarea)).toBe(true);
  });

  it("does not treat checkboxes or buttons as typing", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isTypingTarget(checkbox)).toBe(false);

    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });

  it("treats contenteditable regions as typing", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom does not implement isContentEditable from the attribute.
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });
});

describe("shortcutKeys", () => {
  it("renders modifiers as key caps", () => {
    expect(shortcutKeys("mod+shift+z")).toEqual(["Ctrl", "⇧", "Z"]);
    expect(shortcutKeys("escape")).toEqual(["Esc"]);
    expect(shortcutKeys("alt+backspace")).toEqual(["Alt", "⌫"]);
  });
});
