import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardCount } from "./board-count";

afterEach(cleanup);

describe("the board count", () => {
  it("takes a board count and refuses nonsense", () => {
    const change = vi.fn();
    render(<BoardCount boards={100} onChange={change} />);
    const box = screen.getByLabelText("Boards to cost") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "2,500" } });
    fireEvent.blur(box);
    expect(change).toHaveBeenCalledWith(2500);
    fireEvent.change(box, { target: { value: "-4" } });
    fireEvent.blur(box);
    expect(change).toHaveBeenCalledTimes(1);
    expect(box.value).toBe("100");
  });
});
