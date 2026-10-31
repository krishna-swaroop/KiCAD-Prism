import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JlcIcon } from "./supply-icons";

afterEach(cleanup);

describe("the JLCPCB class icon", () => {
  it("names the class and the preferred list", () => {
    render(<JlcIcon jlc={{ library: "Basic", preferred: true }} />);
    expect(screen.getByRole("img", { name: "JLCPCB basic, preferred" })).toBeTruthy();
    cleanup();
    render(<JlcIcon jlc={{ library: "Extended", preferred: false }} />);
    expect(screen.getByRole("img", { name: "JLCPCB extended" }).textContent).toBe("E");
  });

  it("shows nothing when JLCPCB has no answer", () => {
    const { container } = render(<JlcIcon jlc={null} />);
    expect(container.textContent).toBe("");
    cleanup();
    expect(render(<JlcIcon jlc={{ library: null, preferred: false }} />).container.textContent).toBe("");
  });
});
