import { describe, expect, it, vi } from "vitest";

const { sonnerError, openHelpDialog } = vi.hoisted(() => ({ sonnerError: vi.fn(), openHelpDialog: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: sonnerError } }));
vi.mock("@/lib/help-dialogs", () => ({ openHelpDialog: (dialog: string) => openHelpDialog(dialog) }));

import { toast } from "sonner";

import { installErrorToastReportAction } from "./error-toast-report-action";

describe("installErrorToastReportAction", () => {
  it("adds a Report bug action that opens the bug report preview, once", () => {
    installErrorToastReportAction();
    installErrorToastReportAction();

    toast.error("Sync failed", { duration: 5000 });

    expect(sonnerError).toHaveBeenCalledTimes(1);
    const [message, data] = sonnerError.mock.calls[0];
    expect(message).toBe("Sync failed");
    expect(data.duration).toBe(5000);
    expect(data.action.label).toBe("Report bug");
    data.action.onClick();
    expect(openHelpDialog).toHaveBeenCalledWith("report-bug");
  });

  it("keeps an action the caller supplied", () => {
    const retry = { label: "Retry", onClick: vi.fn() };
    toast.error("Import failed", { action: retry });
    expect(sonnerError.mock.calls.at(-1)?.[1].action).toBe(retry);
  });
});
