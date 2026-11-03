import { useRef, useState, type ComponentType } from "react";
import {
    Box,
    FileText,
    FlaskConical,
    FolderOpen,
    History,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    PlayCircle,
    ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SupplyNavIcon } from "@/features/supply/supply-nav-icon";
import { canOpenSupply } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

import type { ProjectSection } from "../project-section-cache";

export type ProjectNavItem = {
    id: ProjectSection;
    label: string;
    icon: ComponentType<{ className?: string }>;
};

const item = (id: ProjectSection, label: string, icon: ProjectNavItem["icon"]): ProjectNavItem => ({ id, label, icon });

/**
 * The project's sections in order. Simulation Studio only when the backend
 * serves it; Supply only for the roles that read supply data.
 */
export function projectNavItems(role: UserRole | null | undefined, simStudio: boolean): ProjectNavItem[] {
    return [
        item("overview", "Overview", FileText),
        item("history", "History", History),
        item("visualizers", "Visualizers", Box),
        item("workflows", "Workflows", PlayCircle),
        item("release-studio", "Release Studio", ShieldCheck),
        ...(simStudio ? [item("simulation-studio", "Simulation Studio", FlaskConical)] : []),
        ...(canOpenSupply(role) ? [item("supply", "Supply", SupplyNavIcon)] : []),
        item("assets", "Assets Portal", FolderOpen),
        item("documentation", "Documentation", FileText),
    ];
}

type NavProps = {
    items: readonly ProjectNavItem[];
    active: ProjectSection;
    onSelect: (section: ProjectSection) => void;
};

function NavButton({ entry, active, labelled, onClick }: {
    entry: ProjectNavItem;
    active: boolean;
    labelled: boolean;
    onClick: () => void;
}) {
    const Icon = entry.icon;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
                active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title={labelled ? undefined : entry.label}
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn("truncate text-left transition-opacity duration-150", labelled ? "opacity-100" : "opacity-0")}>
                {entry.label}
            </span>
        </button>
    );
}

/** How long the pointer rests on the rail before it opens. */
const HOVER_OPEN_MS = 180;

/**
 * The desktop sidebar. Collapsed, it is an icon rail; hovering opens it over
 * the content rather than beside it, so a viewer underneath never resizes.
 * Sections that want the room (`railByDefault`) start as a rail and keep their
 * own open/closed choice apart from the others'.
 */
export function ProjectSidebar({ items, active, onSelect, railByDefault }: NavProps & { railByDefault: boolean }) {
    const [collapsed, setCollapsed] = useState(false);
    const [railOpened, setRailOpened] = useState(false);
    const [hovered, setHovered] = useState(false);
    const hoverTimer = useRef<number | undefined>(undefined);

    const rail = railByDefault ? !railOpened : collapsed;
    const expanded = !rail || hovered;
    const unhover = () => {
        window.clearTimeout(hoverTimer.current);
        setHovered(false);
    };
    const toggle = () => {
        if (railByDefault) setRailOpened((open) => !open);
        else setCollapsed((value) => !value);
        unhover();
    };

    return (
        <aside
            className={cn("relative hidden shrink-0 transition-[width] duration-200 md:block", rail ? "w-14" : "w-56")}
            onMouseEnter={() => {
                window.clearTimeout(hoverTimer.current);
                hoverTimer.current = window.setTimeout(() => setHovered(true), HOVER_OPEN_MS);
            }}
            onMouseLeave={unhover}
        >
            <div
                className={cn(
                    "absolute inset-y-0 left-0 z-rail flex flex-col overflow-hidden border-r bg-background transition-[width,box-shadow] duration-200",
                    expanded ? "w-56" : "w-14",
                    rail && hovered && "shadow-xl",
                )}
            >
                <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-2">
                    {items.map((entry) => (
                        <NavButton
                            key={entry.id}
                            entry={entry}
                            active={active === entry.id}
                            labelled={expanded}
                            onClick={() => onSelect(entry.id)}
                        />
                    ))}
                </nav>
                <div className="border-t p-2">
                    <button
                        type="button"
                        onClick={toggle}
                        className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={rail ? "Expand sidebar" : "Collapse sidebar"}
                        aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {rail ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
                    </button>
                </div>
            </div>
        </aside>
    );
}

/** The same sections in a sheet, for narrow screens. */
export function ProjectMobileNav({ items, active, onSelect }: NavProps) {
    const [open, setOpen] = useState(false);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Project sections">
                    <Menu className="h-4 w-4" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0 sm:w-[300px]" aria-describedby={undefined}>
                <SheetTitle className="px-4 pb-2 pt-4 text-base">Project</SheetTitle>
                <nav className="space-y-0.5 p-2">
                    {items.map((entry) => (
                        <NavButton
                            key={entry.id}
                            entry={entry}
                            active={active === entry.id}
                            labelled
                            onClick={() => {
                                onSelect(entry.id);
                                setOpen(false);
                            }}
                        />
                    ))}
                </nav>
            </SheetContent>
        </Sheet>
    );
}
