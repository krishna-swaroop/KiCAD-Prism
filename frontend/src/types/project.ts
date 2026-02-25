export interface Project {
    id: string;
    name: string;
    display_name?: string;
    description: string;
    path: string;
    last_modified: string;
    thumbnail_url?: string;
    sub_path?: string;
    parent_repo?: string;
    repo_url?: string;
    folder_id?: string;  // Folder ID for organization
}

export interface Folder {
    id: string;
    name: string;
    parent_id?: string;
    created_at: string;
    updated_at: string;
    project_ids: string[];
    child_folder_ids: string[];
}

export interface FolderTreeItem {
    id: string;
    name: string;
    parent_id?: string;
    depth: number;
    project_count: number;
    has_children: boolean;
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
