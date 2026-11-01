import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchBox } from "./search-box";

afterEach(cleanup);

describe("the search box", () => {
  it("clears typed text without searching, and lifts a search that is applied", () => {
    const search = vi.fn();
    const { rerender } = render(<SearchBox initial="" onSearch={search} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search parts" }), { target: { value: "LM358" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((screen.getByRole("textbox", { name: "Search parts" }) as HTMLInputElement).value).toBe("");
    expect(search).not.toHaveBeenCalled();

    rerender(<SearchBox key="applied" initial="LM358" onSearch={search} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveBeenCalledWith("");
  });
});
