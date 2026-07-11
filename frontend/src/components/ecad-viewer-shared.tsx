import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Check, X as XIcon, ChevronRight, Layers, FileText, Boxes, Network, Cpu, Eye, EyeOff, Search, Keyboard, Library, ExternalLink, Loader2, Maximize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ECadViewerElement } from "@/types/ecad-viewer";
import { fetchJson } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Theme kicanvas viewer chrome
// ---------------------------------------------------------------------------
//
// ecad-viewer renders <kc-board-properties-panel> / <kc-schematic-properties-panel>
// as absolutely-positioned children inside its shadow DOM. We hide them via
// CSS injected into every shadow root we can reach so our React panel takes over
// and the built-in layer/object menus pick up the project theme.

const VIEWER_BASE_CSS = `
    kc-board-properties-panel,
    kc-schematic-properties-panel,
    tab-view,
    tab-header,
    .bottom-left-badge,
    .bottom-left-icon {
        display: none !important;
    }

    kc-ui-dropdown {
        --dropdown-bg: hsl(var(--popover));
        --dropdown-fg: hsl(var(--popover-foreground));
        --dropdown-hover-bg: hsl(var(--accent));
        --dropdown-hover-fg: hsl(var(--accent-foreground));
        --dropdown-active-bg: hsl(var(--accent));
        --dropdown-active-fg: hsl(var(--accent-foreground));
    }

    kc-ui-menu.dropdown {
        --list-item-bg: hsl(var(--popover));
        --list-item-fg: hsl(var(--popover-foreground));
        --list-item-hover-bg: hsl(var(--accent));
        --list-item-hover-fg: hsl(var(--accent-foreground));
        --list-item-active-bg: hsl(var(--accent));
        --list-item-active-fg: hsl(var(--accent-foreground));
        --list-item-disabled-bg: hsl(var(--muted));
        --list-item-disabled-fg: hsl(var(--muted-foreground));
    }
`;

function viewerThemeCssForRoot(rootTag: string): string {
    switch (rootTag) {
        case "ecad-viewer":
            return `
                :host {
                    --panel-bg: hsl(var(--card));
                    --panel-fg: hsl(var(--card-foreground));
                    --panel-title-bg: hsl(var(--background));
                    --panel-title-fg: hsl(var(--foreground));
                    --panel-line: hsl(var(--border));
                    --grid-outline: hsl(var(--border));
                    --list-item-bg: hsl(var(--card));
                    --list-item-fg: hsl(var(--card-foreground));
                    --list-item-hover-bg: hsl(var(--accent));
                    --list-item-hover-fg: hsl(var(--accent-foreground));
                    --list-item-active-bg: hsl(var(--accent));
                    --list-item-active-fg: hsl(var(--accent-foreground));
                    --list-item-disabled-bg: hsl(var(--muted));
                    --list-item-disabled-fg: hsl(var(--muted-foreground));
                    --dropdown-bg: hsl(var(--popover));
                    --dropdown-fg: hsl(var(--popover-foreground));
                    --tab-button-bg: transparent;
                    --tab-button-hover-bg: hsl(var(--muted));
                    --tab-button-selected-bg: hsl(var(--accent));
                    --tab-button-ck-bg: hsl(var(--accent));
                    --tab-button-color: hsl(var(--foreground));
                    --button-menu-bg: hsl(var(--background));
                    --button-menu-fg: hsl(var(--foreground));
                    --button-menu-hover-bg: hsl(var(--accent));
                    --button-menu-hover-fg: hsl(var(--accent-foreground));
                    --button-menu-disabled-bg: hsl(var(--muted));
                    --button-menu-disabled-fg: hsl(var(--muted-foreground));
                }

                tab-header {
                    display: block;
                }

                tab-header .horizontal-bar {
                    display: flex;
                    align-items: flex-end;
                    gap: 0.15rem;
                    padding: 0 0.5rem;
                    border-bottom: 1px solid hsl(var(--border));
                    background: color-mix(in oklab, hsl(var(--background)) 88%, transparent);
                    backdrop-filter: blur(8px);
                }

                tab-header .bar-section {
                    display: flex;
                    align-items: flex-end;
                    gap: 0.15rem;
                }

                tab-button {
                    margin-bottom: -1px;
                }

                tab-button.beginning,
                tab-button.tab {
                    border-top-left-radius: 0.7rem;
                    border-top-right-radius: 0.7rem;
                }

                tab-button.end {
                    margin-left: auto;
                    border-top-left-radius: 0.7rem;
                    border-top-right-radius: 0.7rem;
                }

                tab-button[selected],
                tab-button.active,
                tab-button.checked {
                    --tab-button-selected-bg: hsl(var(--accent));
                }
            `;
        case "kc-ui-toggle-menu":
            return `
                button {
                    border: 1px solid hsl(var(--border));
                    border-radius: 9999px;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
                    padding: 0.4em 0.8em;
                    gap: 0.35em;
                    letter-spacing: 0.01em;
                }

                button:hover {
                    border-color: hsl(var(--ring));
                    transform: translateY(-1px);
                }

                button span {
                    display: inline;
                    font-size: 0.9em;
                    font-weight: 600;
                }

                button kc-ui-icon {
                    font-size: 0.95em;
                    margin-top: 0;
                    margin-bottom: 0;
                }
            `;
        case "kc-ui-dropdown":
            return `
                :host {
                    border: 1px solid hsl(var(--border));
                    border-radius: 0.9rem;
                    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
                    backdrop-filter: blur(12px);
                    overflow: hidden;
                }
            `;
        case "kc-ui-menu":
            return `
                :host(.dropdown) {
                    font-family: inherit;
                    font-size: 0.75rem;
                    color: hsl(var(--foreground));
                    --list-item-padding: 0.42em 0.72em;
                    max-height: 50vh;
                    overflow-y: auto;
                    border-radius: 0.8rem;
                    scrollbar-width: thin;
                    scrollbar-color: hsl(var(--border)) transparent;
                }
                :host(.dropdown)::-webkit-scrollbar {
                    width: 4px;
                }
                :host(.dropdown)::-webkit-scrollbar-track {
                    background: transparent;
                }
                :host(.dropdown)::-webkit-scrollbar-thumb {
                    background: hsl(var(--border));
                    border-radius: 9999px;
                }
                :host(.dropdown)::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--muted-foreground) / 0.5);
                }

                :host(.outline) ::slotted(kc-ui-menu-item) {
                    border-bottom: 1px solid hsl(var(--border));
                }

                :host(.dropdown) ::slotted(kc-ui-menu-item) {
                    margin: 0.08rem 0.16rem;
                    border-radius: 0.55rem;
                }

                :host(.dropdown) ::slotted(kc-ui-menu-label) {
                    font-size: 0.68rem;
                    font-weight: 700;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                }
            `;
        case "kc-ui-menu-item":
            return `
                :host {
                    font-family: inherit;
                    font-size: 0.75rem;
                    line-height: 1.35;
                    color: hsl(var(--foreground));
                    border-radius: 0.55rem;
                }

                kc-ui-icon {
                    margin-right: 0.5em;
                    margin-left: -0.1em;
                }
            `;
        case "kc-ui-menu-label":
            return `
                :host {
                    width: 100%;
                    display: flex;
                    flex-wrap: nowrap;
                    padding: 0.2em 0.3em;
                    background: hsl(var(--muted));
                    color: hsl(var(--muted-foreground));
                }
            `;
        default:
            return "";
    }
}

const STYLED_ROOTS = new WeakSet<ShadowRoot>();

function injectViewerStyles(host: HTMLElement) {
    const walk = (root: HTMLElement) => {
        const sr = root.shadowRoot;
        if (!sr) return;
        // Always walk children to catch shadow roots that mounted after the last pass.
        // Only inject the stylesheet once per root (tracked by STYLED_ROOTS).
        if (!STYLED_ROOTS.has(sr)) {
            STYLED_ROOTS.add(sr);
            const rootTag = (sr.host as Element)?.tagName?.toLowerCase?.() ?? "";
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(`${VIEWER_BASE_CSS}\n${viewerThemeCssForRoot(rootTag)}`);
            try {
                sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
            } catch {
                const style = document.createElement("style");
                style.textContent = `${VIEWER_BASE_CSS}\n${viewerThemeCssForRoot(rootTag)}`;
                sr.appendChild(style);
            }
        }
        // Always recurse so late-mounting children (e.g. kc-board-properties-panel
        // which mounts after the viewer loads) are caught on subsequent poll passes.
        for (const el of sr.querySelectorAll("*")) {
            if ((el as HTMLElement).shadowRoot) walk(el as HTMLElement);
        }
    };
    walk(host);
}

// ---------------------------------------------------------------------------
// Extract user-friendly properties from a selected item
// ---------------------------------------------------------------------------

export interface ItemDetail {
    title: string;
    subtitle?: string;
    fields: { label: string; value: string }[];
    /** Nested key/value groups rendered as collapsible dropdowns. */
    groups?: { label: string; entries: { label: string; value: string }[] }[];
    /** Parsed library link for crosslinking to the catalog (e.g. "EasyEDA:C0603"). */
    libraryLink?: string;
    /** Asset type for crosslinking. */
    assetType?: "symbol" | "footprint";
    /** Footprint lib:name from the symbol's Footprint property (SCH viewer only). */
    footprintLink?: string;
    /** Project ID — used by the backend to locate PCB/SCH files for extraction. */
    projectId?: string;
}

type Anyish = Record<string, unknown> & {
    typeId?: string;
    constructor?: { name?: string };
};

function fmt(n: unknown, digits = 3): string {
    if (typeof n !== "number" || !isFinite(n)) return String(n ?? "–");
    return n.toFixed(digits).replace(/\.?0+$/, "");
}


export function extractItemDetail(rawItem: unknown): ItemDetail | null {
    if (!rawItem || typeof rawItem !== "object") return null;
    const item = rawItem as Anyish;
    const typeId = (item.typeId ?? item.constructor?.name ?? "") as string;


    // PCB items — matched by typeId (set explicitly by kicanvas board parser).
    switch (typeId) {
        case "Footprint":   return extractFootprint(item);
        case "Pad":         return extractPad(item);
        case "LineSegment": return extractLine(item);
        case "Via":         return extractVia(item);
        case "Zone":        return extractZone(item);
    }

    // Schematic items — kicanvas uses constructor.name (minified class names vary,
    // so we duck-type on the fields that each item type uniquely has).
    if (item.lib_symbol != null || item.lib_id != null || item.in_bom != null)
        return extractSchSymbol(item);
    if (item.sheet_name != null || (item.properties != null && item.pins != null && item.at != null && item.lib_symbol == null))
        return extractSchSheet(item);
    if (item.stroke != null && item.pts != null)
        return extractSchWireOrBus(item, typeId);
    if (item.number != null && item.definition != null)
        return extractSchPin(item);
    if (item.text != null && item.effects != null)
        return extractSchText(item, typeId);

    return extractGeneric(item, typeId);
}

type Field = { label: string; value: string };
type Group = { label: string; entries: Field[] };

function s(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "boolean") return v ? BOOL_TRUE : BOOL_FALSE;
    if (typeof v === "number") return fmt(v);
    return String(v).trim();
}

function field(label: string, v: unknown): Field | null {
    const str = s(v);
    if (str === "") return null;
    return { label, value: str };
}

function fields(...pairs: (Field | null)[]): Field[] {
    return pairs.filter(Boolean) as Field[];
}

