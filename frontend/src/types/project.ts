export interface Project {
    id: string;
    name: string;
    display_name?: string;
    description: string;
    path: string;
    last_modified: string;
    registered_at?: string;
    thumbnail_url?: string;
    sub_path?: string;
    parent_repo?: string;
    repo_url?: string;
    folder_id?: string | null;
    kicad_version?: string;
}

export interface Folder {
    id: string;
    name: string;
    parent_id?: string | null;
    created_at: string;
    updated_at: string;
}

export interface FolderTreeItem {
    id: string;
    name: string;
    parent_id?: string | null;
    depth: number;
    has_children: boolean;
    direct_project_count: number;
    total_project_count: number;
}

export interface Monorepo {
    name: string;
    path: string;
    project_count: number;
    last_synced?: string;
    repo_url?: string;
}

export interface MonorepoFolder {
    name: string;
    path: string;
    item_count: number;
}

export interface MonorepoProject {
    id: string;
    name: string;
    display_name?: string;
    relative_path: string;
    has_thumbnail: boolean;
    last_modified: string;
}

export interface MonorepoStructure {
    repo_name: string;
    current_path: string;
    folders: MonorepoFolder[];
    projects: MonorepoProject[];
}

export interface ProjectPropertiesFileTitleBlock {
    title: string;
    date: string;
    rev: string;
    company: string;
    comments: Record<string, string>;
}

export interface ProjectPropertiesSchematicFile {
    path: string;
    filename: string;
    version?: number;
    generator?: string;
    generator_version?: string;
    paper?: string;
    uuid?: string;
    title_block?: ProjectPropertiesFileTitleBlock | null;
}

export interface ProjectPropertiesPcbFile {
    path: string;
    filename: string;
    version?: number;
    generator?: string;
    generator_version?: string;
    paper?: string;
    dimensions_mm?: {
        width_mm: number;
        height_mm: number;
    } | null;
    thickness_mm?: number;
    title_block?: ProjectPropertiesFileTitleBlock | null;
}

export interface ProjectPropertiesTag {
    tag: string;
    commit_hash: string;
    date: string;
    message: string;
}

export interface ProjectPropertiesLatestCommit {
    hash: string;
    full_hash: string;
    author: string;
    email: string;
    date: string;
    message: string;
}

export interface ProjectPropertiesResponse {
    project: Project;
    repository: {
        latest_commit: ProjectPropertiesLatestCommit | null;
        latest_tag: ProjectPropertiesTag | null;
    };
    files: {
        schematic: ProjectPropertiesSchematicFile | null;
        pcb: ProjectPropertiesPcbFile | null;
    };
}
