import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { ProjectCommit, ReleaseSource } from "../types";

export function SourceStep({
    commits,
    commitSha,
    commitsLoading,
    source,
    variant,
    bomPreset,
    canMutate,
    busy,
    onCommit,
    onBoard,
    onSchematic,
    onVariant,
    onBomPreset,
    onContinue,
}: {
    commits: ProjectCommit[];
    commitSha: string;
    commitsLoading: boolean;
    source: ReleaseSource | null;
    variant: string;
    bomPreset: string;
    canMutate: boolean;
    busy: string;
    onCommit: (sha: string) => void;
    onBoard: (value: string) => void;
    onSchematic: (value: string) => void;
    onVariant: (value: string) => void;
    onBomPreset: (value: string) => void;
    onContinue: () => void;
}) {
    const ready = Boolean(commitSha && source?.board && source.schematic);
    // The default design is always an explicit choice, even when the revision
    // has named variants. Its stored value is the executor's `default`
    // sentinel, never a presentation label.
    const variantOptions = Array.from(
        new Set(["default", ...(source?.variants ?? [])].filter(Boolean)),
    );
    const selectedVariant = variantOptions.includes(variant) ? variant : "default";
    return (
        <div className="space-y-5">
            <h3 className="text-lg font-semibold">Source</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Revision" htmlFor="rs-source-commit">
                    <select
                        id="rs-source-commit"
                        value={commitSha}
                        disabled={commitsLoading || Boolean(busy)}
                        onChange={(event) => onCommit(event.target.value)}
                        className="flex h-9 w-full border border-input bg-background px-3 py-1.5 font-mono text-xs leading-none"
                    >
                        {commits.map((commit) => (
                            <option key={commit.full_hash} value={commit.full_hash}>
                                {commit.hash} · {commit.message}
                            </option>
                        ))}
                        {!commits.some((commit) => commit.full_hash === commitSha) && /^[a-f0-9]{40}$/i.test(commitSha) && (
                            <option value={commitSha}>{commitSha.slice(0, 7)} · pasted SHA</option>
                        )}
                    </select>
                </Field>
                <Field label="Or paste a full SHA" htmlFor="rs-source-sha">
                    <Input
                        id="rs-source-sha"
                        value={commits.some((commit) => commit.full_hash === commitSha) ? "" : commitSha}
                        placeholder="40-character Git SHA"
                        disabled={Boolean(busy)}
                        className="font-mono text-xs"
                        onChange={(event) => onCommit(event.target.value.trim())}
                    />
                </Field>
                <Field label="Variant" htmlFor="rs-source-variant">
                    <select
                        id="rs-source-variant"
                        value={selectedVariant}
                        disabled={Boolean(busy)}
                        onChange={(event) => onVariant(event.target.value)}
                        className="flex h-9 w-full border border-input bg-background px-3 py-1.5 text-sm leading-none"
                    >
                        {variantOptions.map((item) => (
                            <option key={item} value={item}>
                                {item === "default" ? "Default" : item}
                            </option>
                        ))}
                    </select>
                </Field>
                <FileSelect label="Board" value={source?.board ?? ""} options={source?.boards ?? []} onChange={onBoard} disabled={Boolean(busy)} />
                <FileSelect label="Schematic" value={source?.schematic ?? ""} options={source?.schematics ?? []} onChange={onSchematic} disabled={Boolean(busy)} />
                <Field label="BOM preset">
                    <Select value={bomPreset} onValueChange={onBomPreset} disabled={!source?.bom_presets.length || Boolean(busy)}>
                        <SelectTrigger id="rs-source-bom" className="w-full">
                            <SelectValue placeholder="KiCad BOM preset" />
                        </SelectTrigger>
                        <SelectContent>
                            {(source?.bom_presets ?? []).map((item) => (
                                <SelectItem key={item} value={item}>{item}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            </div>
            {canMutate && (
                <Button disabled={!ready || Boolean(busy)} onClick={onContinue}>
                    Continue
                </Button>
            )}
        </div>
    );
}

function FileSelect({
    label,
    value,
    options,
    onChange,
    disabled,
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    return (
        <Field label={label}>
            <select
                value={value}
                disabled={disabled || options.length === 0}
                onChange={(event) => onChange(event.target.value)}
                className="flex h-9 w-full border border-input bg-background px-3 py-1.5 font-mono text-xs leading-none"
            >
                {options.length === 0 && <option value="">None found</option>}
                {options.map((item) => (
                    <option key={item} value={item}>{item}</option>
                ))}
            </select>
        </Field>
    );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
    const id = htmlFor ?? `rs-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            {children}
        </div>
    );
}

export default SourceStep;
