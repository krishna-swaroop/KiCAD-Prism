import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useWindowedRows, WINDOW_FROM } from "./use-windowed-rows";

afterEach(cleanup);

function Rows({ count }: { count: number }) {
  const table = useRef<HTMLTableElement>(null);
  const shown = useWindowedRows(count, table);
  return (
    <div style={{ overflowY: "auto", height: 400 }}>
      <table ref={table}>
        <tbody>
          {shown.before > 0 ? <tr data-testid="before" style={{ height: shown.before }} /> : null}
          {Array.from({ length: shown.end - shown.start }, (_, index) => <tr key={shown.start + index} data-row><td>{shown.start + index}</td></tr>)}
          {shown.after > 0 ? <tr data-testid="after" style={{ height: shown.after }} /> : null}
        </tbody>
      </table>
    </div>
  );
}

describe("a long table renders the rows near the view", () => {
  it("renders every row of a short table", () => {
    const { container } = render(<Rows count={WINDOW_FROM - 1} />);
    expect(container.querySelectorAll("[data-row]")).toHaveLength(WINDOW_FROM - 1);
    expect(container.querySelector("[data-testid=after]")).toBeNull();
  });

  it("renders the first rows of a long one and a spacer standing in for the rest", () => {
    const { container, getByTestId } = render(<Rows count={2000} />);
    const rendered = container.querySelectorAll("[data-row]").length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    expect(container.querySelector("[data-testid=before]")).toBeNull();
    expect(Number.parseFloat(getByTestId("after").style.height)).toBeGreaterThan(0);
  });
});