function extractFootprint(t: Anyish): ItemDetail {
    const pos  = (t.at as Anyish)?.position as Anyish | undefined;
    const bbox = t.bbox as Anyish | undefined;
    const attr = t.attr as Anyish | undefined;

    const geometryGroup: Group = {
        label: "Geometry",
        entries: fields(
            field("X",           pos?.x != null ? `${fmt(pos.x as number, 4)} mm` : null),
            field("Y",           pos?.y != null ? `${fmt(pos.y as number, 4)} mm` : null),
            field("Height",      bbox?.h != null ? `${fmt(bbox.h as number, 4)} mm` : null),
            field("Width",       bbox?.w != null ? `${fmt(bbox.w as number, 4)} mm` : null),
            field("Orientation", (t.at as Anyish)?.rotation != null ? `${fmt((t.at as Anyish).rotation as number, 1)}°` : null),
        ),
    };

    const fpFields = fields(
        field("Reference",   t.reference),
        field("Value",       t.value),
        field("Type",        attr?.through_hole ? "through hole" : attr?.smd ? "smd" : "unspecified"),
        field("Pads",        Array.isArray(t.pads) ? String((t.pads as unknown[]).length) : null),
        field("Description", t.descr),
        field("Keywords",    t.tags),
    );

    // Custom properties — read from t.properties (plain object) and merge with
    // t.properties_kicad_8 (array of {name,value} objects). The KiCad 8 array
    // takes precedence for non-empty values so Datasheet etc. are not lost.
    const customProps = readProperties(t.properties, t.properties_kicad_8);

    const fabFields = fields(
        field("Not in schematic",             boolField(attr?.board_only)),
        field("Exclude from position files",  boolField(attr?.exclude_from_pos_files)),
        field("Exclude from BOM",             boolField(attr?.exclude_from_bom)),
    );

    const overrideFields = fields(
        field("Exempt from courtyard", boolField(attr?.allow_missing_courtyard)),
        field("Clearance",             t.clearance != null ? `${t.clearance} mm` : null),
        field("Solderpaste margin",    t.solder_paste_margin != null ? `${t.solder_paste_margin} mm` : null),
        field("Solderpaste ratio",     t.solder_paste_ratio),
        field("Zone connection",       t.zone_connect ?? "inherited"),
    );

    const groups: Group[] = [];
    if (geometryGroup.entries.length) groups.push(geometryGroup);
    if (customProps.length)    groups.push({ label: "Properties",             entries: customProps });
    if (fabFields.length)      groups.push({ label: "Fabrication attributes", entries: fabFields });
    if (overrideFields.length) groups.push({ label: "Overrides",              entries: overrideFields });

    const libraryLinkRaw = s(t.library_link);
    return {
        title:    String(t.reference ?? "Footprint"),
        subtitle: String(t.value ?? ""),
        fields:   [...fpFields],
        groups:   groups.length > 0 ? groups : undefined,
        libraryLink: libraryLinkRaw || undefined,
        assetType: "footprint",
    };
}

function extractPad(t: Anyish): ItemDetail {
    const bbox = t.bbox as Anyish | undefined;
    const net  = t.net as Anyish | undefined;
    const drill= t.drill as Anyish | undefined;

    return {
        title:  `Pad ${t.number ?? ""}`,
        subtitle: net?.name ? String(net.name) : undefined,
        fields: fields(
            field("X",           bbox?.x != null ? `${fmt(bbox.x as number, 4)} mm` : null),
            field("Y",           bbox?.y != null ? `${fmt(bbox.y as number, 4)} mm` : null),
            field("Height",      bbox?.h != null ? `${fmt(bbox.h as number, 4)} mm` : null),
            field("Width",       bbox?.w != null ? `${fmt(bbox.w as number, 4)} mm` : null),
            field("Orientation", (t.at as Anyish)?.rotation != null ? `${fmt((t.at as Anyish).rotation as number, 1)}°` : null),
            field("Layer",       (t.parent as Anyish)?.layer),
            field("Type",        t.type),
            field("Shape",       t.shape),
            field("Drill",       drill?.diameter != null ? `${fmt(drill.diameter as number, 4)} mm` : null),
            field("Net",         net?.name),
            field("PinNum",      t.number),
            field("PinType",     t.pintype),
            field("PinFunction", t.pinfunction),
        ),
    };
}

function extractLine(t: Anyish): ItemDetail {
    const start = t.start as Anyish | undefined;
    const end   = t.end as Anyish | undefined;
    return {
        title: "Track",
        fields: fields(
            field("X",      start?.x != null ? `${fmt(start.x as number, 4)} mm` : null),
            field("Y",      start?.y != null ? `${fmt(start.y as number, 4)} mm` : null),
            field("Width",  t.width != null ? `${fmt(t.width as number, 4)} mm` : null),
            field("Length", t.routed_length != null ? `${fmt(t.routed_length as number, 4)} mm` : null),
            field("Layer",  t.layer),
            field("Net",    t.net_name ?? t.net),
            field("End X",  end?.x != null ? `${fmt(end.x as number, 4)} mm` : null),
            field("End Y",  end?.y != null ? `${fmt(end.y as number, 4)} mm` : null),
        ),
    };
}

function extractVia(t: Anyish): ItemDetail {
    const pos = (t.at as Anyish)?.position as Anyish | undefined;
    const layers = t.layers as string[] | undefined;
    return {
        title: "Via",
        fields: fields(
            field("X",            pos?.x != null ? `${fmt(pos.x as number, 4)} mm` : null),
            field("Y",            pos?.y != null ? `${fmt(pos.y as number, 4)} mm` : null),
            field("Net",          t.net_name ?? t.net),
            field("Diameter",     t.size != null ? `${fmt(t.size as number, 4)} mm` : null),
            field("Hole",         t.drill != null ? `${fmt(t.drill as number, 4)} mm` : null),
            field("Layer Top",    layers?.[0]),
            field("Layer Bottom", layers?.[layers.length - 1]),
            field("Via Type",     t.type),
        ),
    };
}

function extractZone(t: Anyish): ItemDetail {
    const fill = t.fill as Anyish | undefined;
    const cp   = t.connect_pads as Anyish | undefined;
    return {
        title: String(t.name ?? t.net_name ?? "Zone"),
        fields: fields(
            field("Name",                    t.name),
            field("Priority",                t.priority),
            field("Net",                     t.net_name),
            field("Fill mode",               fill?.mode),
            field("Clearance override",      cp?.clearance),
            field("Minimum width",           t.min_thickness != null ? `${fmt(t.min_thickness as number, 4)} mm` : null),
            field("Pad connections",         cp?.type ?? "Thermal reliefs"),
            field("Thermal relief gap",      fill?.thermal_gap != null ? `${fmt(fill.thermal_gap as number, 4)} mm` : null),
            field("Thermal relief spoke width", fill?.thermal_bridge_width != null ? `${fmt(fill.thermal_bridge_width as number, 4)} mm` : null),
        ),
    };
}

// ---------------------------------------------------------------------------
// Schematic item extractors
// Field paths taken directly from kc-schematic-properties-panel in ecad-viewer.js
// ---------------------------------------------------------------------------

function extractSchSymbol(t: Anyish): ItemDetail {
    const pos     = (t.at as Anyish)?.position as Anyish | undefined;
    const libSym  = t.lib_symbol as Anyish | undefined;

    // Properties: Map of {name, text} entries (kicanvas reads .values())
    const propsEntries: Field[] = [];
    const propsMap = t.properties;
    if (propsMap instanceof Map) {
        for (const v of (propsMap as Map<unknown, Anyish>).values()) {
            const f = field(String(v?.name ?? ""), v?.text);
            if (f) propsEntries.push(f);
        }
    } else if (Array.isArray(propsMap)) {
        for (const v of propsMap as Anyish[]) {
            const f = field(String(v?.name ?? ""), v?.text);
            if (f) propsEntries.push(f);
        }
    }

    // Pins from unit_pins
    const pinEntries: Field[] = [];
    const unitPins = t.unit_pins as Anyish[] | undefined;
    if (Array.isArray(unitPins)) {
        for (const pin of unitPins) {
            const num  = String((pin as Anyish)?.number ?? "");
            const defName = ((pin as Anyish)?.definition as Anyish)?.name as Anyish | undefined;
            const name = String(defName?.text ?? "");
            if (num) pinEntries.push({ label: num, value: name || "—" });
        }
    }

    const geometryGroup: Group = {
        label: "Geometry",
        entries: fields(
            field("X",           pos?.x != null ? `${fmt(pos.x as number, 4)} mm` : null),
            field("Y",           pos?.y != null ? `${fmt(pos.y as number, 4)} mm` : null),
            field("Orientation", (t.at as Anyish)?.rotation != null ? `${fmt((t.at as Anyish).rotation as number, 1)}°` : null),
            field("Mirror",      t.mirror === "x" ? "Around X axis" : t.mirror === "y" ? "Around Y axis" : t.mirror ? String(t.mirror) : null),
        ),
    };

    const instanceGroup: Group = {
        label: "Instance properties",
        entries: fields(
            field("Unit",         t.unit != null ? String.fromCharCode(65 + (t.unit as number) - 1) : null),
            field("In BOM",       boolField(t.in_bom)),
            field("On board",     boolField(t.on_board)),
            field("Populate",     boolField(t.dnp != null ? !t.dnp : null)),
        ),
    };

    const symPropsGroup: Group = {
        label: "Symbol properties",
        entries: fields(
            field("Name",                    libSym?.name),
            field("Description",             libSym?.description),
            field("Keywords",                libSym?.keywords),
            field("Power",                   boolField(libSym?.power)),
            field("Units",                   libSym?.unit_count),
            field("Units interchangeable",   boolField(libSym?.units_interchangable)),
        ),
    };

    const groups: Group[] = [];
    if (geometryGroup.entries.length)  groups.push(geometryGroup);
    if (instanceGroup.entries.length)  groups.push(instanceGroup);
    if (propsEntries.length)           groups.push({ label: "Fields",           entries: propsEntries });
    if (symPropsGroup.entries.length)  groups.push(symPropsGroup);
    if (pinEntries.length)             groups.push({ label: "Pins",             entries: pinEntries });

    // Hoist Reference, Value, Footprint to top-level fields (shown above dropdowns).
    const TOP_PROPS = ["Reference", "Value"];
    const topFields = TOP_PROPS.map(k => propsEntries.find(e => e.label === k)).filter(Boolean) as Field[];
    const refEntry  = topFields.find(e => e.label === "Reference");
    const valEntry  = topFields.find(e => e.label === "Value");

    const libLinkRaw = s(t.lib_name ?? t.lib_id);
    // The "Footprint" property on a schematic symbol gives us the linked footprint lib:name
    const footprintProp = propsEntries.find(e => e.label === "Footprint");
    const footprintLink = footprintProp?.value?.includes(":") ? footprintProp.value : undefined;
    return {
        title:    refEntry?.value ?? String(t.lib_id ?? t.lib_name ?? "Symbol"),
        subtitle: valEntry?.value,
        fields:   topFields,
        groups:   groups.length > 0 ? groups : undefined,
        libraryLink: libLinkRaw || undefined,
        assetType: "symbol",
        footprintLink,
    };
}

