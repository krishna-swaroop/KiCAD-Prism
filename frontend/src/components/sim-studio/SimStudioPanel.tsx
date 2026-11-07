import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Activity, Loader2, Thermometer, Waves, Zap } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

import * as api from "./api";
import { DcDropStudio, type StudioControls, type StudioProps } from "./dc-drop/DcDropStudio";
import type { StudioTab } from "./dc-drop/power-tree-session";
import { installSimStudioScriptApi } from "./script-api";
import type { CatalogEntry } from "./types";

type Props = {
    projectId: string;
    canMutate: boolean;
    /** The Studio section is on screen (keyboard shortcuts only fire then). */
    active?: boolean;
    /** The branch head, for a studio whose setup follows HEAD. */
    headCommit?: string;
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    "dc-drop": Zap,
    "ac-pdn": Waves,
    decoupling: Activity,
    thermal: Thermometer,
};

/**
 * Each simulation kind's own studio (sim-adr-0017: a setup UI built for that
 * simulation alone). A kind opens when the backend's catalogue lists it as
 * available and it has a studio here; a new analysis adds its entry.
 */
const STUDIOS: Record<string, ComponentType<StudioProps>> = {
    "dc-drop": DcDropStudio,
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Simulation Studio (sim-adr-0017): a card per simulation; opening one gives
 * that simulation its own full view, with nothing of the others in it. The
 * open simulation, setup and tab live in the URL (`sim`, `setup`, `view`).
 * `window.prismSimStudio` (./script-api.ts) drives the same views.
 */
export function SimStudioPanel({ projectId, canMutate, active = true, headCommit }: Props) {
    const [params, setParams] = useSearchParams();
    const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
    const studio = useRef<StudioControls | null>(null);
    const kind = params.get("sim");
    const setupId = params.get("setup");
    const tab: StudioTab = params.get("view") === "results" ? "results" : "setup";

    // react-router does not queue functional updates: two in one tick would
    // each start from the same URL. Build on the last URL we asked for.
    const latest = useRef(params);
    useEffect(() => { latest.current = params; }, [params]);
    const update = useCallback((values: Record<string, string | null>) => {
        const next = new URLSearchParams(latest.current);
        for (const [key, value] of Object.entries(values)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
        }
        latest.current = next;
        setParams(next);
    }, [setParams]);
    const openSimulation = useCallback((value: string | null) => update({ sim: value, setup: null, view: null }), [update]);
    const openSetup = useCallback((value: string | null) => update({ setup: value }), [update]);
    const setTab = useCallback((value: StudioTab) => update({ view: value === "results" ? "results" : null }), [update]);

    useEffect(() => {
        let cancelled = false;
        api.readCatalog()
            .then((value) => { if (!cancelled) setCatalog(value.entries); })
            .catch((error) => toast.error(message(error)));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => installSimStudioScriptApi(projectId, {
        onChange: (changed) => {
            if (changed && changed === studio.current?.setupId) studio.current.reload();
        },
        onOpen: (value) => update({ sim: latest.current.get("sim") ?? "dc-drop", setup: value }),
        onView: (runId) => {
            update({ sim: latest.current.get("sim") ?? "dc-drop", view: "results" });
            window.setTimeout(() => studio.current?.view(runId), 0);
        },
        onSimulation: openSimulation,
        onTab: setTab,
        onSelect: (node) => studio.current?.select(node),
        headCommit,
    }), [headCommit, projectId, update, openSimulation, setTab]);

    const Studio = kind ? STUDIOS[kind] : undefined;
    if (Studio) {
        return (
            <Studio
                projectId={projectId}
                canMutate={canMutate}
                active={active}
                setupId={setupId}
                tab={tab}
                headCommit={headCommit}
                onSetupChange={openSetup}
                onTabChange={setTab}
                onBack={() => openSimulation(null)}
                controls={studio}
            />
        );
    }

    return (
        <div className="h-full overflow-auto p-6">
            <div className="mx-auto max-w-5xl">
                <h2 className="mb-6 text-lg font-semibold">Simulation Studio</h2>
                {catalog === null && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {catalog?.map((entry) => {
                        const Icon = ICONS[entry.kind] ?? Activity;
                        const available = entry.status === "available" && entry.kind in STUDIOS;
                        return (
                            <button
                                key={entry.kind}
                                type="button"
                                disabled={!available}
                                onClick={() => openSimulation(entry.kind)}
                                className="flex flex-col items-start rounded-lg border bg-card p-6 text-left text-card-foreground shadow-sm transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <div className="mb-4 flex w-full items-start justify-between">
                                    <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-6 w-6" /></div>
                                    {!available && <Badge variant="outline">Planned</Badge>}
                                </div>
                                <h3 className="mb-1 font-semibold">{entry.display_name}</h3>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
