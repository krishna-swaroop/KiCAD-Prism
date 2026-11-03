import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ProjectManufacturer, SpecTemplate } from "@/types/manufacturing";
import type { SpecForm } from "./use-project-manufacturing";

// The one dialog open at a time, with what it needs.
export type ProjectDialog =
    | { kind: "discard"; proceed: () => void }
    | { kind: "process"; id: string }
    | { kind: "detach"; manufacturer: ProjectManufacturer }
    | { kind: "editor" }
    | { kind: "new-run" }
    | null;

interface ProjectConfirmDialogsProps {
    dialog: ProjectDialog;
    onClose: () => void;
    templates: SpecTemplate[];
    form: SpecForm;
    detaching: boolean;
    onDetach: (manufacturerId: string) => Promise<boolean>;
}

/** The three confirmations on the Specs tab: discard edits, switch process, remove a manufacturer. */
export function ProjectConfirmDialogs({
    dialog,
    onClose,
    templates,
    form,
    detaching,
    onDetach,
}: ProjectConfirmDialogsProps): ReactNode {
    const pendingProcess = dialog?.kind === "process" ? templates.find((t) => t.id === dialog.id) : undefined;
    return (
        <>
            <ConfirmDialog
                open={dialog?.kind === "discard"}
                onOpenChange={(open) => !open && onClose()}
                title="Discard unsaved changes?"
                description="This spec has edits that are not saved. Switching now loses them."
                confirmLabel="Discard changes"
                onConfirm={() => {
                    const pending = dialog;
                    onClose();
                    form.markClean();
                    if (pending?.kind === "discard") pending.proceed();
                }}
            />

            <ConfirmDialog
                open={dialog?.kind === "process"}
                onOpenChange={(open) => !open && onClose()}
                title={`Switch to ${pendingProcess?.name ?? "this process"}?`}
                description={
                    <>
                        This spec&rsquo;s fields are replaced by the new process&rsquo;s fields, so any edits made to the
                        fields themselves are lost. Values for fields the new process does not have are hidden but kept.
                        {form.dirty ? " Your unsaved changes to this spec are also discarded." : ""}
                    </>
                }
                confirmLabel="Switch process"
                destructive={false}
                onConfirm={() => {
                    const pending = dialog;
                    onClose();
                    if (pending?.kind === "process") void form.applyProcess(pending.id);
                }}
            />

            <ConfirmDialog
                open={dialog?.kind === "detach"}
                onOpenChange={(open) => !open && onClose()}
                title="Remove manufacturer from this project?"
                description={
                    <>
                        {dialog?.kind === "detach" ? dialog.manufacturer.name : ""} is removed from this project. Its spec
                        and its production are kept and come back if you add it again.
                    </>
                }
                confirmLabel="Remove"
                busy={detaching}
                onConfirm={() => {
                    if (dialog?.kind !== "detach") return;
                    void onDetach(dialog.manufacturer.id).then((removed) => removed && onClose());
                }}
            />
        </>
    );
}
