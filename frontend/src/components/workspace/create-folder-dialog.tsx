import { useState, type KeyboardEvent } from "react";

import { isDialogSubmitShortcut } from "@/lib/dialog-shortcuts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CreateFolderDialogProps {
  open: boolean;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
}

export function CreateFolderDialog({ open, isSubmitting, onOpenChange, onSubmit }: CreateFolderDialogProps) {
  // Mounted only while open (see workspace.tsx), so each open is a fresh
  // component and the initial value is already the reset.
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    void onSubmit(trimmed);
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isDialogSubmitShortcut(event)) {
      return;
    }

    event.preventDefault();
    if (isSubmitting || !name.trim()) {
      return;
    }

    submit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={handleDialogKeyDown}>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>Create a folder in the current workspace level.</DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Folder name"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
