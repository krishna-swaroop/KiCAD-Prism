import { Project } from "@/types/project";
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

interface DeleteProjectDialogProps {
  project: Project | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: (projectId: string) => void | Promise<void>;
  getProjectDisplayName: (project: Project) => string;
}

export function DeleteProjectDialog({
  project,
  isDeleting,
  onClose,
  onConfirm,
  getProjectDisplayName,
}: DeleteProjectDialogProps) {
  // The ⌘Enter submit shortcut other dialogs use is deliberately absent here:
  // a single chord that permanently deletes a project is the accident this
  // dialog exists to prevent.
  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{project ? getProjectDisplayName(project) : ""}</strong>? This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <HoldToConfirmButton
            onConfirm={() => project && void onConfirm(project.id)}
            disabled={isDeleting || !project}
            holdingLabel="Hold to delete…"
          >
            {isDeleting ? "Deleting..." : "Hold to delete"}
          </HoldToConfirmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
