/**
 * Opens the About and Report a bug dialogs from anywhere: the header Help menu,
 * the command palette, and the action on error toasts. One host in `App.tsx`
 * listens and renders the dialog, so callers need no props or context.
 */
export type HelpDialog = "about" | "report-bug";

const HELP_DIALOG_EVENT = "kicad-prism-help-dialog";

export function openHelpDialog(dialog: HelpDialog): void {
  window.dispatchEvent(new CustomEvent<HelpDialog>(HELP_DIALOG_EVENT, { detail: dialog }));
}

export function subscribeToHelpDialogs(listener: (dialog: HelpDialog) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<HelpDialog>).detail);
  window.addEventListener(HELP_DIALOG_EVENT, handle);
  return () => window.removeEventListener(HELP_DIALOG_EVENT, handle);
}
