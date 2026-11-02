import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { vendorColor } from "./vendor-colors";
import { VendorName } from "./vendor-name";

afterEach(cleanup);

describe("vendor colours", () => {
  it("gives each distributor its colour by provider key, and none to others", () => {
    expect(vendorColor("digikey")).toBe("#ff2100");
    expect(vendorColor("mouser")).toBe("#0070bb");
    expect(vendorColor("farnell")).toBe("#4eb661");
    expect(vendorColor("lcsc")).toBe("#1166dd");
    expect(vendorColor("tme")).toBe("#183884");
    expect(vendorColor("csv")).toBeNull();
    expect(vendorColor(undefined)).toBeNull();
  });

  it("puts the colour beside the name and leaves the name as text", () => {
    const { container } = render(<VendorName provider="mouser" name="Mouser IT" />);
    expect(screen.getByText("Mouser IT")).toBeTruthy();
    expect((container.querySelector("[aria-hidden]") as HTMLElement).style.backgroundColor).toBe("rgb(0, 112, 187)");
    cleanup();
    const plain = render(<VendorName provider="csv" name="Stock file" />);
    expect(plain.container.querySelector("[aria-hidden]")).toBeNull();
  });
});
