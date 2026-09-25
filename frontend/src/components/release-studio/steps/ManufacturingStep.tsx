import { useState } from "react";

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
import { cn } from "@/lib/utils";

import * as api from "../api";
import type { IpcOption, ManufacturingChoices, ReleaseManufacturing, VendorProfile } from "../types";

const OTHER = "other";

const FALLBACK_IPC = {
    manufacturing: [
        { value: "IPC-6012 Class 1", label: "IPC-6012 Class 1 — General Electronic Products" },
        { value: "IPC-6012 Class 2", label: "IPC-6012 Class 2 — Dedicated Service Electronic Products" },
        { value: "IPC-6012 Class 3", label: "IPC-6012 Class 3 — High Performance / Harsh Environment" },
        { value: "IPC-6013 Class 1", label: "IPC-6013 Class 1 — Flexible Printed Boards" },
        { value: "IPC-6013 Class 2", label: "IPC-6013 Class 2 — Flexible Printed Boards" },
        { value: "IPC-6013 Class 3", label: "IPC-6013 Class 3 — Flexible Printed Boards" },
        { value: OTHER, label: "Other" },
    ],
    assembly: [
        { value: "IPC-A-610 Class 1", label: "IPC-A-610 Class 1 — General Electronic Products" },
        { value: "IPC-A-610 Class 2", label: "IPC-A-610 Class 2 — Dedicated Service Electronic Products" },
        { value: "IPC-A-610 Class 3", label: "IPC-A-610 Class 3 — High Performance / Harsh Environment" },
        { value: "J-STD-001 Class 1", label: "J-STD-001 Class 1 — Soldering process" },
        { value: "J-STD-001 Class 2", label: "J-STD-001 Class 2 — Soldering process" },
        { value: "J-STD-001 Class 3", label: "J-STD-001 Class 3 — Soldering process" },
        { value: OTHER, label: "Other" },
    ],
    solder_mask_colour: [
        { value: "Green", label: "Green" },
        { value: "Matte Green", label: "Matte Green" },
        { value: "Black", label: "Black" },
        { value: "Matte Black", label: "Matte Black" },
        { value: "White", label: "White" },
        { value: "Red", label: "Red" },
        { value: "Blue", label: "Blue" },
        { value: "Purple", label: "Purple" },
        { value: "Yellow", label: "Yellow" },
        { value: OTHER, label: "Other" },
    ],
    silkscreen_colour: [
        { value: "White", label: "White" },
        { value: "Black", label: "Black" },
        { value: "Yellow", label: "Yellow" },
        { value: OTHER, label: "Other" },
    ],
    via_treatment: [
        { value: "Tented", label: "Tented" },
        { value: "Untented", label: "Untented" },
        { value: "Plugged", label: "Plugged" },
        { value: "Filled", label: "Filled" },
        { value: "Filled and capped", label: "Filled and capped" },
        { value: OTHER, label: "Other" },
    ],
};

