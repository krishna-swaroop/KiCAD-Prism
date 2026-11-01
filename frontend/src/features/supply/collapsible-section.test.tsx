import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CollapsibleSection } from "./collapsible-section";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("a collapsible section", () => {
  it("starts open when short and closed when long, and remembers what the viewer chose", () => {
    render(<CollapsibleSection id="a" title="Short" count={3}><p>short body</p></CollapsibleSection>);
    expect(screen.getByText("short body")).toBeTruthy();
    cleanup();
    render(<CollapsibleSection id="b" title="Long" count={23}><p>long body</p></CollapsibleSection>);
    expect(screen.queryByText("long body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Long/ }));
    expect(screen.getByText("long body")).toBeTruthy();
    cleanup();
    render(<CollapsibleSection id="b" title="Long" count={23}><p>long body</p></CollapsibleSection>);
    expect(screen.getByText("long body")).toBeTruthy();
  });
});
