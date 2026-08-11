import { FolderTreeItem } from "@/types/project";
import { Button } from "@/components/ui/button";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteFolderDialogProps {
  folder: FolderTreeItem | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: (folderId: string) => void | Promise<void>;
}

export function DeleteFolderDialog({ folder, isDeleting, onClose, onConfirm }: DeleteFolderDialogProps) {
  // No ⌘Enter shortcut here, for the same reason as the project delete dialog:
  // the confirmation must cost more than one chord.
  return (
    <Dialog open={!!folder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Folder</DialogTitle>
          <DialogDescription>
            Delete <strong>{folder?.name || ""}</strong> and nested folders. Projects in those folders will be moved to workspace root.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <HoldToConfirmButton
            onConfirm={() => folder && void onConfirm(folder.id)}
            disabled={isDeleting || !folder}
            holdingLabel="Hold to delete…"
          >
            {isDeleting ? "Deleting..." : "Hold to delete"}
          </HoldToConfirmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
