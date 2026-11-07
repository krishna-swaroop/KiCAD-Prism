import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KicadLibrary, NewKicadLibrary, UpdatePolicy } from "@/types/kicad-libraries";

import { LibraryRefSelect } from "./library-ref-select";
import { intervalLabel, parseVariables, type LibraryPreset } from "./library-status";
import { useRemoteRefs } from "./use-remote-refs";

type Source = "git" | "path";

interface FormValues {
    name: string;
    variables: string;
    source: Source;
    git: string;
    ref: string;
    subdir: string;
    path: string;
    /** Until chosen, a tag is pinned and a branch followed. */
    policy: UpdatePolicy | null;
    interval: number;
}

interface LibraryFormProps {
    /** The library being edited; absent when adding. */
    library?: KicadLibrary;
    /** What a new library starts with. */
    preset?: LibraryPreset;
    intervals: number[];
    pathLibrariesEnabled: boolean;
    busy: boolean;
    error: string | null;
    onSubmit: (values: NewKicadLibrary) => void;
    onCancel: () => void;
}

const DEFAULT_INTERVAL = 86400;

function initialValues(library: KicadLibrary | undefined, preset: LibraryPreset): FormValues {
    return {
        name: library?.name ?? preset.name ?? "",
        variables: library?.variables.join(", ") ?? preset.variables ?? "",
        source: library?.kind === "path" ? "path" : "git",
        git: library?.git ?? preset.git ?? "",
        ref: library?.ref ?? "",
        subdir: library?.subdir ?? "",
        path: library?.path ?? "",
        policy: library?.updatePolicy ?? preset.policy ?? null,
        interval: library?.checkIntervalSeconds ?? DEFAULT_INTERVAL,
    };
}

function toLibrary(values: FormValues, ref: string, policy: UpdatePolicy): NewKicadLibrary {
    const base = { name: values.name.trim(), variables: parseVariables(values.variables) };
    if (values.source === "path") return { ...base, path: values.path.trim() };
    return {
        ...base,
        git: values.git.trim(),
        ref,
        subdir: values.subdir.trim(),
        updatePolicy: policy,
        checkIntervalSeconds: values.interval,
    };
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

const POLICY_HINTS: Record<UpdatePolicy, string> = {
    follow: "Prism checks the tag or branch and fetches new commits by itself. Follow only repositories you trust as much as your own.",
    pinned: "Prism stays on one commit. A moved tag or branch is shown here and nothing is fetched until you update it.",
};

export function LibraryForm({ library, preset = {}, intervals, pathLibrariesEnabled, busy, error, onSubmit, onCancel }: LibraryFormProps) {
    const editing = library !== undefined;
    const [values, setValues] = useState<FormValues>(() => initialValues(library, preset));
    const set = (changes: Partial<FormValues>) => setValues((previous) => ({ ...previous, ...changes }));
    const isGit = values.source === "git";
    const refs = useRemoteRefs(isGit && !editing ? values.git : "");
    // Until a choice is made, the repository's default branch is the ref.
    const ref = values.ref || refs.defaultBranch || "";
    const policy = values.policy ?? (refs.tags.includes(ref) ? "pinned" : "follow");
    const knownRefs = editing ? refs.status === "idle" || refs.status === "ready" : refs.status === "ready";
    const complete =
        values.name.trim() !== "" &&
        parseVariables(values.variables).length > 0 &&
        (isGit ? knownRefs && ref !== "" : values.path.trim() !== "");

    return (
        <form
            className="flex flex-col gap-4 max-w-xl"
            onSubmit={(event) => {
                event.preventDefault();
                onSubmit(toLibrary(values, ref, policy));
            }}
        >
            {preset.note && !editing && <p className="text-sm text-muted-foreground">{preset.note}</p>}
            <Field id="library-name" label="Name" hint="Letters, digits, dots, dashes and underscores.">
                <Input id="library-name" value={values.name} disabled={editing} onChange={(event) => set({ name: event.target.value })} />
            </Field>
            <Field id="library-variables" label="Path variables" hint="The variables boards use to reach this library, such as LSF_KICAD_LIB. Separate several with commas.">
                <Input id="library-variables" value={values.variables} onChange={(event) => set({ variables: event.target.value })} />
            </Field>

            {!editing && pathLibrariesEnabled && (
                <div className="flex gap-2" role="radiogroup" aria-label="Source">
                    <Button type="button" size="sm" variant={isGit ? "secondary" : "ghost"} aria-checked={isGit} role="radio" onClick={() => set({ source: "git" })}>
                        Git repository
                    </Button>
                    <Button type="button" size="sm" variant={isGit ? "ghost" : "secondary"} aria-checked={!isGit} role="radio" onClick={() => set({ source: "path" })}>
                        Folder on the server
                    </Button>
                </div>
            )}

            {isGit ? (
                <>
                    <Field id="library-git" label="Repository" hint={editing ? "Remove the library to point it at another repository." : "An https:// address. It is checked as you type."}>
                        <Input id="library-git" value={values.git} disabled={editing} placeholder="https://gitlab.com/org/library.git" onChange={(event) => set({ git: event.target.value, ref: "" })} />
                    </Field>
                    {editing ? (
                        <Field id="library-ref" label="Tag or branch">
                            <Input id="library-ref" value={ref} onChange={(event) => set({ ref: event.target.value })} />
                        </Field>
                    ) : (
                        <Field id="library-ref" label="Tag or branch">
                            <LibraryRefSelect id="library-ref" value={ref} refs={refs} onChange={(picked) => set({ ref: picked })} />
                        </Field>
                    )}
                    <Field id="library-subdir" label="Folder inside the repository" hint="Optional. The variables point here instead of the repository root.">
                        <Input id="library-subdir" value={values.subdir} onChange={(event) => set({ subdir: event.target.value })} />
                    </Field>
                    <Field id="library-policy" label="Updates" hint={POLICY_HINTS[policy]}>
                        <Select value={policy} onValueChange={(picked) => set({ policy: picked as UpdatePolicy })}>
                            <SelectTrigger id="library-policy" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="follow">Follow the tag or branch</SelectItem>
                                <SelectItem value="pinned">Stay pinned at one commit</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field id="library-interval" label="Check for changes" hint="How often Prism asks the repository whether the tag or branch moved.">
                        <Select value={String(values.interval)} onValueChange={(picked) => set({ interval: Number(picked) })}>
                            <SelectTrigger id="library-interval" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {intervals.map((seconds) => (
                                    <SelectItem key={seconds} value={String(seconds)}>{intervalLabel(seconds)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </>
            ) : (
                <Field id="library-path" label="Folder" hint="Relative to the library mount root on the server.">
                    <Input id="library-path" value={values.path} disabled={editing} onChange={(event) => set({ path: event.target.value })} />
                </Field>
            )}

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="flex gap-2">
                <Button type="submit" disabled={busy || !complete}>{editing ? "Save" : "Add library"}</Button>
                <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
        </form>
    );
}
