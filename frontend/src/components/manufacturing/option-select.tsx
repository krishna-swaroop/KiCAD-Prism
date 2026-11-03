import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix items cannot have an empty value, so "nothing chosen" travels as this one.
const NONE = "__none__";

export interface SelectOption {
    value: string;
    label: string;
}

interface OptionSelectProps {
    id?: string;
    "aria-label"?: string;
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    /** Shown while nothing is chosen. */
    placeholder?: string;
    /** Adds a first option that sets the value back to "" (e.g. "Not set"). */
    emptyLabel?: string;
    /** Put the empty option after the others instead of before. */
    emptyLast?: boolean;
    size?: "sm" | "default";
    disabled?: boolean;
    className?: string;
}

/** The shared `Select` for a plain list of options: the "" value is handled once, here. */
export function OptionSelect({
    id,
    "aria-label": ariaLabel,
    value,
    onValueChange,
    options,
    placeholder,
    emptyLabel,
    emptyLast = false,
    size = "default",
    disabled,
    className,
}: OptionSelectProps) {
    return (
        <Select
            value={value === "" && emptyLabel ? NONE : value}
            onValueChange={(next) => onValueChange(next === NONE ? "" : next)}
            disabled={disabled}
        >
            <SelectTrigger id={id} aria-label={ariaLabel} size={size} className={cn("w-full", className)}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {emptyLabel && !emptyLast && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
                {emptyLabel && emptyLast && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
            </SelectContent>
        </Select>
    );
}
