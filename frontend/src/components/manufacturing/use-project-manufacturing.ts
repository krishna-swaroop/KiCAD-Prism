import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
    attachManufacturer,
    detachManufacturer,
    downloadSpecSheet,
    applyTemplateToSpec,
    extractBoardSpec,
    extractPcbRules,
    getPcbRuleFields,
    getProjectSpec,
    getProjectSpecForManufacturer,
    listManufacturers,
    listProjectManufacturers,
    listRuns,
    listTemplates,
    updateProjectSpec,
} from "@/lib/manufacturing";
import type {
    CapabilityMeta,
    Manufacturer,
    ManufacturingRun,
    ParsedSpecConfig,
    PcbRuleField,
    ProjectManufacturer,
    SpecTemplate,
} from "@/types/manufacturing";
import type { SpecValues } from "./spec-form";

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

// --- the project's manufacturers and productions --------------------------------------------

interface ProjectData {
    manufacturers: ProjectManufacturer[];
    runs: ManufacturingRun[];
    /** The global directory, for the "add manufacturer" picker. */
    allManufacturers: Manufacturer[];
}

const NO_DATA: ProjectData = { manufacturers: [], runs: [], allManufacturers: [] };

/**
 * What a project's Manufacturing tab is about: the manufacturers attached to it, its
 * productions, which manufacturer is selected, and attaching or removing one.
 */
export function useProjectData(projectId: string) {
    const [data, setData] = useState<ProjectData>(NO_DATA);
    const [loading, setLoading] = useState(true);
    const [manufacturerId, setManufacturerId] = useState("");
    const [detaching, setDetaching] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [manufacturers, runs, allManufacturers] = await Promise.all([
                listProjectManufacturers(projectId),
                listRuns(projectId),
                listManufacturers().catch(() => [] as Manufacturer[]),
            ]);
            setData({ manufacturers, runs, allManufacturers });
            // Keep the current selection if it is still attached, else pick the first.
            setManufacturerId((current) =>
                manufacturers.some((m) => m.id === current) ? current : (manufacturers[0]?.id ?? ""),
            );
        } catch (error) {
            toast.error(message(error, "Failed to load manufacturing data."));
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void load();
    }, [load]);

    // Re-read just the runs after a change, without blanking the whole tab.
    const reloadRuns = useCallback(async () => {
        try {
            const runs = await listRuns(projectId);
            setData((current) => ({ ...current, runs }));
        } catch (error) {
            toast.error(message(error, "Failed to refresh production."));
        }
    }, [projectId]);

    const attach = async (id: string) => {
        try {
            await attachManufacturer(projectId, id);
            await load();
            setManufacturerId(id);
        } catch (error) {
            toast.error(message(error, "Failed to add manufacturer."));
        }
    };

    /** Remove a manufacturer from the project; resolves whether it worked. */
    const detach = async (id: string): Promise<boolean> => {
        setDetaching(true);
        try {
            await detachManufacturer(projectId, id);
            await load();
            return true;
        } catch (error) {
            toast.error(message(error, "Failed to remove manufacturer."));
            return false;
        } finally {
            setDetaching(false);
        }
    };

    return { ...data, loading, manufacturerId, setManufacturerId, detaching, load, reloadRuns, attach, detach };
}

// --- the board's own rules ------------------------------------------------------------------

/**
 * The KiCad rule fields, and the board's rules read automatically so the capability check
 * can compare against them without being asked. Silent: a board with no readable rules just
 * leaves the comparison empty.
 */
export function useBoardRules(projectId: string) {
    const [rules, setRules] = useState<{ fields: PcbRuleField[]; board: Record<string, unknown> | null }>({
        fields: [],
        board: null,
    });

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            getPcbRuleFields().then(({ fields }) => fields).catch(() => [] as PcbRuleField[]),
            extractPcbRules(projectId).then(({ rules: board }) => board).catch(() => null),
        ]).then(([fields, board]) => {
            if (!cancelled) setRules({ fields, board });
        });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    return { ruleFields: rules.fields, boardRules: rules.board };
}

// --- a manufacturer's one spec --------------------------------------------------------------

/**
 * A manufacturer has exactly one spec, created on first read. Find it, and the manufacturer's
 * processes, so the picker can swap which one the spec uses.
 */
export function useSpecIdentity(projectId: string, manufacturerId: string) {
    const [identity, setIdentity] = useState<{ specId: string; templates: SpecTemplate[] }>({
        specId: "",
        templates: [],
    });

    useEffect(() => {
        if (!manufacturerId) {
            setIdentity({ specId: "", templates: [] });
            return;
        }
        let cancelled = false;
        void Promise.all([
            getProjectSpecForManufacturer(projectId, manufacturerId)
                .then((spec) => spec.id)
                .catch(() => ""),
            listTemplates(manufacturerId).catch(() => [] as SpecTemplate[]),
        ]).then(([specId, templates]) => {
            if (!cancelled) setIdentity({ specId, templates });
        });
        return () => {
            cancelled = true;
        };
    }, [projectId, manufacturerId]);

    return identity;
}

/** Everything the form shows about the selected spec, as it was last loaded or edited. */
export interface SpecSnapshot {
    values: SpecValues;
    source: Record<string, string>;
    schema: ParsedSpecConfig;
    /** Optional sections that are switched on. */
    activeSections: Set<string>;
    /** The linked process's capabilities, read live. */
    capabilities: Record<string, number>;
    capabilityMeta: Record<string, CapabilityMeta>;
    templateName: string | null;
    /** The linked process's id, needed to edit its capability text. */
    templateId: string | null;
}

