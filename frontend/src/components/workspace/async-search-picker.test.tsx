import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AsyncSearchPicker } from "./async-search-picker";

interface Row {
  id: string;
  label: string;
}

const ROWS: Row[] = [
  { id: "a", label: "Sensors/LMT86DCK" },
  { id: "b", label: "Amplifiers/OPA187" },
  { id: "c", label: "Passives/R_0603" },
];

function Harness({
  onSelect,
  fetchPage,
  selectedId = "",
}: {
  onSelect: (row: Row) => void;
  fetchPage?: (query: string, signal: AbortSignal) => Promise<{ items: Row[]; total?: number }>;
  selectedId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AsyncSearchPicker<Row>
      id="picker"
      open={open}
      onOpenChange={setOpen}
      trigger={<button type="button">Open picker</button>}
      fetchPage={
        fetchPage ??
        ((query) =>
          Promise.resolve({
            items: ROWS.filter((row) => row.label.toLowerCase().includes(query.toLowerCase())),
            total: 9,
          }))
      }
      getKey={(row) => row.id}
      isSelected={(row) => row.id === selectedId}
      onSelect={onSelect}
      renderItem={(row) => <span>{row.label}</span>}
      searchPlaceholder="Search things"
      listLabel="Things"
      emptyMessage="Nothing matches."
      renderFooter={({ shown, total }) =>
        total > shown ? <p>{`Showing ${shown} of ${total}`}</p> : null
      }
    />
  );
}

async function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
  return screen.getByRole("combobox");
}

describe("AsyncSearchPicker", () => {
  it("selects with the keyboard without ever leaving the search box", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const search = await openPicker();

    // The whole point of aria-activedescendant: focus stays put while the
    // highlight moves, so reaching row N never costs N tab stops.
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(search).toHaveAttribute("aria-activedescendant", "picker-option-1");
    expect(document.activeElement).toBe(search);

    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("b");
  });

  it("wraps at both ends and jumps with Home and End", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const search = await openPicker();

    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(search).toHaveAttribute("aria-activedescendant", "picker-option-2");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(search).toHaveAttribute("aria-activedescendant", "picker-option-0");
    fireEvent.keyDown(search, { key: "End" });
    expect(search).toHaveAttribute("aria-activedescendant", "picker-option-2");
    fireEvent.keyDown(search, { key: "Home" });
    expect(search).toHaveAttribute("aria-activedescendant", "picker-option-0");
  });

  it("exposes the results as a listbox rather than loose buttons", async () => {
    render(<Harness onSelect={vi.fn()} />);
    const search = await openPicker();

    const listbox = screen.getByRole("listbox", { name: "Things" });
    expect(search).toHaveAttribute("aria-controls", listbox.id);
    // Exactly one option carries aria-selected, and it is the active one.
    const selected = screen.getAllByRole("option", { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("picker-option-0");
  });

  it("opens on the current selection so it is not scrolled past", async () => {
    render(<Harness onSelect={vi.fn()} selectedId="c" />);
    const search = await openPicker();

    expect(search).toHaveAttribute("aria-activedescendant", "picker-option-2");
  });

  it("surfaces a failed search instead of showing an empty list", async () => {
    render(
      <Harness onSelect={vi.fn()} fetchPage={() => Promise.reject(new Error("Backend is down"))} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

    expect(await screen.findByText("Backend is down")).toBeInTheDocument();
    expect(screen.queryByText("Nothing matches.")).not.toBeInTheDocument();
  });

  it("reports how much of the match set is on screen", async () => {
    render(<Harness onSelect={vi.fn()} />);
    await openPicker();

    expect(screen.getByText("Showing 3 of 9")).toBeInTheDocument();
  });

  // Note this covers request *supersession*, not the debounce interval: the
  // pending timer is cleared and the in-flight request aborted on every
  // keystroke, which is what keeps a burst to one request. The 180ms itself is
  // a tuning constant and asserting it would only pin the number.
  it("issues one request per settled term rather than one per keystroke", async () => {
    const seen: string[] = [];
    const fetchPage = vi.fn((query: string) => {
      seen.push(query);
      return Promise.resolve({ items: ROWS, total: 3 });
    });
    render(<Harness onSelect={vi.fn()} fetchPage={fetchPage} />);
    const search = await openPicker();

    fireEvent.change(search, { target: { value: "l" } });
    fireEvent.change(search, { target: { value: "lm" } });
    fireEvent.change(search, { target: { value: "lmt" } });

    await waitFor(() => expect(seen).toContain("lmt"));
    expect(seen.filter((term) => term.startsWith("l"))).toEqual(["lmt"]);
  });

  it("abandons an in-flight search when the term moves on", async () => {
    const signals: AbortSignal[] = [];
    const fetchPage = vi.fn(
      (query: string, signal: AbortSignal) =>
        new Promise<{ items: Row[] }>((resolve) => {
          signals.push(signal);
          // Never settles for the first term, so the abort is the only way out.
          if (query === "lmt") resolve({ items: ROWS });
        })
    );
    render(<Harness onSelect={vi.fn()} fetchPage={fetchPage} />);
    fireEvent.click(screen.getByRole("button", { name: "Open picker" }));
    await waitFor(() => expect(signals).toHaveLength(1));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "lmt" } });

    await waitFor(() => expect(signals[0].aborted).toBe(true));
    // A late resolution from the abandoned request must not repopulate the list.
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
  });
});
