import { toast } from "sonner";

import { openHelpDialog } from "@/lib/help-dialogs";

const INSTALLED = Symbol.for("kicad-prism.error-toast-report-action");

type ErrorToast = typeof toast.error & { [INSTALLED]?: true };

/**
 * Gives every error toast a "Report bug" action that opens the bug report
 * preview.
 *
 * Sonner has no per-type default action, and routing the app's error toasts
 * through a wrapper would touch every call site and every test that mocks
 * "sonner". Wrapping the one `toast.error` function at startup reaches them
 * all. A toast that brings its own action keeps it. Tests never run this, so
 * their `toast.error` assertions are unaffected.
 */
export function installErrorToastReportAction(): void {
  const original = toast.error as ErrorToast;
  if (original[INSTALLED]) return;

  const withReportAction: ErrorToast = (message, data) =>
    original(message, {
      ...data,
      action: data?.action ?? { label: "Report bug", onClick: () => openHelpDialog("report-bug") },
    });
  withReportAction[INSTALLED] = true;
  toast.error = withReportAction;
}
