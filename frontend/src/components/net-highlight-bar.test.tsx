import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetHighlightBar } from "./net-highlight-bar";

const NETS = [
  { netName: "/Power/VBUS", netCode: 4 },
  { netName: "GND", netCode: 1 },
];

describe("NetHighlightBar", () => {
  it("renders nothing without nets", () => {
    const { container } = render(<NetHighlightBar nets={[]} onRemove={() => {}} onClear={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists leaf names with the full name as title, counts, and routes the actions", () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const onFit = vi.fn();
    const { getByLabelText, getByText, getByTitle } = render(
      <NetHighlightBar nets={NETS} onRemove={onRemove} onClear={onClear} onFit={onFit} />,
    );
    expect(getByTitle("/Power/VBUS")).toHaveTextContent("VBUS");
    expect(getByText("2")).toBeInTheDocument();
    fireEvent.click(getByLabelText("Remove VBUS from highlights"));
    expect(onRemove).toHaveBeenCalledWith(NETS[0]);
    fireEvent.click(getByText("Fit"));
    expect(onFit).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText("Clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("omits Fit where the board cannot be framed", () => {
    const { queryByText } = render(<NetHighlightBar nets={NETS} onRemove={() => {}} onClear={() => {}} />);
    expect(queryByText("Fit")).toBeNull();
  });
});
