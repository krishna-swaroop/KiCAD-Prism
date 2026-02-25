import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  FolderPlus,
  Pencil,
  Trash2,
  FolderInput,
  MoreVertical,
} from "lucide-react";
import { FolderTreeItem } from "@/types/project";

interface FolderContextMenuProps {
  folder: FolderTreeItem;
  onRename: (folderId: string) => void;
  onDelete: (folderId: string) => void;
  onCreateSubfolder: (parentFolderId: string) => void;
  onMoveProjects?: (folderId: string) => void;
}

export function FolderContextMenu({
  folder,
  onRename,
  onDelete,
  onCreateSubfolder,
  onMoveProjects,
}: FolderContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <MoreVertical className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{folder.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={() => onRename(folder.id)}>
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => onCreateSubfolder(folder.id)}>
          <FolderPlus className="h-4 w-4 mr-2" />
          Create Subfolder
        </DropdownMenuItem>
        
        {onMoveProjects && folder.project_count > 0 && (
          <DropdownMenuItem onClick={() => onMoveProjects(folder.id)}>
            <FolderInput className="h-4 w-4 mr-2" />
            Move Projects
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => onDelete(folder.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
