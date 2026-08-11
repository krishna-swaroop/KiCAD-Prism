import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, in the user's terms. Say what is not recoverable. */
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Colour the confirm button as destructive. On by default. */
  destructive?: boolean;
  /**
   * Require a press-and-hold. Reserve this for actions that destroy work or
   * revoke access, matching the delete and archive controls elsewhere.
   */
  requireHold?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
}

/**
 * The app's confirmation dialog.
 *
 * It replaces `window.confirm`, which cannot be themed, ignores the app's
 * focus and escape handling, and gave the same weight to deleting a comment as
 * to revoking someone's access. Here the weight is chosen per call: an ordinary
 * confirm for reversible things, a press-and-hold for the rest.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  requireHold = false,
  busy = false,
  busyLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const label = busy ? busyLabel ?? `${confirmLabel}…` : confirmLabel;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          {requireHold ? (
            <HoldToConfirmButton disabled={busy} onConfirm={onConfirm}>
              {label}
            </HoldToConfirmButton>
          ) : (
            <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
              {label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * State for a confirmation whose subject is chosen at click time — "delete
 * *this* comment", "remove *this* person's role".
 *
 * Holding the subject rather than a boolean keeps the dialog's copy able to
 * name it, and closing simply clears it.
 */
export function useConfirmTarget<T>() {
  const [target, setTarget] = React.useState<T | null>(null);
  return {
    target,
    request: setTarget,
    clear: React.useCallback(() => setTarget(null), []),
    open: target !== null,
  };
}
