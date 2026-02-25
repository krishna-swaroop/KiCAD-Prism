import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderTreeItem } from "@/types/project";

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; parent_id?: string }) => void;
  mode?: "create" | "rename";
  folder?: FolderTreeItem | null;
  folders?: FolderTreeItem[];
}

export function FolderDialog({
  open,
  onOpenChange,
  onSubmit,
  mode = "create",
  folder,
  folders = [],
}: FolderDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      if (mode === "rename" && folder) {
        setName(folder.name);
        setParentId(folder.parent_id);
      } else {
        setName("");
        setParentId(undefined);
      }
      setError("");
    }
  }, [open, mode, folder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError("Folder name is required");
      return;
    }

    if (name.trim().length < 2) {
      setError("Folder name must be at least 2 characters");
      return;
    }

    // Prevent circular reference (can't set parent to self)
    if (mode === "rename" && folder && parentId === folder.id) {
      setError("Cannot set folder as its own parent");
      return;
    }

    onSubmit({ name: name.trim(), parent_id: parentId });
  };

  const handleOpenChange = (newOpen: boolean) => {
    setError("");
    onOpenChange(newOpen);
  };

  // Filter out current folder and its descendants from parent options
  const getParentOptions = () => {
    if (!folder) return folders;
    
    // Simple implementation: just exclude current folder
    // A more complete solution would also exclude descendants
    return folders.filter(f => f.id !== folder.id);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Create New Folder" : "Rename Folder"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Create a new folder to organize your projects. You can also create subfolders."
                : "Change the name of the folder."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="My Folder"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            {mode === "create" && (
              <div className="grid gap-2">
                <Label htmlFor="parent-folder">Parent Folder (optional)</Label>
                <select
                  id="parent-folder"
                  value={parentId || ""}
                  onChange={(e) => setParentId(e.target.value || undefined)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">No parent (root folder)</option>
                  {getParentOptions().map((f) => (
                    <option key={f.id} value={f.id}>
                      {"  ".repeat(f.depth)}{f.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Select a parent folder to create a subfolder
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {mode === "create" ? "Create Folder" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
