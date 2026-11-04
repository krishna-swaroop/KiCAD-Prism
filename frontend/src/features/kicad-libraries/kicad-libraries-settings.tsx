import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { ConfirmDialog, useConfirmTarget } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    checkLibraryNow,
    createLibrary,
    deleteLibrary,
    fetchLibraryAgain,
    freezeLibrary,
    pinLibraryAt,
    refreshLibrary,
    unfreezeLibrary,
    updateLibrary,
    updateLibraryNow,
} from "@/lib/kicad-libraries-client";
import type { KicadLibrary, NewKicadLibrary } from "@/types/kicad-libraries";

import { LibraryForm } from "./library-form";
import { LibraryRow, type LibraryActions } from "./library-row";
import { STOCK_3D_PRESET, STOCK_3D_VARIABLES, type LibraryPreset } from "./library-status";
import { LibraryVersions } from "./library-versions";
import { UnboundVariables } from "./unbound-variables";
import { useKicadLibraries, useLibraryActions } from "./use-kicad-libraries";

type View = { kind: "list" } | { kind: "add"; preset: LibraryPreset } | { kind: "edit"; library: KicadLibrary };
type Confirm = { action: "remove" | "update"; library: KicadLibrary };

function projectsLine(count: number): string {
    return count === 0 ? "No project uses it yet." : `Boards in ${count} project${count === 1 ? "" : "s"} refresh their 3D parts.`;
}

export function KicadLibrariesSettings() {
    const { list, error, reload } = useKicadLibraries();
    const { busy, run } = useLibraryActions(reload);
    const [searchParams, setSearchParams] = useSearchParams();
    // A board names a variable nothing defines: the 3D tab links here with the variable in the URL.
    const wanted = searchParams.get("variable");
    const [view, setView] = useState<View>(() => (wanted ? { kind: "add", preset: { variables: wanted } } : { kind: "list" }));
    const confirm = useConfirmTarget<Confirm>();
    const versions = useConfirmTarget<KicadLibrary>();

    const back = () => {
        setView({ kind: "list" });
        if (wanted) {
            const next = new URLSearchParams(searchParams);
            next.delete("variable");
            setSearchParams(next, { replace: true });
        }
    };

    const save = async (values: NewKicadLibrary) => {
        const editing = view.kind === "edit" ? view.library : null;
        const saved = await run(
            () => editing
                ? updateLibrary(editing, {
                    variables: values.variables,
                    ref: values.ref,
                    subdir: values.subdir,
                    updatePolicy: values.updatePolicy,
                    checkIntervalSeconds: values.checkIntervalSeconds,
                })
                : createLibrary(values),
            "Failed to save the library",
        );
        if (saved) back();
    };

    const actions: LibraryActions = {
        edit: (library) => setView({ kind: "edit", library }),
        fetchAgain: (library) => void run(() => fetchLibraryAgain(library), "Failed to start the fetch"),
        checkNow: (library) => void run(async () => {
            const result = await checkLibraryNow(library);
            if (result.error) throw new Error(result.error);
        }, "Failed to check the repository", "Checked the repository"),
        updateNow: (library) => confirm.request({ action: "update", library }),
        toggleFreeze: (library) => void run(
            () => (library.updatePolicy === "pinned" ? unfreezeLibrary(library) : freezeLibrary(library)),
            "Failed to change the update policy",
        ),
        showVersions: versions.request,
        refresh: (library) => void run(() => refreshLibrary(library), "Failed to refresh the library", "Boards using it refresh their 3D parts"),
        remove: (library) => confirm.request({ action: "remove", library }),
    };

    if (view.kind !== "list") {
        return (
            <section className="flex flex-col gap-4">
                <Button variant="ghost" size="sm" className="self-start" onClick={back}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> KiCad libraries
                </Button>
                <h3 className="text-lg font-semibold">{view.kind === "edit" ? `Edit ${view.library.name}` : "Add a library"}</h3>
                <LibraryForm
                    library={view.kind === "edit" ? view.library : undefined}
                    preset={view.kind === "add" ? view.preset : undefined}
                    intervals={list?.checkIntervals ?? [3600, 21600, 86400, 604800]}
                    pathLibrariesEnabled={list?.pathLibrariesEnabled ?? false}
                    busy={busy}
                    error={null}
                    onSubmit={(values) => void save(values)}
                    onCancel={back}
                />
            </section>
        );
    }

    const stockMissing = list !== null && !list.libraries.some((library) => library.variables.some((name) => STOCK_3D_VARIABLES.includes(name)))
        && !list.usage.some((row) => STOCK_3D_VARIABLES.includes(row.variable) && row.bound);

    return (
        <section className="flex flex-col gap-4">
            {/* The dialog's close icon sits in the top right, so the action goes below the text. */}
            <div className="flex flex-col items-start gap-3">
                <div>
                    <h3 className="text-lg font-semibold">KiCad libraries</h3>
                    <p className="text-sm text-muted-foreground max-w-xl">Add project dependencies and libraries.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setView({ kind: "add", preset: {} })}>
                        <Plus className="mr-1 h-4 w-4" /> Add library
                    </Button>
                    {stockMissing && (
                        <Button size="sm" variant="outline" onClick={() => setView({ kind: "add", preset: STOCK_3D_PRESET })}>
                            Add KiCad&apos;s 3D models
                        </Button>
                    )}
                </div>
            </div>

            {error && !list && <p className="text-sm text-destructive" role="alert">{error}</p>}
            {!list && !error && <Skeleton className="h-24 w-full" />}
            {list && <UnboundVariables usage={list.usage} onAdd={(variable) => setView({ kind: "add", preset: { variables: variable } })} />}
            {list && list.libraries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No libraries yet. Boards that use a library Prism does not have render without those models.
                </p>
            )}
            {list && list.libraries.length > 0 && (
                <ul className="flex flex-col gap-3">
                    {list.libraries.map((library) => (
                        <LibraryRow key={library.name} library={library} busy={busy} actions={actions} />
                    ))}
                </ul>
            )}

            <LibraryVersions
                library={versions.target}
                busy={busy}
                onUse={(library, commit) => {
                    void run(() => pinLibraryAt(library, commit), "Failed to use that version", "Pinned; boards using it refresh their 3D parts")
                        .then((done) => { if (done) versions.clear(); });
                }}
                onClose={versions.clear}
            />

            <ConfirmDialog
                open={confirm.open}
                onOpenChange={(next) => { if (!next) confirm.clear(); }}
                title={confirm.target?.action === "remove" ? "Remove library" : "Update library"}
                destructive={confirm.target?.action === "remove"}
                description={
                    confirm.target?.action === "remove"
                        ? `${confirm.target.library.name} stops being served at once and its files are deleted after a grace period. Boards that use ${confirm.target.library.variables.join(", ")} render without those models until it is added again. ${projectsLine(confirm.target.library.projectsUsing)}`
                        : `${confirm.target?.library.name ?? ""} moves to where ${confirm.target?.library.ref ?? "its ref"} points now. ${projectsLine(confirm.target?.library.projectsUsing ?? 0)}`
                }
                confirmLabel={confirm.target?.action === "remove" ? "Remove library" : "Update library"}
                busy={busy}
                onConfirm={() => {
                    const target = confirm.target;
                    if (!target) return;
                    const work = target.action === "remove"
                        ? run(() => deleteLibrary(target.library), "Failed to remove the library")
                        : run(() => updateLibraryNow(target.library), "Failed to update the library", "Fetching the new commit");
                    void work.then(confirm.clear);
                }}
            />
        </section>
    );
}
