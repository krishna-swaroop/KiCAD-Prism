import { Project } from "@/types/project";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Box, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import React from "react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
    project: Project;
    compact?: boolean;
    dense?: boolean;
    selected?: boolean;
    onClick?: () => void;
    onDoubleClick?: () => void;
    onDelete?: () => void;
    showDelete?: boolean;
    searchQuery?: string;
    actions?: React.ReactNode;
}

// Highlight matched text in search results
function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query || !query.trim()) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    return (
        <>
            {text.slice(0, index)}
            <mark className="bg-warning/25 px-0.5 rounded text-inherit">
                {text.slice(index, index + query.length)}
            </mark>
            {text.slice(index + query.length)}
        </>
    );
}

export function ProjectCard({
    project,
    compact,
    dense = false,
    selected,
    onClick,
    onDoubleClick,
    onDelete,
    showDelete,
    searchQuery = "",
    actions,
}: ProjectCardProps) {
    const navigate = useNavigate();

    const thumbnailUrl = project.thumbnail_url ? project.thumbnail_url : null;

    // Helper function to get display name
    const getDisplayName = (project: Project) => {
        return project.display_name || project.name;
    };

    const handleClick = () => {
        if (onClick) {
            onClick();
        } else {
            navigate(`/project/${project.id}`);
        }
    };

    const displayName = getDisplayName(project);
    const description = project.description || "No description available.";
    const parentRepo = project.parent_repo;

    if (compact) {
        return (
            <Card
                className={`overflow-hidden transition-all cursor-pointer group bg-card border shadow-sm ${selected ? "border-primary shadow-md" : "hover:border-primary/50 hover:shadow-md"}`}
                onClick={handleClick}
                onDoubleClick={onDoubleClick}
            >
                <div className="flex items-center gap-3 p-3">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                            <Box className="h-6 w-6 opacity-20" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-medium text-sm truncate">
                            {highlightMatch(displayName, searchQuery)}
                        </h3>
                        <p className="text-xs text-muted-foreground">{project.last_modified}</p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card
            className={cn(
                "overflow-hidden py-0 gap-0 transition-all cursor-pointer group bg-card border shadow-sm",
                selected ? "border-primary shadow-md" : "hover:border-primary/50 hover:shadow-md",
            )}
            onClick={handleClick}
            onDoubleClick={onDoubleClick}
        >
            <div className="relative aspect-video w-full overflow-hidden border-b bg-muted">
                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt={displayName}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center bg-muted/30 text-muted-foreground">
                        <Box className="h-10 w-10 opacity-20" />
                    </div>
                )}
                <div className="absolute top-2 right-2 left-2 flex items-start justify-end gap-1">
                    {parentRepo && (
                        <Badge
                            variant="secondary"
                            title={parentRepo}
                            className="min-w-0 max-w-full truncate border bg-background/80 text-[10px] backdrop-blur-sm"
                        >
                            {highlightMatch(parentRepo, searchQuery)}
                        </Badge>
                    )}
                    <Badge variant="secondary" className="shrink-0 border bg-background/80 text-[10px] backdrop-blur-sm">
                        Git
                    </Badge>
                    {actions ? (
                        <div
                            className="shrink-0"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {actions}
                        </div>
                    ) : null}
                    {showDelete && onDelete && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 bg-background/80 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            <CardContent className={dense ? "p-3" : "p-4"}>
                <h3
                    className={cn(
                        "truncate font-semibold tracking-tight transition-colors group-hover:text-primary",
                        dense ? "mb-0.5 text-base" : "mb-1 text-lg",
                    )}
                    title={displayName}
                >
                    {highlightMatch(displayName, searchQuery)}
                </h3>
                <p className={cn("line-clamp-2 text-muted-foreground", dense ? "text-xs" : "min-h-[2.5rem] text-sm")}>
                    {highlightMatch(description, searchQuery)}
                </p>
            </CardContent>

            <CardFooter className={cn(
                "flex items-center gap-2 border-t-0 text-[11px] text-muted-foreground",
                dense ? "p-3 pt-0" : "p-4 pt-0",
            )}>
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Updated {project.last_modified}</span>
            </CardFooter>
        </Card>
    );
}
