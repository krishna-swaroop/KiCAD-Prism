import { fetchApi, readApiError } from "@/lib/api";
import type {
    BoardSpec,
    EvidenceDescriptor,
    Manufacturer,
    ManufacturingRun,
    ParsedSpecConfig,
    PcbRuleField,
    ProjectManufacturer,
    ProjectSpec,
    RunDefect,
    SpecTemplate,
} from "@/types/manufacturing";

async function json<T>(response: Response, fallback: string): Promise<T> {
    if (!response.ok) {
        throw new Error(await readApiError(response, fallback));
    }
    return (await response.json()) as T;
}

// -- manufacturers --

export async function listManufacturers(): Promise<Manufacturer[]> {
    return json(await fetchApi("/api/manufacturing/manufacturers"), "Failed to load manufacturers.");
}

export async function createManufacturer(body: {
    name: string;
    contact?: string;
    website?: string;
    notes?: string;
}): Promise<{ id: string }> {
    return json(
        await fetchApi("/api/manufacturing/manufacturers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to create manufacturer.",
    );
}

export async function updateManufacturer(
    id: string,
    body: {
        name: string;
        contact?: string;
        website?: string;
        notes?: string;
    },
): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/manufacturers/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to update manufacturer.",
    );
}

// -- PCB rules / capabilities --

export async function getPcbRuleFields(): Promise<PcbRuleField[]> {
    const data = await json<{ fields: PcbRuleField[] }>(
        await fetchApi("/api/manufacturing/pcb-rule-fields"),
        "Failed to load rule fields.",
    );
    return data.fields;
}

export async function extractPcbRules(
    projectId: string,
): Promise<{ rules: Record<string, unknown>; reason?: string }> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/pcb-rules/extract`, {
            method: "POST",
        }),
        "Failed to read the board rules.",
    );
}

export async function deleteManufacturer(id: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/manufacturers/${id}`, { method: "DELETE" }),
        "Failed to delete manufacturer.",
    );
}

// -- board specs --

export async function getBoardSpec(projectId: string): Promise<BoardSpec> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/board-spec`),
        "Failed to load board specs.",
    );
}

export async function saveBoardSpec(
    projectId: string,
    specs: Record<string, unknown>,
    source: Record<string, string>,
    activeSections?: string[],
): Promise<BoardSpec> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/board-spec`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ specs, source, active_sections: activeSections ?? null }),
        }),
        "Failed to save board specs.",
    );
}

export async function downloadSpecSheet(projectId: string): Promise<void> {
    const response = await fetchApi(`/api/manufacturing/projects/${projectId}/spec-sheet.pdf`);
    if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to generate the spec sheet."));
    }
    // The server names the file (project name + "fab spec"); read it from the header,
    // falling back to a generic name if it is not present.
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? match[1] : "fab spec.pdf";

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function downloadRunReport(runId: string): Promise<void> {
    const response = await fetchApi(`/api/manufacturing/runs/${runId}/report.pdf`);
    if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to generate the run report."));
    }
    // The server names the file (project name + "run report"); read it from the header.
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? match[1] : "run report.pdf";

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function extractBoardSpec(
    projectId: string,
): Promise<{ suggested: Record<string, unknown>; reason?: string }> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/board-spec/extract`, {
            method: "POST",
        }),
        "Failed to read the board.",
    );
}

// -- project manufacturers (attachments) --

export async function listProjectManufacturers(projectId: string): Promise<ProjectManufacturer[]> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/manufacturers`),
        "Failed to load the project's manufacturers.",
    );
}

export async function attachManufacturer(projectId: string, manufacturerId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/manufacturers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ manufacturer_id: manufacturerId }),
        }),
        "Failed to add the manufacturer.",
    );
}

export async function detachManufacturer(projectId: string, manufacturerId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/manufacturers/${manufacturerId}`, {
            method: "DELETE",
        }),
        "Failed to remove the manufacturer.",
    );
}

// -- named specs (per project + manufacturer) --

export async function listProjectSpecs(
    projectId: string,
    manufacturerId?: string,
): Promise<ProjectSpec[]> {
    const query = manufacturerId ? `?manufacturer_id=${encodeURIComponent(manufacturerId)}` : "";
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/specs${query}`),
        "Failed to load specs.",
    );
}

export async function getProjectSpec(
    specId: string,
): Promise<ProjectSpec & { parsed: ParsedSpecConfig }> {
    return json(await fetchApi(`/api/manufacturing/specs/${specId}`), "Failed to load the spec.");
}

export async function createProjectSpec(
    projectId: string,
    body: { manufacturer_id: string; name: string; spec_config?: string; template_id?: string | null },
): Promise<{ id: string }> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/specs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to create the spec.",
    );
}

export async function updateProjectSpec(
    specId: string,
    body: Partial<{
        name: string;
        spec_config: string;
        specs: Record<string, unknown>;
        source: Record<string, string>;
        active_sections: string[];
    }>,
): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/specs/${specId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to save the spec.",
    );
}

