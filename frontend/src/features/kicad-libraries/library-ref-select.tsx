import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { RemoteRefs } from "./use-remote-refs";

interface LibraryRefSelectProps {
    id: string;
    /** The chosen tag or branch; empty means the repository's default branch. */
    value: string;
    refs: RemoteRefs;
    onChange: (ref: string) => void;
}

const HINTS: Record<RemoteRefs["status"], string> = {
    idle: "Enter the repository address. Its branches and tags load here.",
    checking: "Reading the repository.",
    ready: "",
    failed: "",
};

/** Pick a tag or branch from what the repository really has; empty until the address has been read. */
export function LibraryRefSelect({ id, value, refs, onChange }: LibraryRefSelectProps) {
    const ready = refs.status === "ready";
    const known = refs.tags.includes(value) || refs.branches.includes(value);
    const hint = refs.status === "failed" ? refs.error : HINTS[refs.status];

    return (
        <div className="flex flex-col gap-1.5">
            <Select value={value} onValueChange={onChange} disabled={!ready}>
                <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder={ready ? "Choose a branch or tag" : "Waiting for the repository"} />
                </SelectTrigger>
                <SelectContent>
                    {value !== "" && !known && <SelectItem value={value}>{value} (not in the repository)</SelectItem>}
                    {refs.branches.length > 0 && (
                        <SelectGroup>
                            <SelectLabel>Branches</SelectLabel>
                            {refs.branches.map((name) => (
                                <SelectItem key={`branch:${name}`} value={name}>
                                    {name === refs.defaultBranch ? `${name} (default)` : name}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    )}
                    {refs.tags.length > 0 && (
                        <SelectGroup>
                            <SelectLabel>Tags</SelectLabel>
                            {refs.tags.map((name) => (
                                <SelectItem key={`tag:${name}`} value={name}>{name}</SelectItem>
                            ))}
                        </SelectGroup>
                    )}
                </SelectContent>
            </Select>
            {hint && (
                <p className={refs.status === "failed" ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={refs.status === "failed" ? "alert" : undefined}>
                    {hint}
                </p>
            )}
        </div>
    );
}
