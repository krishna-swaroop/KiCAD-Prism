import {
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type ProjectSection =
    | "overview"
    | "history"
    | "visualizers"
    | "assets"
    | "documentation"
    | "workflows"
    | "release-studio"
    | "manufacturing";

type VisitedSectionState = {
    projectId: string | undefined;
    sections: ReadonlySet<ProjectSection>;
};

/**
 * Lazily retain sections for one project route. The active section is included
 * synchronously so a URL navigation never waits for an effect before rendering.
 */
export function useVisitedProjectSections(
    projectId: string | undefined,
    activeSection: ProjectSection,
): ReadonlySet<ProjectSection> {
    const [cache, setCache] = useState<VisitedSectionState>(() => ({
        projectId,
        sections: new Set([activeSection]),
    }));

    const visited = useMemo(() => {
        if (cache.projectId !== projectId) {
            return new Set<ProjectSection>([activeSection]);
        }
        if (cache.sections.has(activeSection)) return cache.sections;
        return new Set<ProjectSection>([...cache.sections, activeSection]);
    }, [activeSection, cache, projectId]);

    useEffect(() => {
        setCache((current) => {
            if (current.projectId !== projectId) {
                return { projectId, sections: new Set([activeSection]) };
            }
            if (current.sections.has(activeSection)) return current;
            return {
                projectId,
                sections: new Set([...current.sections, activeSection]),
            };
        });
    }, [activeSection, projectId]);

    return visited;
}

export function ProjectSectionPanel({
    active,
    fill = false,
    children,
}: {
    active: boolean;
    fill?: boolean;
    children: ReactNode;
}) {
    return (
        <section
            hidden={!active}
            aria-hidden={!active || undefined}
            className={cn(
                "h-full min-h-0 min-w-0",
                fill ? "flex flex-col overflow-hidden" : "overflow-auto p-6",
                !active && "hidden",
            )}
        >
            {children}
        </section>
    );
}
