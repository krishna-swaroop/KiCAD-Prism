import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface CopyFieldProps {
    label: string;
    value: string | null;
    /** Names the copy button, e.g. "Copy webhook URL". */
    copyLabel: string;
    hint?: string;
}

/** A read-only value an admin pastes into another system, with a copy button. */
export function CopyField({ label, value, copyLabel, hint }: CopyFieldProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    const copy = async () => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        } catch {
            toast.error("Copy failed; select the address and copy it.");
        }
    };

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <div className="flex items-center gap-2">
                <code
                    className="min-w-0 flex-1 truncate border border-input bg-muted/40 px-2 py-1.5 font-mono text-[11px]"
                    title={value ?? undefined}
                >
                    {value ?? "…"}
                </code>
                <Button type="button" size="sm" variant="outline" disabled={!value} onClick={() => void copy()} aria-label={copyLabel}>
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied ? "Copied" : "Copy"}
                </Button>
            </div>
            {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
    );
}
