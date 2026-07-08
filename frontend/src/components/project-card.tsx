import { Project } from "@/types/project";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Box, Trash2, PanelRightOpen, GitBranch, Folder } from "lucide-react";
import { useNavigate } from "react-router-dom";
import React, { useState } from "react";
import { formatDate } from "@/lib/utils";

const KICAD_VERSION_COLORS: Record<number, { bg: string; text: string }> = {
    1:  { bg: "#6366f1", text: "#fff" },
    2:  { bg: "#8b5cf6", text: "#fff" },
    3:  { bg: "#ec4899", text: "#fff" },
    4:  { bg: "#f43f5e", text: "#fff" },
    5:  { bg: "#f97316", text: "#fff" },
    6:  { bg: "#eab308", text: "#000" },
    7:  { bg: "#22c55e", text: "#fff" },
    8:  { bg: "#06b6d4", text: "#fff" },
    9:  { bg: "#3b82f6", text: "#fff" },
    10: { bg: "#14b8a6", text: "#fff" },
};


function KiCadVersionBadge({ version }: { version: string }) {
    const parts = version.split(".");
    const major = parseInt(parts[0], 10);
    const minor = parts[1] ?? "0";
    const label = `${major}.${minor}`;
    const colors = KICAD_VERSION_COLORS[major] ?? { bg: "#64748b", text: "#fff" };
    return (
        <span
            title={`KiCad ${version}`}
            style={{ backgroundColor: colors.bg, color: colors.text }}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none select-none"
        >
            {label}
        </span>
    );
}

interface ProjectCardProps {
    project: Project;
    compact?: boolean;
    selected?: boolean;
    onClick?: () => void;
    onDoubleClick?: () => void;
    onOpen?: () => void;
    onDelete?: () => void;
    showDelete?: boolean;
    searchQuery?: string;
    actions?: React.ReactNode;
    thumbnailBust?: number;
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
            <mark className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded text-inherit">
                {text.slice(index, index + query.length)}
            </mark>
            {text.slice(index + query.length)}
        </>
    );
}

export function ProjectCard({
    project,
    compact,
    selected,
    onClick,
    onDoubleClick,
    onOpen,
    onDelete,
    showDelete,
    searchQuery = "",
    actions,
    thumbnailBust,
}: ProjectCardProps) {
    const navigate = useNavigate();
    const [lightbox, setLightbox] = useState(false);

    const thumbnailUrl = project.thumbnail_url
        ? `${project.thumbnail_url}${thumbnailBust ? `?t=${thumbnailBust}` : ""}`
        : null;

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
                        <p className="text-xs text-muted-foreground">{formatDate(project.last_modified)}</p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <>
            {lightbox && thumbnailUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setLightbox(false)}
                >
                    <img
                        src={thumbnailUrl}
                        alt={displayName}
                        className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            <Card
                className={`overflow-hidden transition-all cursor-pointer group bg-card border shadow-sm ${selected ? "border-primary shadow-md" : "hover:border-primary/50 hover:shadow-md"}`}
                onClick={handleClick}
                onDoubleClick={onDoubleClick}
            >
                <div
                    className="aspect-video w-full overflow-hidden bg-muted relative border-b"
                    onClick={thumbnailUrl ? (e) => { e.stopPropagation(); setLightbox(true); } : undefined}
                >
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={displayName}
                            className="w-full h-full object-contain hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/30">
                            <Box className="h-10 w-10 opacity-20" />
                        </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                        {project.kicad_version && (
                            <KiCadVersionBadge version={project.kicad_version} />
                        )}
                        <span
                            className="inline-flex items-center justify-center rounded bg-background/80 backdrop-blur-sm border p-0.5"
                            title={project.repo_url ? `Git: ${project.repo_url}` : "Local project"}
                        >
                            {project.repo_url
                                ? <GitBranch className="h-3 w-3 text-foreground/70" />
                                : <Folder className="h-3 w-3 text-foreground/70" />
                            }
                        </span>
                        {actions ? (
                            <div
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                            >
                                {actions}
                            </div>
                        ) : null}
                    </div>
                </div>

                <CardContent className="p-4">
                    <h3 className="font-semibold text-lg tracking-tight mb-1 group-hover:text-primary transition-colors truncate">
                        {highlightMatch(displayName, searchQuery)}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                        {highlightMatch(description, searchQuery)}
                    </p>
                </CardContent>

                <CardFooter className="p-4 pt-0 border-t-0 text-[11px] text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">Updated {formatDate(project.last_modified)}</span>
                    {onOpen && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] shrink-0"
                            onClick={(e) => { e.stopPropagation(); onOpen(); }}
                            onDoubleClick={(e) => e.stopPropagation()}
                        >
                            <PanelRightOpen className="h-3 w-3 mr-1" />
                            Open
                        </Button>
                    )}
                    {showDelete && onDelete && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground shrink-0"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    )}
                </CardFooter>
            </Card>
        </>
    );
}
