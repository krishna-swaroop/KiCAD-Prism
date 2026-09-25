import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EcadNetStatistics } from "@/types/ecad-viewer";
import type { PrismSelection } from "@/types/prism-selection";
import { SelectionInspector } from "./selection-inspector";

const STATS: EcadNetStatistics = {
  net: "SIG",
  netCode: 1,
  routedLength: 21.28318,
  layers: ["F.Cu", "In1.Cu", "B.Cu"],
  trackCount: 3,
  viaCount: 2,
};

const NET: PrismSelection = {
  kind: "net",
  sourceContext: "PCB",
  netName: "SIG",
  netCode: 1,
  anchor: { context: "PCB", itemType: "track", layer: "F.Cu" },
};

const TERMINAL: PrismSelection = {
  kind: "terminal",
  sourceContext: "PCB",
  reference: "R1",
  pin: "1",
  netName: "SIG",
};

const COMPONENT: PrismSelection = {
  kind: "component",
  sourceContext: "PCB",
  reference: "R1",
};

function renderInspector(selection: PrismSelection, props: Partial<Parameters<typeof SelectionInspector>[0]> = {}) {
  return render(
    <SelectionInspector
      open
      selection={selection}
      semanticIndex={null}
      onOpenChange={() => {}}
      onClear={() => {}}
      embedded
      {...props}
    />,
  );
}

describe("SelectionInspector routing section", () => {
  it("shows routed length, stack-ordered layers with swatches, and counts for a PCB net", () => {
    const { getByTestId } = renderInspector(NET, {
      netStatistics: STATS,
      viewContext: "PCB",
      layerColors: { "F.Cu": "#c83434", "B.Cu": "#4d7fc4" },
    });
    const routing = within(getByTestId("net-routing"));
    expect(routing.getByText("Routed length").nextElementSibling).toHaveTextContent("21.2832 mm");
    const layers = routing.getByText("Layers used").nextElementSibling!;
    expect(layers.textContent).toBe("F.CuIn1.CuB.Cu");
    // Only layers with a known color get a swatch.
    expect(layers.querySelectorAll("[style]")).toHaveLength(2);
    expect(routing.getByText("Tracks").nextElementSibling).toHaveTextContent("3");
    expect(routing.getByText("Vias").nextElementSibling).toHaveTextContent("2");
  });

  it("shows the terminal's net routing and keeps a zero via count", () => {
    const { getByTestId } = renderInspector(TERMINAL, {
      netStatistics: { ...STATS, viaCount: 0 },
      viewContext: "PCB",
    });
    const routing = within(getByTestId("net-routing"));
    expect(routing.getByText("Vias").nextElementSibling).toHaveTextContent("0");
  });

  it("omits the layers row when the net has no tracks", () => {
    const { getByTestId } = renderInspector(NET, {
      netStatistics: { ...STATS, routedLength: 0, layers: [], trackCount: 0 },
      viewContext: "PCB",
    });
    const routing = within(getByTestId("net-routing"));
    expect(routing.queryByText("Layers used")).toBeNull();
    expect(routing.getByText("Routed length").nextElementSibling).toHaveTextContent("0.0000 mm");
  });

  it("is hidden outside the PCB view, without statistics, and for components", () => {
    expect(renderInspector(NET, { netStatistics: STATS, viewContext: "SCH" }).queryByTestId("net-routing")).toBeNull();
    expect(renderInspector(NET, { netStatistics: null, viewContext: "PCB" }).queryByTestId("net-routing")).toBeNull();
    expect(renderInspector(COMPONENT, { netStatistics: STATS, viewContext: "PCB" }).queryByTestId("net-routing")).toBeNull();
  });
});

describe("SelectionInspector highlighted nets", () => {
  const ENTRIES = [
    { net: { netName: "/Port/SIG", netCode: 1 }, statistics: STATS },
    { net: { netName: "/MGMT.D0_P", netCode: 2 }, statistics: null },
  ];

  it("lists every highlighted net with its copper summary on the PCB view", () => {
    const { getByRole } = renderInspector(NET, {
      viewContext: "PCB",
      highlightedNets: ENTRIES,
      layerColors: { "F.Cu": "#c83434" },
    });
    const list = within(getByRole("list", { name: "Highlighted nets" }));
    const rows = list.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("SIG");
    expect(rows[0]).toHaveTextContent("21.2832 mm");
    expect(rows[0]).toHaveTextContent("F.Cu");
    expect(rows[0].querySelector("button")).toHaveAttribute("title", "/Port/SIG");
    expect(rows[1]).toHaveTextContent("MGMT.D0_P");
    expect(rows[1]).toHaveTextContent("No copper on this board");
  });

  it("marks the inspected net and lets the reviewer inspect or remove a row", () => {
    const inspected: string[] = [];
    const removed: string[] = [];
    const { getByRole } = renderInspector(
      { ...NET, netName: "/MGMT.D0_P", netCode: 2 },
      {
        viewContext: "PCB",
        highlightedNets: ENTRIES,
        onInspectHighlightedNet: (net) => inspected.push(net.netName),
        onRemoveHighlightedNet: (net) => removed.push(net.netName),
      },
    );
    const list = within(getByRole("list", { name: "Highlighted nets" }));
    const rows = list.getAllByRole("listitem");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[0]).not.toHaveAttribute("aria-current");
    list.getByRole("button", { name: "Inspect SIG" }).click();
    list.getByRole("button", { name: "Remove MGMT.D0_P from highlights" }).click();
    expect(inspected).toEqual(["/Port/SIG"]);
    expect(removed).toEqual(["/MGMT.D0_P"]);
  });

  it("keeps the names but drops the copper numbers on the schematic view", () => {
    const { getByRole, queryByText } = renderInspector(NET, {
      viewContext: "SCH",
      highlightedNets: ENTRIES,
    });
    const list = within(getByRole("list", { name: "Highlighted nets" }));
    expect(list.getAllByRole("listitem")).toHaveLength(2);
    expect(queryByText("21.2832 mm")).toBeNull();
    expect(queryByText("No copper on this board")).toBeNull();
  });

  it("stands on its own when nothing is inspected", () => {
    const { getByRole, getByLabelText, queryByText } = render(
      <SelectionInspector
        open
        selection={null}
        semanticIndex={null}
        onOpenChange={() => {}}
        onClear={() => {}}
        highlightedNets={ENTRIES}
        viewContext="PCB"
        embedded
      />,
    );
    expect(getByLabelText("Selection breadcrumb")).toHaveTextContent("Highlighted nets");
    expect(within(getByRole("list", { name: "Highlighted nets" })).getAllByRole("listitem")).toHaveLength(2);
    expect(queryByText("Connectivity")).toBeNull();
    expect(getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("renders nothing without a selection or highlights", () => {
    const { container } = render(
      <SelectionInspector open selection={null} semanticIndex={null} onOpenChange={() => {}} onClear={() => {}} embedded />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