function extractSchSheet(t: Anyish): ItemDetail {
    const pos = (t.at as Anyish)?.position as Anyish | undefined;

    const propsEntries: Field[] = [];
    const propsMap = t.properties;
    if (propsMap instanceof Map) {
        for (const v of (propsMap as Map<unknown, Anyish>).values()) {
            const f = field(String(v?.name ?? ""), v?.text);
            if (f) propsEntries.push(f);
        }
    } else if (Array.isArray(propsMap)) {
        for (const v of propsMap as Anyish[]) {
            const f = field(String(v?.name ?? ""), v?.text);
            if (f) propsEntries.push(f);
        }
    }

    const pinEntries: Field[] = [];
    const pins = t.pins as Anyish[] | undefined;
    if (Array.isArray(pins)) {
        for (const pin of pins) {
            const nm = String((pin as Anyish)?.name ?? "");
            const shape = String((pin as Anyish)?.shape ?? "");
            if (nm) pinEntries.push({ label: nm, value: shape || "—" });
        }
    }

    const geometryGroup: Group = {
        label: "Geometry",
        entries: fields(
            field("X", pos?.x != null ? `${fmt(pos.x as number, 4)} mm` : null),
            field("Y", pos?.y != null ? `${fmt(pos.y as number, 4)} mm` : null),
        ),
    };

    const groups: Group[] = [];
    if (geometryGroup.entries.length) groups.push(geometryGroup);
    if (propsEntries.length)          groups.push({ label: "Fields", entries: propsEntries });
    if (pinEntries.length)            groups.push({ label: "Pins",   entries: pinEntries });

    return {
        title:  String(t.sheet_name ?? "Sheet"),
        fields: [],
        groups: groups.length > 0 ? groups : undefined,
    };
}

function extractSchWireOrBus(t: Anyish, typeId: string): ItemDetail {
    const stroke = t.stroke as Anyish | undefined;
    const color  = (stroke?.color as Anyish | undefined);
    return {
        title: typeId.includes("Bus") ? "Bus" : "Wire",
        fields: fields(
            field("Line Style", stroke?.type),
            field("Line Width", stroke?.width != null ? `${stroke.width} mils` : null),
            field("Color",      color?.to_css ? String((color.to_css as () => string)()) : null),
        ),
    };
}

function extractSchPin(t: Anyish): ItemDetail {
    return {
        title: `Pin ${t.number ?? ""}`,
        fields: fields(
            field("Number",    t.number),
            field("Alternate", t.alternate),
            field("Unit",      t.unit),
        ),
    };
}

function extractSchText(t: Anyish, typeId: string): ItemDetail {
    const stroke = t.stroke as Anyish | undefined;
    const effects = t.effects as Anyish | undefined;
    const font   = (effects?.font as Anyish | undefined);
    return {
        title: String(t.text ?? typeId ?? "Text"),
        fields: fields(
            field("Text",       t.text),
            field("Bold",       boolField(font?.bold)),
            field("Italic",     boolField(font?.italic)),
            field("Shape",      t.shape),
            field("Line Style", stroke?.type),
            field("Line Width", stroke?.width != null ? `${stroke.width} mils` : null),
        ),
    };
}

function extractGeneric(item: Anyish, typeId: string): ItemDetail {
    // Net info or unknown item — show whatever we can read.
    const allFields: Field[] = [];
    const seen = new Set<string>();
    const skip = new Set(["typeId", "constructor", "shadowRoot", "renderer", "viewer", "viewport", "bbox", "properties", "properties_kicad_8"]);
    for (const k of Object.keys(item)) {
        if (skip.has(k) || k.startsWith("#") || k.startsWith("_")) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        const v = s(item[k]);
        if (v) allFields.push({ label: prettyLabel(k), value: v });
    }
    const title = String(item.reference ?? item.name ?? item.text ?? item.net_name ?? typeId ?? "Item");
    return { title, fields: allFields };
}

// Read kicanvas's t.properties — a plain {key: string} object (KiCad 7)
// or an array/Map of {name, value} objects (KiCad 8).
// Optionally merges a second source (properties_kicad_8) — non-empty values
// from the second source override empty placeholders from the first.
function readProperties(raw: unknown, raw2?: unknown): Field[] {
    const out: Field[] = [];
    const seen = new Map<string, number>(); // label.toLowerCase() -> index in out

    const push = (label: string, value: string) => {
        if (!label) return;
        const key = label.toLowerCase();
        const trimmed = value.trim();
        if (seen.has(key)) {
            // Override with a non-empty value if the existing entry is a placeholder.
            if (trimmed && out[seen.get(key)!].value === "—") {
                out[seen.get(key)!].value = trimmed;
            }
            return;
        }
        seen.set(key, out.length);
        out.push({ label, value: trimmed || "—" });
    };

    const ingest = (source: unknown) => {
        if (!source || typeof source !== "object") return;
        if (source instanceof Map) {
            for (const [k, v] of source as Map<unknown, unknown>) {
                push(String(k), propVal(v));
            }
        } else if (Array.isArray(source)) {
            for (const v of source) {
                push(String((v as Anyish)?.name ?? ""), propVal(v));
            }
        } else {
            for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
                push(k, propVal(v));
            }
        }
    };

    ingest(raw);
    ingest(raw2);
    return out;
}

// Extract string value from a property entry (plain string or {name,value} object).
function propVal(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v !== "object") return String(v);
    const o = v as Record<string, unknown>;
    for (const k of ["value", "shown_text", "text"]) {
        if (typeof o[k] === "string") return o[k] as string;
    }
    // Walk prototype getters for KiCad 8 Qn objects with private #fields.
    let proto = Object.getPrototypeOf(o);
    let hops = 0;
    while (proto && hops < 4 && proto !== Object.prototype) {
        for (const k of ["value", "shown_text", "text"]) {
            const desc = Object.getOwnPropertyDescriptor(proto, k);
            if (desc?.get) {
                try {
                    const r = desc.get.call(o);
                    if (typeof r === "string") return r;
                } catch { /* ignore */ }
            }
        }
        proto = Object.getPrototypeOf(proto);
        hops++;
    }
    return "";
}

function boolField(v: unknown): string | null {
    if (v == null) return null;
    return v ? BOOL_TRUE : BOOL_FALSE;
}

