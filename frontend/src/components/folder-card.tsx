import { Folder, FolderOpen, Files } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FolderTreeItem } from "@/types/project";
import { cn } from "@/lib/utils";

interface FolderCardProps {
  folder: FolderTreeItem;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function FolderCard({ folder, onClick, onContextMenu }: FolderCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e);
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all duration-200",
        "hover:border-primary/50 hover:shadow-lg hover:-translate-y-1",
        "bg-card border shadow-sm"
      )}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/5 to-primary/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />

      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg tracking-tight group-hover:text-primary transition-colors line-clamp-1">
                {folder.name}
              </h3>
              {folder.depth > 0 && (
                <p className="text-xs text-muted-foreground">
                  Depth: {folder.depth}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Files className="h-4 w-4" />
          <span>
            {folder.project_count} {folder.project_count === 1 ? "project" : "projects"}
          </span>
          {folder.has_children && (
            <>
              <span className="mx-1">•</span>
              <Folder className="h-4 w-4" />
              <span>Has subfolders</span>
            </>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 border-t-0 text-xs text-muted-foreground">
        &nbsp;
      </CardFooter>
    </Card>
  );
}