const EMPTY_SNAPSHOT: SpecSnapshot = {
    values: {},
    source: {},
    schema: { sections: [], errors: [] },
    activeSections: new Set(),
    capabilities: {},
    capabilityMeta: {},
    templateName: null,
    templateId: null,
};

function snapshotOf(spec: Awaited<ReturnType<typeof getProjectSpec>>): SpecSnapshot {
    return {
        values: spec.specs ?? {},
        source: spec.source ?? {},
        schema: spec.parsed,
        activeSections: new Set(spec.active_sections ?? []),
        capabilities: spec.template_capabilities ?? {},
        capabilityMeta: spec.template_capability_meta ?? {},
        templateName: spec.template_name ?? null,
        templateId: spec.template_id ?? null,
    };
}

export type BusyKind = "saving" | "extracting" | "downloading" | "applying";

/**
 * The selected spec's form: load it, edit it, and the actions on it (save, discard, fill from
 * the board, switch process, download the PDF). `dirty` is whether there are unsaved edits.
 */
export function useSpecForm(projectId: string, specId: string) {
    const [snapshot, setSnapshot] = useState<SpecSnapshot>(EMPTY_SNAPSHOT);
    const [dirty, setDirty] = useState(false);
    const [phase, setPhase] = useState<{ loading: boolean; busy: BusyKind | null }>({ loading: false, busy: null });
    // Which sections are folded in the UI (per session, not saved).
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    // Reload the saved spec into the form (after a process swap, an edit, or a discard).
    const reload = useCallback(async () => {
        if (!specId) return;
        setSnapshot(snapshotOf(await getProjectSpec(specId)));
        setDirty(false);
    }, [specId]);

    useEffect(() => {
        if (!specId) {
            setSnapshot(EMPTY_SNAPSHOT);
            setDirty(false);
            return;
        }
        let cancelled = false;
        setPhase((p) => ({ ...p, loading: true }));
        void getProjectSpec(specId)
            .then((spec) => {
                if (cancelled) return;
                setSnapshot(snapshotOf(spec));
                setDirty(false);
            })
            .catch((error) => {
                if (!cancelled) toast.error(message(error, "Failed to load the spec."));
            })
            .finally(() => {
                if (!cancelled) setPhase((p) => ({ ...p, loading: false }));
            });
        return () => {
            cancelled = true;
        };
    }, [specId]);

    const busyWith = async (kind: BusyKind, work: () => Promise<void>) => {
        setPhase((p) => ({ ...p, busy: kind }));
        try {
            await work();
        } finally {
            setPhase((p) => ({ ...p, busy: null }));
        }
    };

    const setField = (key: string, value: unknown) => {
        setSnapshot((s) => ({
            ...s,
            values: { ...s.values, [key]: value },
            source: { ...s.source, [key]: "manual" },
        }));
        setDirty(true);
    };

    const toggleCollapsed = (title: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(title)) next.delete(title);
            else next.add(title);
            return next;
        });

    const toggleSectionActive = (title: string, on: boolean) => {
        setSnapshot((s) => {
            const activeSections = new Set(s.activeSections);
            if (on) activeSections.add(title);
            else activeSections.delete(title);
            return { ...s, activeSections };
        });
        setDirty(true);
    };

    const extract = () =>
        busyWith("extracting", async () => {
            try {
                const { suggested, reason } = await extractBoardSpec(projectId);
                const keys = Object.keys(suggested);
                if (keys.length === 0) {
                    toast.info(reason ?? "Nothing could be read from the board.");
                    return;
                }
                setSnapshot((s) => {
                    const source = { ...s.source };
                    for (const key of keys) source[key] = "extracted";
                    return { ...s, values: { ...s.values, ...suggested }, source };
                });
                setDirty(true);
                toast.success(`Filled ${keys.length} field(s) from the board. Review and save.`);
            } catch (error) {
                toast.error(message(error, "Failed to read the board."));
            }
        });

    const save = () =>
        busyWith("saving", async () => {
            if (!specId) return;
            try {
                await updateProjectSpec(specId, {
                    specs: snapshot.values,
                    source: snapshot.source,
                    active_sections: [...snapshot.activeSections],
                });
                setDirty(false);
                toast.success("Spec saved.");
            } catch (error) {
                toast.error(message(error, "Failed to save."));
            }
        });

    const discard = async () => {
        try {
            await reload();
        } catch (error) {
            toast.error(message(error, "Failed to reload the spec."));
        }
    };

    // Swap which of the manufacturer's processes this spec uses. Re-links it, so its fields and
    // its capabilities both move to the chosen process.
    const applyProcess = (templateId: string) =>
        busyWith("applying", async () => {
            if (!specId) return;
            try {
                await applyTemplateToSpec(specId, templateId);
                await reload();
                toast.success("Process applied.");
            } catch (error) {
                toast.error(message(error, "Failed to apply process."));
            }
        });

    const downloadPdf = () =>
        busyWith("downloading", async () => {
            try {
                await downloadSpecSheet(projectId, specId || undefined);
            } catch (error) {
                toast.error(message(error, "Failed to download the spec sheet."));
            }
        });

    return {
        ...snapshot,
        dirty,
        loading: phase.loading,
        busy: phase.busy,
        collapsed,
        setField,
        toggleCollapsed,
        toggleSectionActive,
        extract,
        save,
        discard,
        reload,
        applyProcess,
        downloadPdf,
        markClean: () => setDirty(false),
    };
}

export type SpecForm = ReturnType<typeof useSpecForm>;
