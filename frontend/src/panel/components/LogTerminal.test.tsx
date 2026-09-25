import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LogTerminal } from "./LogTerminal";

describe("LogTerminal", () => {
  it("shows a dropped-entry indicator and keeps the newest line after clear", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <LogTerminal
        entries={["[12:00:01] oldest", "[12:00:02] newest"]}
        dropped={3}
        onClear={onClear}
      />,
    );

    expect(screen.getByText("[12:00:02] newest")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand transfer log" }));
    expect(screen.getByText(/3 earlier entries dropped/)).toBeInTheDocument();
    expect(screen.getByText(/\[12:00:01\] oldest/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(<LogTerminal entries={[]} dropped={0} onClear={onClear} />);
    expect(screen.getByText("No transfers yet.")).toBeInTheDocument();
    expect(screen.queryByText(/earlier entries dropped/)).not.toBeInTheDocument();
  });
});
