import { ChevronDown, ChevronRight } from "lucide-react";

import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import {
    effectiveFieldValue,
    sectionProgress,
    visibleFields,
    type SpecFieldDef,
    type SpecSectionDef,
} from "@/types/manufacturing";
import { OptionRow, ProvenanceMarker, type Provenance } from "./option-row";
import { CompactSelect } from "./ui";

export type SpecValues = Record<string, unknown>;

interface SpecSectionProps {
    section: SpecSectionDef;
    values: SpecValues;
    source: Record<string, string>;
    collapsed: boolean;
    active: boolean;
    canEdit: boolean;
    onToggleCollapsed: () => void;
    onToggleActive: (on: boolean) => void;
    onChange: (key: string, value: unknown) => void;
}

// One section of the spec form, as a card: a title with how many of its fields
// are set, then label-left rows. An optional section has an Include switch and
// folds to its header while excluded.
export function SpecSection({
    section,
    values,
    source,
    collapsed,
    active,
    canEdit,
    onToggleCollapsed,
    onToggleActive,
    onChange,
}: SpecSectionProps) {
    const showBody = active && !collapsed;
    // Fields whose gate is unsatisfied are hidden, so options only appear when
    // their controlling field has the right value.
    const fields = visibleFields(section, values);
    const progress = sectionProgress(section, values);
    const sectionKeys = new Set(section.fields.map((f) => f.key));
    return (
        <section className={cn("border", !active && "bg-muted/20")}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className={cn(
                        "flex min-w-0 items-center gap-1.5 text-sm font-medium hover:text-foreground",
                        !active && "text-muted-foreground",
                    )}
                    aria-expanded={showBody}
                >
                    {showBody ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{section.title}</span>
                    {section.optional && (
                        <span className="rounded-none bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                            optional
                        </span>
                    )}
                </button>

                <div className="flex shrink-0 items-center gap-3">
                    {active && progress.total > 0 && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {progress.set} of {progress.total} set
                        </span>
                    )}
                    {section.optional && (
                        <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={`Enable ${section.title}`}
                            disabled={!canEdit}
                            onClick={() => onToggleActive(!active)}
                            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                active ? "bg-primary" : "bg-muted-foreground/30"
                            }`}
                        >
                            <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
                                    active ? "translate-x-3.5" : "translate-x-0.5"
                                }`}
                            />
                        </button>
                    )}
                </div>
            </div>

            {showBody && (
                <div className="border-t px-4 py-2">
                    {fields.map((field) => (
                        <SpecFieldRow
                            key={field.key}
                            field={field}
                            value={values[field.key]}
                            provenance={provenanceOf(field, values, source)}
                            // A sub-option, drawn under the field that unlocks it.
                            nested={Boolean(field.when && sectionKeys.has(field.when.key))}
                            disabled={!canEdit}
                            onChange={(v) => onChange(field.key, v)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function provenanceOf(
    field: SpecFieldDef,
    values: SpecValues,
    source: Record<string, string>,
): Provenance | null {
    const stored = values[field.key];
    const hasStored = stored !== undefined && stored !== null && stored !== "";
    if (hasStored) {
        if (source[field.key] === "extracted") return "extracted";
        if (source[field.key] === "manual") return "manual";
        return null;
    }
    return field.default !== undefined && field.default !== null && field.default !== "" ? "default" : null;
}

// A choice with a few short options reads best as buttons side by side; a long
// or crowded list stays a select.
function isShortChoice(field: SpecFieldDef): boolean {
    return field.options.length > 0 && field.options.length <= 5 && field.options.every((o) => o.length <= 14);
}

interface SpecFieldRowProps {
    field: SpecFieldDef;
    value: unknown;
    provenance: Provenance | null;
    nested: boolean;
    disabled: boolean;
    onChange: (value: unknown) => void;
}

function SpecFieldRow({ field, value, provenance, nested, disabled, onChange }: SpecFieldRowProps) {
    const inputId = `spec-${field.key}`;
    // A stored value wins; otherwise fall back to the schema's declared default.
    const effective = effectiveFieldValue(field, { [field.key]: value });
    const isUnset = effective === undefined || effective === null || effective === "";
    const marker = <ProvenanceMarker provenance={provenance} />;

    // Read-only viewers see the values as text, not disabled inputs.
    if (disabled) {
        let text: string;
        if (isUnset) text = "";
        else if (field.type === "bool") text = effective === true || effective === "true" ? "Yes" : "No";
        else text = field.unit ? `${effective} ${field.unit}` : String(effective);
        return (
            <OptionRow label={field.label} marker={marker} nested={nested}>
                {text ? (
                    <span className="text-sm tabular-nums">{text}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">Not set</span>
                )}
            </OptionRow>
        );
    }

    if (field.type === "bool") {
        const selected = isUnset ? "" : effective === true || effective === "true" ? "yes" : "no";
        return (
            <OptionRow label={field.label} htmlFor={inputId} marker={marker} nested={nested}>
                <SegmentedControl
                    id={inputId}
                    aria-label={field.label}
                    value={selected}
                    onChange={(v) => onChange(v === "yes")}
                    options={[
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                    ]}
                />
            </OptionRow>
        );
    }

    if (field.type === "choice") {
        // Coerce to a string so a number (e.g. an extracted layer count) matches its
        // string option. An unset value stays "" (nothing selected).
        const selected = isUnset ? "" : String(effective);
        const current = field.options.includes(selected) ? selected : "";
        return (
            <OptionRow label={field.label} htmlFor={inputId} marker={marker} nested={nested}>
                {isShortChoice(field) ? (
                    <SegmentedControl
                        id={inputId}
                        aria-label={field.label}
                        value={current}
                        onChange={(v) => onChange(v || undefined)}
                        options={field.options.map((o) => ({ value: o, label: o }))}
                    />
                ) : (
                    <CompactSelect
                        id={inputId}
                        className="h-8 text-sm"
                        widthClass="w-full max-w-sm"
                        value={current}
                        onChange={(e) => onChange(e.target.value || undefined)}
                    >
                        <option value="">Not set</option>
                        {field.options.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </CompactSelect>
                )}
            </OptionRow>
        );
    }

    const isNumber = field.type === "int" || field.type === "number";
    return (
        <OptionRow label={field.label} htmlFor={inputId} marker={marker} nested={nested}>
            <div className={cn("relative", isNumber ? "w-40" : "max-w-sm")}>
                <Input
                    id={inputId}
                    type={isNumber ? "number" : "text"}
                    step={field.type === "int" ? 1 : "any"}
                    placeholder="Not set"
                    className={cn("h-8", isNumber && "tabular-nums", field.unit && "pr-10")}
                    value={isUnset ? "" : String(effective)}
                    onChange={(e) => {
                        const raw = e.target.value;
                        if (isNumber) {
                            onChange(raw === "" ? undefined : Number(raw));
                        } else {
                            onChange(raw || undefined);
                        }
                    }}
                />
                {field.unit && (
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {field.unit}
                    </span>
                )}
            </div>
        </OptionRow>
    );
}
