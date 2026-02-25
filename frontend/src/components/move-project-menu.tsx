import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Folder, MoreVertical, FolderPlus, FolderInput } from "lucide-react";
import { FolderTreeItem } from "@/types/project";
import { cn } from "@/lib/utils";

interface MoveProjectMenuProps {
  projectId: string;
  currentFolderId?: string;
  folders: FolderTreeItem[];
  onMove: (projectId: string, folderId: string | null) => void;
  onCreateFolder?: (projectId: string) => void;
}

export function MoveProjectMenu({
  projectId,
  currentFolderId,
  folders,
  onMove,
  onCreateFolder,
}: MoveProjectMenuProps) {
  const [open, setOpen] = useState(false);

  const handleMove = (folderId: string | null) => {
    onMove(projectId, folderId);
    setOpen(false);
  };

  // Build tree structure for display
  const buildTree = () => {
    const folderMap = new Map<string, FolderTreeItem & { children: FolderTreeItem[] }>();
    const rootFolders: FolderTreeItem[] = [];

    folders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    folders.forEach((folder) => {
      if (folder.parent_id) {
        const parent = folderMap.get(folder.parent_id);
        if (parent) {
          parent.children.push(folderMap.get(folder.id)!);
        }
      } else {
        rootFolders.push(folderMap.get(folder.id)!);
      }
    });

    return { rootFolders, folderMap };
  };

  const { rootFolders } = buildTree();

  const renderFolderOptions = (folder: FolderTreeItem, depth: number = 0) => {
    const folderData = folder as FolderTreeItem & { children?: FolderTreeItem[] };
    const isCurrentFolder = folder.id === currentFolderId;

    return (
      <div key={folder.id}>
        <DropdownMenuItem
          onClick={() => handleMove(folder.id)}
          disabled={isCurrentFolder}
          className={cn(
            "cursor-pointer",
            isCurrentFolder && "text-muted-foreground"
          )}
          style={{ paddingLeft: `${depth * 16 + 16}px` }}
        >
          <Folder className="h-4 w-4 mr-2" />
          {folder.name}
          {isCurrentFolder && <span className="ml-2 text-xs">(current)</span>}
        </DropdownMenuItem>

        {folderData.children && folderData.children.length > 0 && (
          <div>
            {folderData.children.map((child) => renderFolderOptions(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Move Project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Option to move to root (no folder) */}
        <DropdownMenuItem
          onClick={() => handleMove(null)}
          disabled={!currentFolderId}
          className={cn(
            "cursor-pointer",
            !currentFolderId && "text-muted-foreground"
          )}
        >
          <FolderInput className="h-4 w-4 mr-2" />
          Root (No Folder)
          {!currentFolderId && <span className="ml-2 text-xs">(current)</span>}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Folder options */}
        {rootFolders.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No folders available
          </div>
        ) : (
          rootFolders.map((folder) => renderFolderOptions(folder, 0))
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            onCreateFolder?.(projectId);
          }}
          className="cursor-pointer text-primary"
        >
          <FolderPlus className="h-4 w-4 mr-2" />
          Create New Folder...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
