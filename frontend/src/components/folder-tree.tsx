import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { FolderTreeItem } from "@/types/project";
import { cn } from "@/lib/utils";
import { FolderContextMenu } from "./folder-context-menu";

interface FolderTreeProps {
  folders: FolderTreeItem[];
  selectedFolderId?: string;
  expandedFolderIds: Set<string>;
  onFolderClick: (folderId: string) => void;
  onToggleExpand: (folderId: string) => void;
  onRename?: (folderId: string) => void;
  onDelete?: (folderId: string) => void;
  onCreateSubfolder?: (folderId: string) => void;
}

interface FolderNodeProps {
  folder: FolderTreeItem;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  onFolderClick: (folderId: string) => void;
  onToggleExpand: (folderId: string) => void;
  onRename?: (folderId: string) => void;
  onDelete?: (folderId: string) => void;
  onCreateSubfolder?: (folderId: string) => void;
}

function FolderNode({
  folder,
  depth,
  isSelected,
  isExpanded,
  onFolderClick,
  onToggleExpand,
  onRename,
  onDelete,
  onCreateSubfolder,
}: FolderNodeProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFolderClick(folder.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(folder.id);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
          isSelected
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent hover:text-accent-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        role="treeitem"
        aria-selected={isSelected}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={handleToggle}
          className="p-0.5 hover:bg-accent rounded transition-colors"
          tabIndex={-1}
        >
          {folder.has_children ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>

        {/* Folder icon */}
        {isSelected ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0" />
        )}

        {/* Folder name */}
        <span className="text-sm font-medium truncate flex-1">{folder.name}</span>

        {/* Project count badge */}
        {folder.project_count > 0 && (
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              isSelected
                ? "bg-primary-foreground text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {folder.project_count}
          </span>
        )}

        {/* Context menu trigger */}
        <FolderContextMenu
          folder={folder}
          onRename={onRename || (() => {})}
          onDelete={onDelete || (() => {})}
          onCreateSubfolder={onCreateSubfolder || (() => {})}
        />
      </div>
    </div>
  );
}

export function FolderTree({
  folders,
  selectedFolderId,
  expandedFolderIds,
  onFolderClick,
  onToggleExpand,
  onRename,
  onDelete,
  onCreateSubfolder,
}: FolderTreeProps) {
  // Build tree structure from flat list
  const buildTree = () => {
    const folderMap = new Map<string, FolderTreeItem & { children: FolderTreeItem[] }>();
    const rootFolders: FolderTreeItem[] = [];

    // Initialize all folders
    folders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Build hierarchy
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

  const renderFolder = (folder: FolderTreeItem, depth: number = 0) => {
    const folderData = folder as FolderTreeItem & { children?: FolderTreeItem[] };
    const isExpanded = expandedFolderIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <FolderNode
          folder={folder}
          depth={depth}
          isSelected={isSelected}
          isExpanded={isExpanded}
          onFolderClick={onFolderClick}
          onToggleExpand={onToggleExpand}
          onRename={onRename}
          onDelete={onDelete}
          onCreateSubfolder={onCreateSubfolder}
        />

        {/* Render children if expanded */}
        {isExpanded && folderData.children && folderData.children.length > 0 && (
          <div role="group">
            {folderData.children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (folders.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No folders yet</p>
        <p className="text-xs mt-1">Create a folder to organize your projects</p>
      </div>
    );
  }

  return (
    <div className="py-2" role="tree">
      {rootFolders.map((folder) => renderFolder(folder, 0))}
    </div>
  );
}
