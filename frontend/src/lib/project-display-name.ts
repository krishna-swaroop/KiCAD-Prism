import type { Project } from "@/types/project";

export const getDisplayName = (project: Project) => {
    return project.display_name || project.name;
};