function prettyLabel(k: string): string {
    return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export const BOOL_TRUE = "bool:true";
export const BOOL_FALSE = "bool:false";


// ---------------------------------------------------------------------------
// React panel + select-listening hook
// ---------------------------------------------------------------------------

interface UseEcadInfoPanelOpts {
    /** The container that wraps the ecad-viewer; events bubble through it. */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Refs to viewer hosts whose shadow DOM should have the built-in panel hidden. */
    viewerRefs: React.RefObject<ECadViewerElement | null>[];
    /** Project ID — passed to backend so it can locate both PCB and SCH files for extraction. */
    projectId?: string | null;
}

export function useEcadInfoPanel({ containerRef, viewerRefs, projectId }: UseEcadInfoPanelOpts) {
    const [detail, setDetail] = useState<ItemDetail | null>(null);
    const projectIdRef = useRef(projectId);
    useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

    // Inject hide-css repeatedly (shadow DOM may not exist yet on mount).
    useEffect(() => {
        let cancelled = false;
        const tryInject = () => {
            for (const r of viewerRefs) {
                if (r.current) injectViewerStyles(r.current as unknown as HTMLElement);
            }
        };
        tryInject();
        const id = window.setInterval(() => {
            if (cancelled) return;
            tryInject();
        }, 500);
        const stop = window.setTimeout(() => {
            window.clearInterval(id);
        }, 8000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
            window.clearTimeout(stop);
        };
    }, [viewerRefs]);

    // Listen for selection events. Attach to both the container and each viewer
    // element directly so it works even when containerRef.current is null on
    // first mount (e.g. the visualizer's lazy-loaded tab).
    useEffect(() => {
        const handler = (e: Event) => {
            const item = (e as CustomEvent<{ item: unknown }>).detail?.item;
            if (!item) { setDetail(null); return; }
            const d = extractItemDetail(item);
            if (d && projectIdRef.current) d.projectId = projectIdRef.current;
            setDetail(d);
        };
        const targets = [
            containerRef.current,
            ...viewerRefs.map(r => r.current as HTMLElement | null),
        ].filter(Boolean) as HTMLElement[];
        for (const t of targets) t.addEventListener("kicanvas:select", handler);
        // Note: the fork re-emits selection as a composed+bubbling event on the
        // <ecad-viewer> host, so it reaches both the host (viewerRefs) and the
        // container. We intentionally do NOT listen on `document` — that would
        // pick up selections from OTHER mounted viewers (new/old diff sides,
        // sch+pcb tabs) and cross-populate this viewer's card.
        return () => {
            for (const t of targets) t.removeEventListener("kicanvas:select", handler);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerRef, ...viewerRefs.map(r => r.current)]);

    return { detail, clear: () => setDetail(null) };
}

function renderFieldValue(value: string) {
    if (value === BOOL_TRUE)  return <Check className="inline h-3 w-3 text-green-500" />;
    if (value === BOOL_FALSE) return <XIcon className="inline h-3 w-3 text-red-500" />;
    if (/^https?:\/\/\S+/.test(value) || /^www\.\S+\.\S+/.test(value)) {
        const href = value.startsWith("http") ? value : `https://${value}`;
        return (
            <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
                onClick={e => e.stopPropagation()}
            >
                {value}
            </a>
        );
    }
    return value;
}

interface EcadInfoPanelProps {
    detail: ItemDetail | null;
    onClose: () => void;
    /** Where to anchor the panel inside the viewer container. Default: top-right. */
    position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
}

const POSITION_CLASSES: Record<NonNullable<EcadInfoPanelProps["position"]>, string> = {
    "top-right":    "top-3 right-3",
    "top-left":     "top-3 left-3",
    "bottom-right": "bottom-3 right-3",
    "bottom-left":  "bottom-3 left-3",
};

function FieldRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="py-1 border-b border-border/40 last:border-b-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 leading-tight">
                {label}
            </div>
            <div className="font-mono text-[11px] break-all leading-snug">
                {renderFieldValue(value)}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// CatalogCrosslink — collapsible panel linking a selected item to the catalog
// ---------------------------------------------------------------------------

interface CatalogCrosslinkEntry {
    id: string;
    value: string;
    description: string;
    manufacturer: string;
    mpn: string;
    category: string;
    package_name: string;
    previews: { id: string; kind: string; status: string; content_type: string }[];
}

function CatalogCrosslink({ libraryLink, assetType, footprintLink, projectId }: { libraryLink: string; assetType: "symbol" | "footprint"; footprintLink?: string; projectId?: string }) {
    const navigate = useNavigate();
    const [entry, setEntry] = useState<CatalogCrosslinkEntry | null | "not-found" | "loading">("loading");
    const [previewFailed, setPreviewFailed] = useState(false);
    const [inlineSvg, setInlineSvg] = useState<string | null>(null);
    const [inlineLoading, setInlineLoading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
    const inlineFetchedRef = useRef(false);

    useEffect(() => {
        const colon = libraryLink.indexOf(":");
        if (colon === -1) { setEntry("not-found"); return; }
        const library = libraryLink.slice(0, colon);
        const name = libraryLink.slice(colon + 1);
        let cancelled = false;
        setEntry("loading");
        setPreviewFailed(false);
        setInlineSvg(null);
        setInlineLoading(false);
        inlineFetchedRef.current = false;
        fetchJson<CatalogCrosslinkEntry>(
            `/api/catalog/components/by-asset?type=${encodeURIComponent(assetType)}&library=${encodeURIComponent(library)}&name=${encodeURIComponent(name)}`
        ).then((data) => {
            if (!cancelled) setEntry(data);
        }).catch(() => {
            if (!cancelled) setEntry("not-found");
        });
        return () => { cancelled = true; };
    }, [libraryLink, assetType]);

    useEffect(() => {
        if (previewOpen) { setScale(1); setOffset({ x: 0, y: 0 }); }
    }, [previewOpen]);

    // When the asset-store preview also fails, extract from the project files via the backend.
    // Deps intentionally omit inlineSvg/inlineLoading to avoid cancelling the in-flight fetch.
    useEffect(() => {
        if (!previewFailed || !projectId || entry !== "not-found") return;
        if (inlineFetchedRef.current) return;
        inlineFetchedRef.current = true;
        const colon = libraryLink.indexOf(":");
        const name = colon !== -1 ? libraryLink.slice(colon + 1) : libraryLink;
        setInlineLoading(true);
        fetch("/api/catalog/assets/inline-preview-svg", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ asset_type: assetType, name, project_id: projectId }),
        }).then(async (res) => {
            if (!res.ok) { setInlineLoading(false); return; }
            const blob = await res.blob();
            setInlineSvg(URL.createObjectURL(blob));
            setInlineLoading(false);
        }).catch(() => {
            setInlineLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewFailed, projectId, entry]);

    const colon = libraryLink.indexOf(":");
    const assetLibrary = colon !== -1 ? libraryLink.slice(0, colon) : "";
    const assetName = colon !== -1 ? libraryLink.slice(colon + 1) : "";
    const fallbackPreviewUrl = assetLibrary && assetName
        ? `/api/catalog/assets/preview-svg?type=${encodeURIComponent(assetType)}&library=${encodeURIComponent(assetLibrary)}&name=${encodeURIComponent(assetName)}`
        : null;

    const catalogPreview = entry && entry !== "loading" && entry !== "not-found"
        ? entry.previews.find((p) => p.kind === (assetType === "symbol" ? "symbol" : "footprint"))
          ?? entry.previews.find((p) => p.status === "ready")
        : null;
    const previewUrl = catalogPreview
        ? `/api/remote-provider/previews/${catalogPreview.id}`
        : entry === "not-found" ? fallbackPreviewUrl : null;
    const displayUrl = inlineSvg ?? (previewFailed ? null : previewUrl);

    const handleJump = () => {
        if (!entry || entry === "loading" || entry === "not-found") return;
        navigate(`/?section=library&highlight=${entry.id}`);
    };

    function onWheel(e: React.WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setScale((s) => Math.min(20, Math.max(0.1, s * delta)));
    }
    function onMouseDown(e: React.MouseEvent) {
        setDragging(true);
        dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    }
    function onMouseMove(e: React.MouseEvent) {
        if (!dragging || !dragStart.current) return;
        setOffset({ x: dragStart.current.ox + (e.clientX - dragStart.current.mx), y: dragStart.current.oy + (e.clientY - dragStart.current.my) });
    }
    function onMouseUp() { setDragging(false); dragStart.current = null; }

    return (
        <>
            <div className="rounded border bg-primary/5 border-primary/20 mt-2 overflow-hidden">
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wider text-primary/80">
                    <Library className="h-3 w-3 shrink-0" />
                    <span>Library Manager</span>
                    {entry === "loading" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                </div>
                {entry !== "loading" && (
                    <div className="px-2 pb-2 space-y-2">
                        {displayUrl && (
                            <div className="relative group/preview rounded bg-background/60 border border-border/30 overflow-hidden h-28">
                                <img
                                    src={displayUrl}
                                    alt="Component preview"
                                    className="object-contain h-full w-full"
                                    onError={() => { if (!inlineSvg) setPreviewFailed(true); }}
                                />
                                <button
                                    onClick={() => setPreviewOpen(true)}
                                    className="absolute inset-0 flex items-center justify-center bg-background/0 hover:bg-background/40 transition-colors opacity-0 group-hover/preview:opacity-100"
                                    title="Expand preview"
                                >
                                    <Maximize2 className="h-4 w-4 text-foreground drop-shadow" />
                                </button>
                            </div>
                        )}
                        {inlineLoading && (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Extracting preview from file…</span>
                            </div>
                        )}
                        {entry === "not-found" && (
                            <>
                                {/* Status line: the preview is a nice-to-have, so its
                                    absence must not block adding. Show whichever state
                                    we're in without gating the button below on it. */}
                                {inlineSvg ? (
                                    <p className="text-[11px] text-muted-foreground italic py-0.5">
                                        Extracted from file — <span className="font-mono">{libraryLink}</span>
                                    </p>
                                ) : !inlineLoading && (
                                    <p className="text-[11px] text-muted-foreground italic py-1">
                                        Not in catalog — <span className="font-mono">{libraryLink}</span>
                                    </p>
                                )}
                                {/* The item is genuinely not in the catalog, so always
                                    offer to add it as long as we have a project and a
                                    non-empty library link. We deliberately do NOT require
                                    a "library:name" colon: some symbols (seen in schematic
                                    libraries) carry a bare lib_id with no library prefix,
                                    which still marks the item not-found but previously hid
                                    the Add button (the CIIA-schematic case). The prefill's
                                    `name` falls back to the whole link when there's no
                                    colon. Also previously this was coupled to a successful
                                    inline-SVG extraction, hiding the button for parts with
                                    no extractable preview. */}
                                {projectId && libraryLink.trim() !== "" && (
                                    <button
                                        onClick={() => {
                                            const colon = libraryLink.indexOf(":");
                                            const name = colon !== -1 ? libraryLink.slice(colon + 1) : libraryLink;
                                            sessionStorage.setItem("prism_inline_prefill", JSON.stringify({
                                                assetType,
                                                name,
                                                libraryLink,
                                                footprintLink: footprintLink ?? null,
                                                projectId,
                                            }));
                                            navigate("/?section=library&from_inline=1");
                                        }}
                                        className="flex w-full items-center justify-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        Add to Library Manager
                                    </button>
                                )}
                            </>
                        )}
                        {entry && entry !== "not-found" && (
                            <div className="space-y-1">
                                {entry.manufacturer && <FieldRow label="Manufacturer" value={entry.manufacturer} />}
                                {entry.mpn && <FieldRow label="MPN" value={entry.mpn} />}
                                {entry.category && <FieldRow label="Category" value={entry.category} />}
                                {entry.package_name && <FieldRow label="Package" value={entry.package_name} />}
                                {entry.description && <FieldRow label="Description" value={entry.description} />}
                            </div>
                        )}
                        {entry && entry !== "not-found" && (
                            <button
                                onClick={handleJump}
                                className="flex w-full items-center justify-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Open in Library Manager
                            </button>
                        )}
                    </div>
                )}
            </div>

            {displayUrl && (
                <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                    <DialogContent className="max-w-4xl h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
                        <DialogHeader className="px-4 py-2.5 border-b border-border/50 shrink-0 flex-row items-center justify-between">
                            <DialogTitle className="text-sm">{libraryLink}</DialogTitle>
                            <span className="text-[10px] text-muted-foreground pr-6">Scroll to zoom · Drag to pan</span>
                        </DialogHeader>
                        <div
                            className="flex-1 min-h-0 overflow-hidden bg-secondary/10 cursor-grab active:cursor-grabbing select-none"
                            onWheel={onWheel}
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                        >
                            <div
                                className="w-full h-full flex items-center justify-center"
                                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "center center", transition: dragging ? "none" : "transform 0.05s" }}
                            >
                                <img
                                    src={displayUrl}
                                    alt={libraryLink}
                                    className="max-w-none"
                                    style={{ width: "80%", height: "auto", pointerEvents: "none" }}
                                    draggable={false}
                                />
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

export function EcadInfoPanel({ detail, onClose, position = "top-right" }: EcadInfoPanelProps) {
    const wasOpen = useRef(false);
    useEffect(() => { wasOpen.current = !!detail; }, [detail]);
    if (!detail) return null;
    return (
        <div className={`absolute ${POSITION_CLASSES[position]} z-30 w-80 max-w-[calc(100%-1.5rem)] flex flex-col rounded-xl border bg-background/90 shadow-xl backdrop-blur-md overflow-hidden`}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/30 shrink-0">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">{detail.title}</p>
                    {detail.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{detail.subtitle}</p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="overflow-y-auto max-h-[80vh] px-3 py-1.5 text-xs">
                {detail.fields.length === 0 && !detail.groups?.length ? (
                    <p className="text-muted-foreground italic py-1">No additional properties</p>
                ) : (
                    <>
                        {detail.libraryLink && detail.assetType && (
                            <CatalogCrosslink libraryLink={detail.libraryLink} assetType={detail.assetType} footprintLink={detail.footprintLink} projectId={detail.projectId} />
                        )}
                        {detail.fields.map((f, i) => (
                            <FieldRow key={i} label={f.label} value={f.value} />
                        ))}
                        {detail.groups?.map((g, gi) => (
                            <details key={`g${gi}`} className="group rounded border bg-muted/20 mt-2 overflow-hidden">
                                <summary className="flex items-center gap-1 px-2 py-1.5 cursor-pointer select-none text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                    <span>{g.label}</span>
                                    <span className="ml-auto font-mono">{g.entries.length}</span>
                                </summary>
                                <div className="px-2 pb-1.5">
                                    {g.entries.map((e, ei) => (
                                        <FieldRow key={ei} label={e.label} value={e.value} />
                                    ))}
                                </div>
                            </details>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ViewerLoading / ViewerError — unified viewer status overlays
// ---------------------------------------------------------------------------
//
// A single spinner/error treatment shared by every viewer surface (the sch/pcb
// diff viewers and the standalone visualizer) so the loading experience is
// identical everywhere. Rendered as an absolute overlay inside the viewer's
// relatively-positioned container.

export function ViewerLoading({ label = "Loading…" }: { label?: string }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-40">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{label}</p>
            </div>
        </div>
    );
}

export function ViewerError({ label, hint }: { label: string; hint?: string }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="flex flex-col items-center gap-3 text-center">
                <XIcon className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">{label}</p>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// EcadViewerHost — unified ecad-viewer mounter
// ---------------------------------------------------------------------------
//
// Single source of truth for embedding <ecad-viewer> with a list of files.
// Used by the diff viewers (sch + pcb) and the standard project visualizer.
// Supports both ref-object and callback styles for capturing the viewer node.

export interface EcadViewerFile {
    filename: string;
    content: string;
}

export interface EcadViewerHostProps {
    /** Re-creates the underlying <ecad-viewer> element when this changes. */
    viewerKey: string;
    files: EcadViewerFile[];
    /** Ref-object form. Either this OR onViewer (or both) may be provided. */
    viewerRef?: React.RefObject<ECadViewerElement | null>;
    /** Callback form. Fires with the live node and with null on detach. */
    onViewer?: (node: ECadViewerElement | null) => void;
    /** Show the floating layers/pages button. Default true. Pass false for
     *  schematic viewers that already have a sheet sidebar. */
    showLayersButton?: boolean;
}

// ---------------------------------------------------------------------------
// LayersPanel — React-rendered replacement for kicanvas's tab-view
// ---------------------------------------------------------------------------
//
// The built-in tab-view lives inside the kicanvas shadow DOM and can't have
// a higher z-index than React-tree siblings (e.g. the diff outline overlay
// at z-20). We render our own panel in the React tree at z-50 so it cleanly
// stacks above everything.
//
// For now this is layers-only: name + color swatch + visibility toggle.
// We poll for the viewer's layer set, and on toggle flip `layer.visible`
// then call `viewer.draw()` to repaint.

// ---------------------------------------------------------------------------
// LayersPanel types
// ---------------------------------------------------------------------------

interface LayerInfo {
    name: string;
    color: string;
    visible: boolean;
}

interface PageInfo {
    filename: string;
    label: string;
    active: boolean;
}

interface NetInfo {
    number: number;
    name: string;
}

interface FootprintInfo {
    uuid: string;
    reference: string;
    value: string;
    layer: string;
}

interface ObjectOpacities {
    tracks: number;
    vias: number;
    pads: number;
    zones: number;
}

type LayerWithDraw = {
    name: string;
    color?: { to_css?: () => string };
    visible: boolean;
};

type DrawableViewer = {
    layers?: { in_ui_order?: () => Iterable<LayerWithDraw> };
    draw?: () => void;
    // NOTE: `layer_visibility_ctrl` is SETTER-ONLY in the fork — reading it
    // returns undefined. Writes to `.visibilities` on the read result are lost.
    // To read/mutate the live visibility map, go through the `layer_visibility`
    // GETTER (returns the ctrl's visibilities Map, or null). The hit-test
    // (hover/click) and net isolation both read this map, so the layers panel
    // MUST update it here for hidden layers to stop being interactive.
    layer_visibility_ctrl?: { visibilities?: Map<string, boolean> } | null;
    layer_visibility?: Map<string, boolean> | null;
    board?: {
        nets?: NetInfo[];
        footprints?: FootprintInfo[];
        find_footprint?: (uuid: string) => FootprintInfo | null;
    };
    track_opacity?: number;
    via_opacity?: number;
    pad_opacity?: number;
    zone_opacity?: number;
    focus_net?: (n: number) => void;
    focus_footprint?: (fp: FootprintInfo) => void;
};

type SchFile = {
    filename: string;
    sheet_path?: string;
};

type SchProject = {
    sch_in_order?: () => Iterable<SchFile>;
};

type SchAppViewer = {
    sch_name?: string;
    load?: (file: SchFile) => void | Promise<void>;
};

type SchAppLike = HTMLElement & {
    project?: SchProject;
    viewer?: SchAppViewer;
};

type PcbTab = "layers" | "objects" | "nets" | "components";

const PCB_TABS: { id: PcbTab; icon: React.ElementType; label: string }[] = [
    { id: "layers",     icon: Layers,   label: "Layers"     },
    { id: "objects",    icon: Boxes,    label: "Objects"    },
    { id: "nets",       icon: Network,  label: "Nets"       },
    { id: "components", icon: Cpu,      label: "Components" },
];

const OBJECT_LABELS: { key: keyof ObjectOpacities; label: string; icon: React.ElementType }[] = [
    { key: "tracks", label: "Tracks",  icon: Network },
    { key: "vias",   label: "Vias",    icon: Boxes   },
    { key: "pads",   label: "Pads",    icon: Cpu     },
    { key: "zones",  label: "Zones",   icon: Layers  },
];

function findSchAppEl(host: ECadViewerElement | null): SchAppLike | null {
    if (!host?.shadowRoot) return null;
    const walk = (root: ShadowRoot | Element): SchAppLike | null => {
        const sr = (root as HTMLElement).shadowRoot;
        const searchRoot = (sr ?? root) as ShadowRoot | Element;
        const direct = (searchRoot as ShadowRoot).querySelector?.("kc-schematic-app") as SchAppLike | null;
        if (direct) return direct;
        for (const child of (searchRoot as ShadowRoot).querySelectorAll?.("*") ?? []) {
            if ((child as HTMLElement).shadowRoot) {
                const found = walk(child as HTMLElement);
                if (found) return found;
            }
        }
        return null;
    };
    return walk(host);
}

function LayersPanel({
    open,
    onClose,
    hostRef,
}: {
    open: boolean;
    onClose: () => void;
    hostRef: React.RefObject<ECadViewerElement | null>;
}) {
    const [tab, setTab] = useState<PcbTab>("layers");
    const [layers, setLayers] = useState<LayerInfo[]>([]);
    const [pages, setPages] = useState<PageInfo[]>([]);
    const [nets, setNets] = useState<NetInfo[]>([]);
    const [footprints, setFootprints] = useState<FootprintInfo[]>([]);
    const [opacities, setOpacities] = useState<ObjectOpacities>({ tracks: 1, vias: 1, pads: 1, zones: 1 });
    const [netFilter, setNetFilter] = useState("");
    const [fpFilter, setFpFilter] = useState("");

    // Poll for content once the panel opens.
    useEffect(() => {
        if (!open) return;
        let stopped = false;
        const refresh = () => {
            if (stopped) return;
            const host = hostRef.current;
            if (!host) return;

            const board = findBoardEl(host);
            const inner = board?.viewer as DrawableViewer | undefined;

            // Layers
            if (inner?.layers?.in_ui_order) {
                const list: LayerInfo[] = [];
                for (const l of inner.layers.in_ui_order()) {
                    list.push({ name: l.name, color: l.color?.to_css?.() ?? "#888", visible: !!l.visible });
                }
                setLayers(list);
            }

            // Opacities (read current values from viewer)
            if (inner) {
                setOpacities({
                    tracks: inner.track_opacity ?? 1,
                    vias:   inner.via_opacity   ?? 1,
                    pads:   inner.pad_opacity   ?? 1,
                    zones:  inner.zone_opacity  ?? 1,
                });
            }

            // Nets
            const boardNets = inner?.board?.nets;
            if (boardNets && nets.length === 0) {
                setNets([...boardNets].filter(n => n.name).sort((a, b) => a.name.localeCompare(b.name)));
            }

            // Footprints
            const boardFps = inner?.board?.footprints;
            if (boardFps && footprints.length === 0) {
                setFootprints([...boardFps].filter(f => f.reference).sort((a, b) => a.reference.localeCompare(b.reference)));
            }

            // Schematic pages
            const schApp = findSchAppEl(host);
            if (schApp?.project?.sch_in_order) {
                const activeName = schApp.viewer?.sch_name;
                const list: PageInfo[] = [];
                for (const f of schApp.project.sch_in_order()) {
                    if (!f) continue;
                    list.push({ filename: f.filename, label: f.filename.replace(/\.kicad_sch$/i, ""), active: activeName === f.filename });
                }
                setPages(list);
            }
        };

        refresh();
        const id = window.setInterval(refresh, 500);
        return () => { stopped = true; window.clearInterval(id); };
    // nets.length / footprints.length intentionally excluded — we only fetch once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, hostRef]);

    // Reset transient filter + one-shot lists when panel reopens
    useEffect(() => {
        if (!open) { setNets([]); setFootprints([]); setNetFilter(""); setFpFilter(""); }
    }, [open]);

    // Instantly reflect canvas-driven page navigation (e.g. clicking a sheet link)
    // by listening for the "kicanvas:sheet:loaded" event the viewer fires on load.
    useEffect(() => {
        if (!open) return;
        const host = hostRef.current;
        if (!host) return;

        const onSheetLoaded = (e: Event) => {
            const filename = (e as CustomEvent<string>).detail;
            if (!filename) return;
            setPages(prev => prev.map(p => ({ ...p, active: p.filename === filename })));
        };

        // The event may fire on the shadow root or on the host element itself.
        // Listen on both with `composed:true` catching bubbled events.
        host.addEventListener("kicanvas:sheet:loaded", onSheetLoaded);
        const sr = (host as HTMLElement).shadowRoot;
        sr?.addEventListener("kicanvas:sheet:loaded", onSheetLoaded);

        return () => {
            host.removeEventListener("kicanvas:sheet:loaded", onSheetLoaded);
            sr?.removeEventListener("kicanvas:sheet:loaded", onSheetLoaded);
        };
    }, [open, hostRef]);

    const switchPage = useCallback((filename: string) => {
        const host = hostRef.current;
        if (!host) return;
        const schApp = findSchAppEl(host);
        if (!schApp?.project?.sch_in_order || !schApp.viewer?.load) return;
        for (const f of schApp.project.sch_in_order()) {
            if (f?.filename === filename) { schApp.viewer.load(f); break; }
        }
    }, [hostRef]);

    const toggleLayer = useCallback((name: string) => {
        const host = hostRef.current;
        if (!host) return;
        const inner = (findBoardEl(host)?.viewer) as DrawableViewer | undefined;
        if (!inner?.layers?.in_ui_order) return;
        for (const l of inner.layers.in_ui_order()) {
            if (l.name === name) {
                l.visible = !l.visible;
                // Update the LIVE visibility map (read via the getter — the
                // ..._ctrl property is setter-only and reads as undefined) so the
                // hover/click hit-test and net isolation see the change.
                inner.layer_visibility?.set(l.name, l.visible);
                inner.draw?.();
                setLayers(prev => prev.map(l => l.name === name ? { ...l, visible: !l.visible } : l));
                break;
            }
        }
    }, [hostRef]);

    const setOpacity = useCallback((key: keyof ObjectOpacities, value: number) => {
        const host = hostRef.current;
        if (!host) return;
        const inner = (findBoardEl(host)?.viewer) as DrawableViewer | undefined;
        if (!inner) return;
        const propMap: Record<keyof ObjectOpacities, keyof DrawableViewer> = {
            tracks: "track_opacity", vias: "via_opacity", pads: "pad_opacity", zones: "zone_opacity",
        };
        (inner as Record<string, unknown>)[propMap[key]] = value;
        inner.draw?.();
        setOpacities(prev => ({ ...prev, [key]: value }));
    }, [hostRef]);

    const focusNet = useCallback((n: NetInfo) => {
        const inner = (findBoardEl(hostRef.current)?.viewer) as DrawableViewer | undefined;
        inner?.focus_net?.(n.number);
    }, [hostRef]);

    const focusFootprint = useCallback((fp: FootprintInfo) => {
        const inner = (findBoardEl(hostRef.current)?.viewer) as DrawableViewer | undefined;
        if (!inner) return;
        const found = inner.board?.find_footprint?.(fp.uuid) ?? fp;
        inner.focus_footprint?.(found as FootprintInfo);
    }, [hostRef]);

    if (!open) return null;

    const isSchematic = pages.length > 0 && layers.length === 0;

    // ── Schematic: simple pages list ──────────────────────────────────────────
    if (isSchematic) {
        return (
            <PanelShell>
                <PanelHeader icon={FileText} label="Pages" onClose={onClose} />
                <div className="overflow-y-auto prism-panel-scroll px-1.5 py-1.5">
                    <ul className="space-y-0.5">
                        {pages.map((p) => (
                            <li key={p.filename}>
                                <button
                                    onClick={() => switchPage(p.filename)}
                                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs transition-colors ${p.active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}
                                    type="button"
                                >
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="flex-1 truncate">{p.label}</span>
                                    {p.active && <Check className="h-3 w-3 shrink-0" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </PanelShell>
        );
    }

    // ── PCB: tabbed panel ─────────────────────────────────────────────────────
    const filteredNets = netFilter
        ? nets.filter(n => n.name.toLowerCase().includes(netFilter.toLowerCase()))
        : nets;
    const filteredFps = fpFilter
        ? footprints.filter(f =>
            f.reference.toLowerCase().includes(fpFilter.toLowerCase()) ||
            f.value.toLowerCase().includes(fpFilter.toLowerCase()))
        : footprints;

    return (
        <PanelShell>
            {/* Tab bar */}
            <div className="flex items-stretch border-b shrink-0 bg-muted/20">
                {PCB_TABS.map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        title={label}
                        type="button"
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors border-b-2 ${
                            tab === id
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                    </button>
                ))}
                <button
                    onClick={onClose}
                    type="button"
                    aria-label="Close panel"
                    className="flex items-center justify-center px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border-b-2 border-transparent"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Tab bodies */}
            <div className="flex-1 min-h-0 flex flex-col">

                {/* ── Layers ── */}
                {tab === "layers" && (
                    layers.length === 0
                        ? <p className="text-xs text-muted-foreground italic px-3 py-3">Loading…</p>
                        : <div className="flex flex-col flex-1 min-h-0">
                            <ul className="flex-1 overflow-y-auto prism-panel-scroll px-1.5 py-1.5 space-y-0.5">
                                {layers.map((l) => (
                                    <li key={l.name}>
                                        <button
                                            onClick={() => toggleLayer(l.name)}
                                            type="button"
                                            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs transition-colors hover:bg-muted/60 ${l.visible ? "" : "opacity-40"}`}
                                        >
                                            <span className="inline-block h-3 w-3 rounded-sm shrink-0 border border-border/60" style={{ background: l.color }} />
                                            <span className="flex-1 truncate font-mono text-[11px]">{l.name}</span>
                                            {l.visible
                                                ? <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                                                : <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <LayerPresetBar layers={layers} setLayers={setLayers} hostRef={hostRef} />
                        </div>
                )}

                {/* ── Objects ── */}
                {tab === "objects" && (
                    <div className="flex-1 overflow-y-auto prism-panel-scroll px-3 py-3 space-y-4">
                        {OBJECT_LABELS.map(({ key, label, icon: Icon }) => (
                            <div key={key}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-xs font-medium flex-1">{label}</span>
                                    <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                                        {Math.round(opacities[key] * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0} max={1} step={0.01}
                                    value={opacities[key]}
                                    onChange={e => setOpacity(key, parseFloat(e.target.value))}
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary bg-muted"
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Nets ── */}
                {tab === "nets" && (
                    <div className="flex flex-col flex-1 min-h-0">
                        <div className="px-2 py-2 border-b shrink-0">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border/40">
                                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Filter nets…"
                                    value={netFilter}
                                    onChange={e => setNetFilter(e.target.value)}
                                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                                />
                            </div>
                        </div>
                        {filteredNets.length === 0
                            ? <p className="text-xs text-muted-foreground italic px-3 py-3">{nets.length === 0 ? "Loading…" : "No matches"}</p>
                            : <ul className="flex-1 overflow-y-auto prism-panel-scroll px-1.5 py-1.5 space-y-0.5">
                                {filteredNets.map((n) => (
                                    <li key={n.number}>
                                        <button
                                            onClick={() => focusNet(n)}
                                            type="button"
                                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs hover:bg-muted/60 transition-colors"
                                        >
                                            <Network className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="flex-1 truncate font-mono text-[11px]">{n.name}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">{n.number}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        }
                    </div>
                )}

                {/* ── Components ── */}
                {tab === "components" && (
                    <div className="flex flex-col flex-1 min-h-0">
                        <div className="px-2 py-2 border-b shrink-0">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border/40">
                                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Filter components…"
                                    value={fpFilter}
                                    onChange={e => setFpFilter(e.target.value)}
                                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                                />
                            </div>
                        </div>
                        {filteredFps.length === 0
                            ? <p className="text-xs text-muted-foreground italic px-3 py-3">{footprints.length === 0 ? "Loading…" : "No matches"}</p>
                            : <ul className="flex-1 overflow-y-auto prism-panel-scroll px-1.5 py-1.5 space-y-0.5">
                                {filteredFps.map((fp) => (
                                    <li key={fp.uuid}>
                                        <button
                                            onClick={() => focusFootprint(fp)}
                                            type="button"
                                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs hover:bg-muted/60 transition-colors"
                                        >
                                            <Cpu className="h-3 w-3 shrink-0 text-muted-foreground" />
                                            <span className="font-medium shrink-0">{fp.reference}</span>
                                            <span className="flex-1 truncate text-muted-foreground text-[11px]">{fp.value}</span>
                                            <span className={`text-[9px] font-mono px-1 rounded shrink-0 ${fp.layer === "F.Cu" ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"}`}>
                                                {fp.layer === "F.Cu" ? "F" : "B"}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        }
                    </div>
                )}

            </div>
        </PanelShell>
    );
}

// ---------------------------------------------------------------------------
// Layer preset bar
// ---------------------------------------------------------------------------

type LayerPreset = {
    id: string;
    label: string;
    /** Returns true if the layer should be visible for this preset. */
    test: (name: string) => boolean;
};

const LAYER_PRESETS: LayerPreset[] = [
    {
        id: "all",
        label: "All",
        test: () => true,
    },
    {
        id: "front",
        label: "Front",
        test: (n) => n.startsWith("F.") || n === "Edge.Cuts",
    },
    {
        id: "back",
        label: "Back",
        test: (n) => n.startsWith("B.") || n === "Edge.Cuts",
    },
    {
        id: "copper",
        label: "Copper",
        test: (n) => n.includes(".Cu") || n === "Edge.Cuts",
    },
    {
        id: "outer-copper",
        label: "Outer Cu",
        test: (n) => n === "F.Cu" || n === "B.Cu" || n === "Edge.Cuts",
    },
    {
        id: "inner-copper",
        label: "Inner Cu",
        test: (n) => (n.includes(".Cu") && n !== "F.Cu" && n !== "B.Cu") || n === "Edge.Cuts",
    },
    {
        id: "drawings",
        label: "Drawings",
        test: (n) => !n.includes(".Cu") && !n.includes(".Mask") && !n.includes(".Paste") && !n.includes(".Adhes"),
    },
];

function setAllLayerVisibility(
    visible: boolean,
    hostRef: React.RefObject<ECadViewerElement | null>,
    setLayers: React.Dispatch<React.SetStateAction<LayerInfo[]>>,
) {
    const inner = (findBoardEl(hostRef.current)?.viewer) as DrawableViewer | undefined;
    if (!inner?.layers?.in_ui_order) return;
    for (const l of inner.layers.in_ui_order()) {
        l.visible = visible;
        // Live map via the getter (setter-only ..._ctrl reads as undefined).
        inner.layer_visibility?.set(l.name, visible);
    }
    inner.draw?.();
    setLayers(prev => prev.map(l => ({ ...l, visible })));
}

function applyPreset(
    preset: LayerPreset,
    hostRef: React.RefObject<ECadViewerElement | null>,
    setLayers: React.Dispatch<React.SetStateAction<LayerInfo[]>>,
) {
    const inner = (findBoardEl(hostRef.current)?.viewer) as DrawableViewer | undefined;
    if (!inner?.layers?.in_ui_order) return;
    for (const l of inner.layers.in_ui_order()) {
        l.visible = preset.test(l.name);
        // Live map via the getter (setter-only ..._ctrl reads as undefined).
        inner.layer_visibility?.set(l.name, l.visible);
    }
    inner.draw?.();
    setLayers(prev => prev.map(l => ({ ...l, visible: preset.test(l.name) })));
}

function LayerPresetBar({
    layers,
    setLayers,
    hostRef,
}: {
    layers: LayerInfo[];
    setLayers: React.Dispatch<React.SetStateAction<LayerInfo[]>>;
    hostRef: React.RefObject<ECadViewerElement | null>;
}) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const handlePreset = (preset: LayerPreset) => {
        if (activeId === preset.id) {
            // Re-click: reset to show all
            setAllLayerVisibility(true, hostRef, setLayers);
            setActiveId(null);
        } else {
            applyPreset(preset, hostRef, setLayers);
            setActiveId(preset.id);
        }
    };

    // If the user manually toggles individual layers, deactivate the preset chip
    // so it doesn't show a stale active state.
    const visibilitySig = layers.map(l => l.visible ? "1" : "0").join("");
    const prevSigRef = useRef(visibilitySig);
    useEffect(() => {
        if (prevSigRef.current !== visibilitySig) {
            prevSigRef.current = visibilitySig;
            // Don't clear if we just applied a preset (the sig will differ from "all visible").
            // Only clear when a manual toggle makes the state inconsistent with the active preset.
            if (activeId) {
                const preset = LAYER_PRESETS.find(p => p.id === activeId);
                if (preset) {
                    const stillMatches = layers.every(l => l.visible === preset.test(l.name));
                    if (!stillMatches) setActiveId(null);
                }
            }
        }
    }, [visibilitySig, activeId, layers]);

    return (
        <div className="shrink-0 border-t bg-muted/20 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Presets</p>
            <div className="flex flex-wrap gap-1">
                {LAYER_PRESETS.map((preset) => {
                    const isActive = activeId === preset.id;
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => handlePreset(preset)}
                            title={isActive ? `Reset (show all)` : preset.label}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                                isActive
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border/60 bg-background/60 hover:bg-accent hover:text-accent-foreground hover:border-accent"
                            }`}
                        >
                            {preset.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function PanelShell({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="absolute top-3 left-3 z-50 flex flex-col rounded-xl border bg-background/95 shadow-xl backdrop-blur-md overflow-hidden"
            style={{
                width: "min(18rem, calc(100% - 1.5rem))",
                maxHeight: "calc(100% - 1.5rem)",
                transformOrigin: "top left",
                animation: "prism-layers-panel-expand 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
        >
            {children}
        </div>
    );
}

function PanelHeader({ icon: Icon, label, onClose }: { icon: React.ElementType; label: string; onClose: () => void }) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider flex-1">{label}</p>
            <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60" type="button" aria-label="Close panel">
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

const LAYERS_PANEL_KEYFRAMES = `
    @keyframes prism-layers-panel-expand {
        from {
            transform: scale(0.18);
            opacity: 0;
            border-radius: 9999px;
        }
        60% {
            opacity: 1;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }

    .prism-panel-scroll {
        scrollbar-width: thin;
        scrollbar-color: hsl(var(--border)) transparent;
    }
    .prism-panel-scroll::-webkit-scrollbar {
        width: 4px;
    }
    .prism-panel-scroll::-webkit-scrollbar-track {
        background: transparent;
    }
    .prism-panel-scroll::-webkit-scrollbar-thumb {
        background: hsl(var(--border));
        border-radius: 9999px;
    }
    .prism-panel-scroll::-webkit-scrollbar-thumb:hover {
        background: hsl(var(--muted-foreground) / 0.5);
    }
`;

function ensureLayersPanelKeyframes() {
    if (typeof document === "undefined") return;
    if (document.getElementById("prism-layers-panel-keyframes")) return;
    const style = document.createElement("style");
    style.id = "prism-layers-panel-keyframes";
    style.textContent = LAYERS_PANEL_KEYFRAMES;
    document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Overlay RAF frame budgets
// ---------------------------------------------------------------------------
//
// The diff overlays reposition their markers on a requestAnimationFrame loop.
// `kick(n)` arms the loop for `n` frames so the overlay keeps tracking the
// canvas while it animates, then self-stops. These are the frame counts each
// interaction needs; they assume ~60fps. Shared by both diff viewers so the
// two RAF loops stay in lockstep.
export const OVERLAY_FRAMES = {
    /** Default budget when no specific interaction is known. */
    DEFAULT: 30,
    /** mousedown: generous budget that covers a full drag without re-arming (~3s @ 60fps). */
    DRAG: 180,
    /** mouseup / wheel / resize: a few settling frames after the interaction ends. */
    SETTLE: 20,
    /** On mount / when the marker set changes: catch the async ecad-viewer load. */
    LOAD: 30,
    /** Post-viewport-change (camera moved): just enough to re-sync positions. */
    VIEWPORT: 2,
    /** After a programmatic zoom-to-marker: track the camera through the move. */
    ZOOM_TO: 40,
    /** PCB only — when the shown version / svg group set changes. */
    GROUP_CHANGE: 5,
} as const;

// ---------------------------------------------------------------------------
// FpsMeter — TEMP diagnostic. Renders a small live FPS readout in the corner
// of the viewer. Measures the browser's actual frame cadence (a proxy for
// main-thread health during pan/zoom). Enable by setting
// localStorage["kicad-prism:fps"] = "1". Remove after diagnosing the FPS drop.
// ---------------------------------------------------------------------------
export function FpsMeter() {
    const enabled = (() => {
        try { return localStorage.getItem("kicad-prism:fps") === "1"; } catch { return false; }
    })();
    const [fps, setFps] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        let raf = 0;
        let last = performance.now();
        let frames = 0;
        let acc = 0;
        const tick = (now: number) => {
            const dt = now - last; last = now; acc += dt; frames++;
            if (acc >= 500) { setFps(Math.round((frames * 1000) / acc)); frames = 0; acc = 0; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [enabled]);
    if (!enabled) return null;
    const color = fps >= 50 ? "#22c55e" : fps >= 30 ? "#f59e0b" : "#ef4444";
    return (
        <div style={{
            position: "absolute", top: 6, left: 6, zIndex: 50,
            font: "600 12px ui-monospace, monospace", color,
            background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: 4,
            pointerEvents: "none",
        }}>{fps} fps</div>
    );
}

// ---------------------------------------------------------------------------
// useViewerReadiness — true once the underlying ecad-viewer is safe to drive
// (camera mounted, document loaded). The caller supplies a `probe` predicate
// that returns true when the inner element is ready — schematics check
// `kc-schematic-app` + viewer.document, PCB check `kc-board-viewer` + viewer.viewport.camera.
//
// Why not events-only: kicanvas reliably dispatches kicanvas:sheet:loaded for
// schematics but the corresponding signal for PCB is not exposed at the host
// level in this build. A single rAF-driven probe (no setTimeout chains) is the
// only universally-available "is this thing ready yet" check. It self-stops
// the moment probe returns true.
//
// Resets on viewerKey change so consumers re-await when the host is rebuilt.
// ---------------------------------------------------------------------------

export interface UseViewerReadinessOpts {
    host: React.RefObject<ECadViewerElement | null>;
    /** Same viewerKey passed to EcadViewerHost. Resetting it (e.g. on commit
     *  change) re-arms the readiness signal. */
    viewerKey: string;
    /** Returns true when the host's inner viewer is mounted and loaded. */
    probe: (host: ECadViewerElement) => boolean;
}

export function useViewerReadiness({ host, viewerKey, probe }: UseViewerReadinessOpts): { ready: boolean } {
    const [ready, setReady] = useState(false);
    const probeRef = useRef(probe);
    probeRef.current = probe;

    useEffect(() => {
        setReady(false);
        let cancelled = false;
        let raf = 0;

        const tick = () => {
            if (cancelled) return;
            const el = host.current;
            if (el && probeRef.current(el)) {
                setReady(true);
                return; // Self-terminating — no infinite poll.
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            cancelled = true;
            if (raf) cancelAnimationFrame(raf);
        };
    }, [host, viewerKey]);

    return { ready };
}

export function EcadViewerHost({
    viewerKey,
    files,
    viewerRef,
    onViewer,
    showLayersButton = true,
}: EcadViewerHostProps) {
    const hostRef = useRef<ECadViewerElement | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    useEffect(() => { ensureLayersPanelKeyframes(); }, []);

    const attach = useCallback((node: ECadViewerElement | null) => {
        hostRef.current = node;
        if (viewerRef) {
            (viewerRef as React.MutableRefObject<ECadViewerElement | null>).current = node;
        }
        onViewer?.(node);
    }, [viewerRef, onViewer]);

    // Stable signature so we only re-load when files actually change.
    const filesKey = files.map(f => f.filename).join("|");

    useLayoutEffect(() => {
        const viewer = hostRef.current;
        if (!viewer || files.length === 0) return;

        let cancelled = false;
        // Passthrough state that we need available to the outer cleanup.
        let passthroughAttached = false;
        let passthroughHandler: EventListener | null = null;
        let passthroughPollId: number | undefined;

        (async () => {
            await customElements.whenDefined("ecad-blob");
            if (cancelled || !hostRef.current) return;

            const el = hostRef.current;
            injectViewerStyles(el as unknown as HTMLElement);
            el.querySelectorAll("ecad-blob").forEach((b) => b.remove());

            for (const { filename, content } of files) {
                if (cancelled) return;
                const blob = document.createElement("ecad-blob") as HTMLElement & {
                    filename?: string; content?: string;
                };
                blob.filename = filename;
                blob.content = content;
                el.appendChild(blob);
            }

            if (cancelled) return;
            const withLoader = el as ECadViewerElement & { load_src?: () => Promise<void> | void };
            if (typeof withLoader.load_src === "function") {
                await withLoader.load_src();
            }

            // Some selection events are generated inside the viewer's shadow DOM
            // and may not cross the shadow boundary. Add a best-effort
            // passthrough that listens inside the shadow root and re-dispatches
            // the event on the host element with `composed: true` so outer
            // listeners (like useEcadInfoPanel) reliably receive it.
            const tryAttachPassthrough = (): boolean => {
                const sr = (el as HTMLElement).shadowRoot as ShadowRoot | null;
                if (!sr) return false;
                passthroughHandler = (e: Event) => {
                    try {
                        const detail = (e as CustomEvent)?.detail;
                        const rebroadcast = new CustomEvent("kicanvas:select", { detail, bubbles: true, composed: true });
                        el.dispatchEvent(rebroadcast);
                    } catch {
                        // best-effort; ignore
                    }
                };
                sr.addEventListener("kicanvas:select", passthroughHandler as EventListener);
                passthroughAttached = true;
                return true;
            };

            // Try immediately, then poll briefly in case viewer internals attach later.
            if (!tryAttachPassthrough()) {
                passthroughPollId = window.setInterval(() => {
                    if (passthroughAttached) return;
                    tryAttachPassthrough();
                }, 250);
                // Stop polling after a short timeout.
                window.setTimeout(() => { if (passthroughPollId) { window.clearInterval(passthroughPollId); passthroughPollId = undefined; } }, 5000);
            }
        })();

        const stylePollId = window.setInterval(() => {
            if (cancelled) return;
            const el = hostRef.current;
            if (el) injectViewerStyles(el as unknown as HTMLElement);
        }, 750);

        return () => {
            cancelled = true;
            try {
                window.clearInterval(stylePollId);
                if (passthroughPollId) {
                    window.clearInterval(passthroughPollId);
                    passthroughPollId = undefined;
                }
                const el = hostRef.current;
                if (el && passthroughAttached && passthroughHandler) {
                    const sr = (el as HTMLElement).shadowRoot as ShadowRoot | null;
                    if (sr) sr.removeEventListener("kicanvas:select", passthroughHandler as EventListener);
                }
            } catch { /* swallow cleanup errors */ }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewerKey, filesKey]);

    const props: Record<string, string> = { "show-header": "false" };

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <ecad-viewer
                ref={attach}
                style={{ width: "100%", height: "100%" }}
                key={viewerKey}
                {...props}
            />
            {showLayersButton && (
                <button
                    aria-label="Open layers panel"
                    title="Layers"
                    onClick={() => setIsPanelOpen(true)}
                    className={`absolute top-3 left-3 z-50 bg-background/90 border border-border rounded-full p-2 shadow hover:shadow-md transition-all duration-200 ease-out ${isPanelOpen ? "opacity-0 pointer-events-none scale-90" : "opacity-100"}`}
                    type="button"
                >
                    <Layers className="h-4 w-4 text-foreground" />
                </button>
            )}
            {showLayersButton && (
                <LayersPanel
                    open={isPanelOpen}
                    onClose={() => setIsPanelOpen(false)}
                    hostRef={hostRef}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// useBoardClickFix — PCB-only patches for reliable selection
// ---------------------------------------------------------------------------
//
// Two issues with kicanvas/ecad-viewer's BoardViewer hit-testing:
//   1. `find_items_under_pos` early-returns nothing when its layer-visibility
//      map is empty. The map is sourced from a Layers panel widget that may
//      not be rendered to the DOM yet when our viewer mounts — so all pads
//      fail the visibility check and the click falls through to the footprint.
//   2. When a wire ends on a pad, the wire's hit comes before the pad's in
//      the result list, so `r[0]` selects the wire instead of the pad.
//
// This hook polls the viewer until it's ready, populates a fallback
// visibility map, and monkey-patches `find_items_under_pos` to bubble pads
// to the front (and lines to the back).
//
// Schematic viewers do not need this; only call from PCB sites.

type LayerLike = { name: string; visible: boolean };
type LayerSet  = { in_ui_order?: () => Iterable<LayerLike> };
type InteractiveItem = {
    bbox?: unknown;
    line?: unknown;
    item?: unknown;
};
type InnerBoardViewer = {
    viewport?: unknown;
    layers?: LayerSet;
    /** Fork opt-in: a multi-item click selects the best-priority item instead
     *  of popping the (host-hidden) disambiguation menu. See useBoardClickFix. */
    auto_select_single?: boolean;
    /**
     * NOTE: kicanvas exposes this as a SETTER ONLY (no public getter). Reading
     * it always returns undefined; the underlying `#r` field is private. Use
     * `layer_visibility` (getter, returns the Map or null) to detect whether
     * a real ctrl has been installed by the Layers panel.
     */
    layer_visibility_ctrl?: { visibilities?: Map<string, boolean>; clear_highlight?: () => void } | null;
    layer_visibility?: Map<string, boolean> | null;
    find_items_under_pos?: (p: { x: number; y: number }) => InteractiveItem[];
    /** kicanvas-internal: isolates a footprint on dblclick. We wrap this to
     *  suppress the slanted-stripe overlay that's drawn on top. */
    highlight_fp?: (item: unknown) => void;
    painter?: { highlight?: (h: unknown) => void };
    __padPriorityPatched?: boolean;
    __stubCtrlInstalled?: boolean;
    __fpHighlightPatched?: boolean;
};
type BoardEl = HTMLElement & { viewer?: InnerBoardViewer };

/** Walk the shadow DOM to find the live BoardViewer element. */
export function findBoardEl(host: ECadViewerElement | null): BoardEl | null {
    if (!host?.shadowRoot) return null;
    const walk = (root: ShadowRoot | Element): BoardEl | null => {
        const sr = (root as HTMLElement).shadowRoot;
        const searchRoot = sr ?? root;
        const el = (searchRoot as ShadowRoot).querySelector?.("kc-board-viewer") as BoardEl | null;
        if (el?.viewer) return el;
        for (const child of (searchRoot as ShadowRoot).querySelectorAll?.("*") ?? []) {
            if ((child as HTMLElement).shadowRoot) {
                const f = walk(child as HTMLElement);
                if (f) return f;
            }
        }
        return el ?? null;
    };
    return walk(host);
}

interface UseBoardClickFixOpts {
    /** Refs to the PCB viewer hosts that should be patched. */
    viewerRefs: React.RefObject<ECadViewerElement | null>[];
    /** Set this to a value that changes when the viewer reloads (e.g. data). */
    rebindKey?: unknown;
}

export function useBoardClickFix({ viewerRefs, rebindKey }: UseBoardClickFixOpts) {
    useEffect(() => {
        let stopped = false;

        const ensureFor = (host: ECadViewerElement | null): boolean => {
            if (!host) return false;
            const inner = findBoardEl(host)?.viewer;
            if (!inner) return false;
            const layers = inner.layers?.in_ui_order ? Array.from(inner.layers.in_ui_order()) : [];
            if (layers.length === 0) return false;

            // (0) Opt into single-select on multi-item clicks. We priority-sort
            // find_items_under_pos below (pads → footprints → lines), and our
            // React UI hides kicanvas's disambiguation pop-menu, so a multi-item
            // click would otherwise dispatch a null selection + a menu nobody
            // sees — the "hover shows a box but click does nothing" bug. With
            // this flag the fork selects items[0] (our best pick) instead.
            inner.auto_select_single = true;

            // (1) Ensure the layer_visibility map exists.
            //
            // The ctrl is private (`#r`, setter only). We can't read it directly,
            // but we CAN read its visibilities map via the public getter
            // `inner.layer_visibility`. If that returns a non-empty Map, the
            // real Layers panel ctrl is installed — leave it alone.
            //
            // If it's null/empty, we install a stub. The stub MUST include a
            // no-op `clear_highlight` because kicanvas's `highlight_net()` calls
            // `this.#r.clear_highlight()` before painting (double-click net
            // highlight would otherwise throw and silently fail).
            const visMap = inner.layer_visibility;
            const ctrlMissing = !visMap || visMap.size === 0;
            if (ctrlMissing && !inner.__stubCtrlInstalled) {
                const fresh = new Map<string, boolean>();
                for (const l of layers) fresh.set(l.name, l.visible !== false);
                inner.layer_visibility_ctrl = {
                    visibilities: fresh,
                    clear_highlight: () => { /* no-op — real Layers panel handles this when present */ },
                };
                inner.__stubCtrlInstalled = true;
            }

            // (2a) Suppress kicanvas's slanted-stripe overlay drawn on a
            // footprint when it's focused via double-click. The stripes come
            // from painting onto the selection_mask layer inside
            // `paint_footprint` (which the GL pipeline renders with a striped
            // mask shader). We wrap `highlight_fp` so it skips paint_footprint
            // and painter.highlight, while preserving zone-layer hiding (the
            // grayed-out look) and the camera zoom that focus_footprint adds.
            if (!inner.__fpHighlightPatched
                && typeof inner.highlight_fp === "function"
                && inner.painter
            ) {
                const painter = inner.painter as {
                    paint_footprint?: (e: unknown) => void;
                    highlight?: (h: unknown) => void;
                };
                const origPaintFp   = painter.paint_footprint?.bind(painter);
                const origHighlight = painter.highlight?.bind(painter);
                const origFp = inner.highlight_fp.bind(inner);
                inner.highlight_fp = (item: unknown) => {
                    // Temporarily neuter the two calls inside highlight_fp that
                    // draw the stripes. The zone-layer hide loop at the top of
                    // highlight_fp still runs, so we keep the gray-out + zoom.
                    if (painter.paint_footprint) painter.paint_footprint = () => {};
                    if (painter.highlight)      painter.highlight      = () => {};
                    try { origFp(item); }
                    finally {
                        if (origPaintFp)   painter.paint_footprint = origPaintFp;
                        if (origHighlight) painter.highlight       = origHighlight;
                    }
                };
                inner.__fpHighlightPatched = true;
            }

            // (2) Bubble pads to the front of pick results.
            if (!inner.__padPriorityPatched && typeof inner.find_items_under_pos === "function") {
                const orig = inner.find_items_under_pos.bind(inner);
                inner.find_items_under_pos = (p) => {
                    const out = orig(p) as InteractiveItem[];
                    if (!out || out.length < 2) return out;
                    return [...out].sort((a, b) => priority(a) - priority(b));
                };
                inner.__padPriorityPatched = true;
            }
            return true;
        };

        const priority = (it: InteractiveItem): number => {
            if ((it as { line?: unknown }).line !== undefined) return 2;
            const inner = (it as { item?: { number?: unknown; reference?: unknown } }).item;
            if (inner && inner.number != null && inner.reference == null) return 0;
            return 1;
        };

        const tick = () => {
            if (stopped) return;
            const allOk = viewerRefs.every(r => ensureFor(r.current));
            if (!allOk) window.setTimeout(tick, 250);
        };
        tick();

        return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rebindKey]);
}

// ---------------------------------------------------------------------------
// Viewer hotkeys
// ---------------------------------------------------------------------------
//
// Maps a KiCad-ish subset of keyboard shortcuts onto the read-only kicanvas
// viewers. Only the ones that make sense without an editor are wired up:
// zoom / fit / redraw / sheet navigation / close.

type ZoomCapableInner = {
    zoom_in?: () => void;
    zoom_out?: () => void;
    zoom_fit_top_item?: () => void;
    zoom_to_board?: () => void;
    draw?: () => void;
    viewport?: { camera?: { zoom?: number } };
};

type InnerHost = HTMLElement & { viewer?: ZoomCapableInner };

/** Walk shadow roots to find a kicanvas inner element exposing `viewer`. */
function findInnerKicanvas(host: HTMLElement | null): InnerHost | null {
    if (!host) return null;
    const sels = "kc-board-viewer, kc-schematic-viewer, kc-schematic-app";
    const walk = (root: ShadowRoot | Element): InnerHost | null => {
        const sr = (root as HTMLElement).shadowRoot;
        const searchRoot = sr ?? root;
        const el = (searchRoot as ShadowRoot).querySelector?.(sels) as InnerHost | null;
        if (el?.viewer) return el;
        for (const child of (searchRoot as ShadowRoot).querySelectorAll?.("*") ?? []) {
            if ((child as HTMLElement).shadowRoot) {
                const f = walk(child as HTMLElement);
                if (f) return f;
            }
        }
        return el ?? null;
    };
    return walk(host);
}

export interface UseViewerHotkeysOpts {
    /** Container that scopes the hotkeys. Keys are bound on this element. */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Viewer hosts driven by the hotkeys. The first one with a hovered/focused
     *  descendant wins; otherwise the first non-null ref is used. */
    viewerRefs: React.RefObject<ECadViewerElement | null>[];
    /** Optional: switch to the next sheet/board (PgDn). */
    onNextSheet?: () => void;
    /** Optional: switch to the previous sheet/board (PgUp). */
    onPrevSheet?: () => void;
    /** Optional: close the viewer (Esc). */
    onClose?: () => void;
    /** Disable all bindings (e.g. when a modal is open). */
    enabled?: boolean;
}

/**
 * Bind KiCad-style keyboard shortcuts to one or more ecad-viewer hosts.
 * - F1 / + / =       zoom in
 * - F2 / - / _       zoom out
 * - Home             fit screen (top item / page)
 * - Ctrl+Home        fit board outline (PCB only — falls back to fit screen)
 * - PgUp / PgDn      previous / next sheet or board
 * - Escape           close
 */
export function useViewerHotkeys({
    containerRef, viewerRefs, onNextSheet, onPrevSheet, onClose, enabled = true,
}: UseViewerHotkeysOpts) {
    useEffect(() => {
        if (!enabled) return;
        const container = containerRef.current;
        if (!container) return;

        // Resolve the viewer the hotkey should target. Prefer the host that
        // currently contains the hovered element; fall back to the first ref.
        const pickViewer = (): ECadViewerElement | null => {
            const hovered = container.querySelector(":hover");
            if (hovered) {
                for (const r of viewerRefs) {
                    if (r.current && (r.current === hovered || r.current.contains(hovered))) {
                        return r.current;
                    }
                }
            }
            for (const r of viewerRefs) if (r.current) return r.current;
            return null;
        };

        const isTypingTarget = (t: EventTarget | null): boolean => {
            const el = t as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
            if ((el as HTMLElement).isContentEditable) return true;
            return false;
        };

        const handler = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            // Don't fight modifier-combos we don't own (Ctrl+C, Ctrl+S, etc.)
            if (e.altKey || e.metaKey) return;

            const host = pickViewer();
            const inner = findInnerKicanvas(host)?.viewer;

            const consume = () => { e.preventDefault(); e.stopPropagation(); };
            const redraw = () => inner?.draw?.();

            switch (e.key) {
                case "F1":
                case "+":
                case "=":
                    if (e.ctrlKey || e.shiftKey) return;
                    // kicanvas's `zoom_in()` actually shrinks the view (its
                    // camera-zoom semantics are inverted from user expectation),
                    // so we call zoom_out here to produce a visual zoom-in.
                    inner?.zoom_out?.(); redraw(); consume(); return;
                case "F2":
                case "-":
                case "_":
                    if (e.ctrlKey || e.shiftKey) return;
                    inner?.zoom_in?.(); redraw(); consume(); return;
                case "Home":
                    if (e.ctrlKey) {
                        // Ctrl+Home → fit board outline if available, else fit page
                        (inner?.zoom_to_board ?? inner?.zoom_fit_top_item)?.();
                    } else {
                        inner?.zoom_fit_top_item?.();
                    }
                    redraw(); consume(); return;
                case "PageDown":
                    if (e.ctrlKey || e.shiftKey) return;
                    if (onNextSheet) { onNextSheet(); consume(); }
                    return;
                case "PageUp":
                    if (e.ctrlKey || e.shiftKey) return;
                    if (onPrevSheet) { onPrevSheet(); consume(); }
                    return;
                case "Escape":
                    if (onClose) { onClose(); consume(); }
                    return;
            }
        };

        // Bind to window — focus on a custom element doesn't always reach our
        // container. We still scope behavior by visibility via the container's
        // own connectedness check.
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [containerRef, viewerRefs, onNextSheet, onPrevSheet, onClose, enabled]);
}

// ---------------------------------------------------------------------------
// Hotkeys legend
// ---------------------------------------------------------------------------
//
// Small floating "?" pill that expands into a list of the active hotkeys.
// Anchored to the bottom-right of the viewer container.

export interface HotkeyEntry {
    keys: string[];   // displayed as separate <kbd>s joined by "or"
    label: string;
}

export interface HotkeysLegendProps {
    entries: HotkeyEntry[];
    /** Override absolute-position className (default: bottom-right). */
    className?: string;
}

export function HotkeysLegend({ entries, className }: HotkeysLegendProps) {
    const [open, setOpen] = useState(false);
    return (
        <div
            className={className ?? "absolute bottom-2 right-2 z-30"}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label="Show keyboard shortcuts"
                className="flex items-center justify-center h-7 w-7 rounded-full bg-background/90 border border-border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
                <Keyboard className="h-3.5 w-3.5" />
            </button>
            {open && (
                <div className="absolute bottom-9 right-0 min-w-[200px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2 text-xs">
                    <p className="font-medium px-1 pb-1.5 text-muted-foreground">Keyboard shortcuts</p>
                    <ul className="space-y-1">
                        {entries.map((entry, i) => (
                            <li key={i} className="flex items-center justify-between gap-3 px-1">
                                <span className="text-foreground">{entry.label}</span>
                                <span className="flex items-center gap-1">
                                    {entry.keys.map((k, ki) => (
                                        <span key={ki} className="flex items-center gap-1">
                                            {ki > 0 && <span className="text-[10px] text-muted-foreground">or</span>}
                                            <kbd className="font-mono text-[10px] leading-none px-1.5 py-0.5 rounded border border-border bg-muted">{k}</kbd>
                                        </span>
                                    ))}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Common zoom/fit/redraw entries shared by every viewer. */
export const COMMON_HOTKEYS: HotkeyEntry[] = [
    { keys: ["F1", "+"],   label: "Zoom in" },
    { keys: ["F2", "−"],   label: "Zoom out" },
    { keys: ["Home"],      label: "Fit to page" },
    { keys: ["Ctrl+Home"], label: "Fit to objects" },
];
