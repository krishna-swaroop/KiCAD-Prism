import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
];

describe("SegmentedControl", () => {
  afterEach(cleanup);

  it("marks the selected option and reports a click", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Pick" options={OPTIONS} value="b" onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Pick" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "B" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "A" }).getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByRole("radio", { name: "C" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves the selection with the arrow keys, wrapping at the ends", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Pick" options={OPTIONS} value="c" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "C" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    fireEvent.keyDown(screen.getByRole("radio", { name: "C" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("b");
  });

  it("is a single tab stop on the selection, or on the first option when none is selected", () => {
    const { rerender } = render(<SegmentedControl aria-label="Pick" options={OPTIONS} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "B" }).getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("radio", { name: "A" }).getAttribute("tabindex")).toBe("-1");
    rerender(<SegmentedControl aria-label="Pick" options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "A" }).getAttribute("tabindex")).toBe("0");
  });

  it("ignores clicks when disabled", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Pick" options={OPTIONS} value="a" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