export async function deleteProjectSpec(specId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/specs/${specId}`, { method: "DELETE" }),
        "Failed to delete the spec.",
    );
}

export async function applyTemplateToSpec(specId: string, templateId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/specs/${specId}/apply-template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: templateId }),
        }),
        "Failed to apply the template.",
    );
}

// -- spec schema (.config) --

export async function getSpecConfig(
    projectId: string,
): Promise<{ spec_config: string; parsed: ParsedSpecConfig }> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/spec-config`),
        "Failed to load the spec schema.",
    );
}

export async function saveSpecConfig(
    projectId: string,
    specConfig: string,
): Promise<{ spec_config: string; parsed: ParsedSpecConfig }> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/spec-config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spec_config: specConfig }),
        }),
        "Failed to save the spec schema.",
    );
}

export async function previewSpecConfig(specConfig: string): Promise<ParsedSpecConfig> {
    return json(
        await fetchApi("/api/manufacturing/spec-config/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spec_config: specConfig }),
        }),
        "Failed to parse the spec schema.",
    );
}

// -- spec templates (named, manufacturer-scoped) --

export async function listTemplates(manufacturerId?: string): Promise<SpecTemplate[]> {
    const query = manufacturerId ? `?manufacturer_id=${encodeURIComponent(manufacturerId)}` : "";
    return json(await fetchApi(`/api/manufacturing/templates${query}`), "Failed to load templates.");
}

export async function getTemplate(templateId: string): Promise<SpecTemplate> {
    return json(await fetchApi(`/api/manufacturing/templates/${templateId}`), "Failed to load template.");
}

export async function createTemplate(
    manufacturerId: string,
    body: { name: string; spec_config: string; capabilities?: Record<string, unknown> },
): Promise<{ id: string }> {
    return json(
        await fetchApi(`/api/manufacturing/manufacturers/${manufacturerId}/templates`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to create template.",
    );
}

export async function updateTemplate(
    templateId: string,
    body: Partial<{ name: string; spec_config: string; capabilities: Record<string, unknown> }>,
): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/templates/${templateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to update template.",
    );
}

export async function deleteTemplate(templateId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/templates/${templateId}`, { method: "DELETE" }),
        "Failed to delete template.",
    );
}

export async function applyTemplate(
    projectId: string,
    templateId: string,
): Promise<{ spec_config: string; parsed: ParsedSpecConfig }> {
    return json(
        await fetchApi(`/api/manufacturing/projects/${projectId}/spec-config/apply-template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: templateId }),
        }),
        "Failed to apply template.",
    );
}

// -- runs --

export async function listRuns(projectId?: string): Promise<ManufacturingRun[]> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return json(await fetchApi(`/api/manufacturing/runs${query}`), "Failed to load runs.");
}

export async function getRun(runId: string): Promise<ManufacturingRun> {
    return json(await fetchApi(`/api/manufacturing/runs/${runId}`), "Failed to load run.");
}

export async function createRun(body: {
    project_id: string;
    manufacturer_id?: string | null;
    spec_id?: string | null;
    commit_sha?: string;
    release_tag?: string;
    quantity_ordered?: number;
    notes?: string;
    spec_snapshot?: Record<string, unknown>;
}): Promise<{ id: string }> {
    return json(
        await fetchApi("/api/manufacturing/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to create run.",
    );
}

export async function updateRun(
    runId: string,
    body: Partial<{
        manufacturer_id: string | null;
        commit_sha: string;
        quantity_ordered: number;
        quantity_good: number;
        notes: string;
    }>,
): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/runs/${runId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to update run.",
    );
}

// Status changes are QA/admin only, so they go to a separate endpoint.
export async function updateRunStatus(runId: string, status: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/runs/${runId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        }),
        "Failed to change run status.",
    );
}

export async function deleteRun(runId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/runs/${runId}`, { method: "DELETE" }),
        "Failed to delete run.",
    );
}

// -- defects --

export async function logDefect(
    runId: string,
    body: { category: string; severity: string; quantity_affected: number; description: string },
): Promise<{ id: string }> {
    return json(
        await fetchApi(`/api/manufacturing/runs/${runId}/defects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to log defect.",
    );
}

export async function updateDefect(
    defectId: string,
    body: Partial<{
        category: string;
        severity: string;
        quantity_affected: number;
        description: string;
        status: string;
    }>,
): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/defects/${defectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        "Failed to update defect.",
    );
}

export async function deleteDefect(defectId: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/defects/${defectId}`, { method: "DELETE" }),
        "Failed to delete defect.",
    );
}

// -- evidence --

export async function uploadEvidence(defectId: string, file: File): Promise<EvidenceDescriptor> {
    const form = new FormData();
    form.append("file", file);
    return json(
        await fetchApi(`/api/manufacturing/defects/${defectId}/evidence`, {
            method: "POST",
            body: form,
        }),
        "Failed to upload evidence.",
    );
}

export async function deleteEvidence(defectId: string, digest: string): Promise<void> {
    await json(
        await fetchApi(`/api/manufacturing/defects/${defectId}/evidence/${digest}`, {
            method: "DELETE",
        }),
        "Failed to delete evidence.",
    );
}

export function evidenceUrl(runId: string, digest: string): string {
    return `/api/manufacturing/runs/${runId}/evidence/${digest}`;
}

// Re-export types so consumers can import from one place.
export type { BoardSpec, EvidenceDescriptor, Manufacturer, ManufacturingRun, RunDefect };