export function ManufacturingStep({
    projectId,
    manufacturing,
    ipc,
    profiles,
    canMutate,
    busy,
    impedanceCsv,
    stackupName,
    onChange,
    onImpedanceCsv,
    onStackup,
    onBuild,
    identityComplete = true,
}: {
    projectId: string;
    manufacturing: ReleaseManufacturing;
    ipc: ManufacturingChoices;
    profiles: VendorProfile[];
    canMutate: boolean;
    busy: string;
    impedanceCsv: string;
    stackupName: string;
    onChange: (next: ReleaseManufacturing) => void;
    onImpedanceCsv: (value: string) => void;
    onStackup: (file: File | null) => void;
    onBuild: () => void;
    identityComplete?: boolean;
}) {
    const activeVendors = new Set(manufacturing.vendors);
    return (
        <div className="space-y-5">
            <h3 className="text-lg font-semibold">Manufacturing and assembly</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                <IpcSelect
                    label="Manufacturing IPC class"
                    options={ipc.manufacturing.length ? ipc.manufacturing : FALLBACK_IPC.manufacturing}
                    value={manufacturing.manufacturing_ipc_class}
                    onChange={(value) => onChange({ ...manufacturing, manufacturing_ipc_class: value })}
                    disabled={!canMutate}
                />
                <IpcSelect
                    label="Assembly IPC class"
                    options={ipc.assembly.length ? ipc.assembly : FALLBACK_IPC.assembly}
                    value={manufacturing.assembly_ipc_class}
                    onChange={(value) => onChange({ ...manufacturing, assembly_ipc_class: value })}
                    disabled={!canMutate}
                />
                <IpcSelect
                    label="Solder mask colour"
                    options={ipc.solder_mask_colour?.length ? ipc.solder_mask_colour : FALLBACK_IPC.solder_mask_colour}
                    value={manufacturing.solder_mask_colour}
                    onChange={(value) => onChange({ ...manufacturing, solder_mask_colour: value })}
                    disabled={!canMutate}
                    placeholder="Select a colour"
                    otherPlaceholder="Other colour"
                />
                <IpcSelect
                    label="Silkscreen colour"
                    options={ipc.silkscreen_colour?.length ? ipc.silkscreen_colour : FALLBACK_IPC.silkscreen_colour}
                    value={manufacturing.silkscreen_colour}
                    onChange={(value) => onChange({ ...manufacturing, silkscreen_colour: value })}
                    disabled={!canMutate}
                    placeholder="Select a colour"
                    otherPlaceholder="Other colour"
                />
                <IpcSelect
                    label="Via treatment"
                    options={ipc.via_treatment?.length ? ipc.via_treatment : FALLBACK_IPC.via_treatment}
                    value={manufacturing.via_treatment}
                    onChange={(value) => onChange({ ...manufacturing, via_treatment: value })}
                    disabled={!canMutate}
                    placeholder="Select a treatment"
                    otherPlaceholder="Other treatment"
                />
            </div>
            {profiles.length > 0 && (
                <div className="space-y-2">
                    <Label>Manufacturer packs</Label>
                    <div className="flex flex-wrap gap-2">
                        {profiles.map((profile) => {
                            const active = activeVendors.has(profile.id);
                            return (
                                <button
                                    key={profile.id}
                                    type="button"
                                    aria-pressed={active}
                                    disabled={!canMutate}
                                    onClick={() => onChange({
                                        ...manufacturing,
                                        vendors: active
                                            ? manufacturing.vendors.filter((item) => item !== profile.id)
                                            : [...manufacturing.vendors, profile.id],
                                    })}
                                    className={cn("rounded-md border px-3 py-1.5 text-xs", active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
                                >
                                    {profile.id}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="rs-stackup-pdf">Layer stackup PDF</Label>
                    <FileBrowse
                        id="rs-stackup-pdf"
                        label="Layer stackup PDF"
                        accept="application/pdf"
                        disabled={!canMutate}
                        fileName={stackupName}
                        onFile={onStackup}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rs-impedance-csv">Controlled impedance CSV</Label>
                    <FileBrowse
                        id="rs-impedance-csv"
                        label="Controlled impedance CSV"
                        accept=".csv,text/csv"
                        disabled={!canMutate}
                        fileName={impedanceCsv ? `CSV loaded (${impedanceCsv.split("\n").length} lines)` : ""}
                        onFile={(file) => {
                            if (!file) {
                                onImpedanceCsv("");
                                return;
                            }
                            void file.text().then(onImpedanceCsv);
                        }}
                    />
                    <a className="text-xs underline" href={api.impedanceTemplateUrl(projectId)}>
                        Download blank CSV template
                    </a>
                </div>
            </div>
            {canMutate && (
                <Button disabled={!identityComplete || Boolean(busy)} onClick={onBuild}>
                    Continue
                </Button>
            )}
        </div>
    );
}

function IpcSelect({
    label,
    options,
    value,
    onChange,
    disabled,
    placeholder = "Select a class",
    otherPlaceholder = "Other standard",
}: {
    label: string;
    options: IpcOption[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    otherPlaceholder?: string;
}) {
    const known = new Set(options.flatMap((item) => (item.value !== OTHER ? [item.value] : [])));
    const isOther = Boolean(value) && !known.has(value);
    const [custom, setCustom] = useState(isOther && value !== OTHER ? value : "");
    // Choosing Other is a statement about the *control*, not yet a value. It
    // used to be stored as the literal string "other", which then travelled
    // through the configuration snapshot and printed on the drawing's title
    // block as "VIA TREATMENT: other". Track the mode here and let the field
    // stay empty until the user actually types the standard they mean.
    const [otherMode, setOtherMode] = useState(isOther);
    const selected = otherMode ? OTHER : !value ? undefined : isOther ? OTHER : value;
    const id = `rs-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Select
                value={selected}
                disabled={disabled}
                onValueChange={(next) => {
                    if (next === OTHER) {
                        setOtherMode(true);
                        onChange(custom.trim());
                    } else {
                        setOtherMode(false);
                        onChange(next);
                    }
                }}
            >
                <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {selected === OTHER && (
                <>
                    <Input
                        value={custom}
                        placeholder={otherPlaceholder}
                        aria-label={`${label} other`}
                        disabled={disabled}
                        onChange={(event) => {
                            setCustom(event.target.value);
                            onChange(event.target.value);
                        }}
                    />
                    {!custom.trim() && (
                        <p className="text-xs text-muted-foreground">
                            Type the value to print, or this field is left off the drawing.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

function FileBrowse({
    id,
    label,
    accept,
    disabled,
    fileName,
    onFile,
}: {
    id: string;
    label: string;
    accept?: string;
    disabled?: boolean;
    fileName?: string;
    onFile: (file: File | null) => void;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <input
                id={id}
                type="file"
                accept={accept}
                disabled={disabled}
                className="sr-only"
                onChange={(event) => {
                    onFile(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                }}
            />
            <Button
                type="button"
                variant="outline"
                disabled={disabled}
                aria-label={`Browse ${label}`}
                onClick={() => document.getElementById(id)?.click()}
            >
                Browse
            </Button>
            <span className="min-w-0 truncate text-xs leading-none text-muted-foreground">
                {fileName || "No file selected."}
            </span>
        </div>
    );
}

export default ManufacturingStep;
