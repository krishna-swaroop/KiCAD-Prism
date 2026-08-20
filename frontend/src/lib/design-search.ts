/**
 * Design-entity search over the Visualizer semantic index.
 *
 * v1 is a header combobox (components + nets). Tab-specific find boxes
 * (schematic pages, 3D Find, BOM filter) should call the same helpers when
 * they are removed in v2, rather than growing a second query implementation.
 *
 * Matching uses Fuse with the same options as the workspace project search:
 * `threshold: 0.35` and `ignoreLocation: true`. Net names also expose a compact
 * form (`I2C_SDA` → `i2csda`) so punctuation does not hide a hit.
 */

import Fuse from "fuse.js";

import type {
    PrismSelection,
    PrismSelectionContext,
    PrismSemanticIndex,
    SemanticComponent,
    SemanticNet,
} from "@/types/prism-selection";

export const VISUALIZER_DESIGN_SEARCH_SLOT_ID = "visualizer-design-search-slot";

export const DESIGN_SEARCH_HINT = "Reference, value, footprint, or net name";

const DEFAULT_GROUP_LIMIT = 25;

/** Nets use the workspace Fuse looseness. Components are tighter: short values like `10k` / `100n` collide at 0.35. */
const COMPONENT_FUSE_OPTIONS = {
    threshold: 0.2,
    includeScore: true,
    ignoreLocation: true,
} as const;

const NET_FUSE_OPTIONS = {
    threshold: 0.35,
    includeScore: true,
    ignoreLocation: true,
} as const;

export type DesignSearchHitKind = "component" | "net";

export interface DesignSearchHit {
    kind: DesignSearchHitKind;
    id: string;
    title: string;
    subtitle: string;
    score: number;
    component?: SemanticComponent;
    net?: SemanticNet;
}

interface ComponentRecord {
    component: SemanticComponent;
    reference: string;
    value: string;
    footprint: string;
    fields: string;
}

interface NetRecord {
    net: SemanticNet;
    name: string;
    netClass: string;
    aliases: string;
    compact: string;
    tokens: string;
}

const componentEngines = new WeakMap<PrismSemanticIndex, Fuse<ComponentRecord>>();
const netEngines = new WeakMap<PrismSemanticIndex, Fuse<NetRecord>>();

export function searchDesignEntities(
    index: PrismSemanticIndex | null,
    query: string,
    options?: {
        currentPage?: string | null;
        limit?: number;
    },
): DesignSearchHit[] {
    const needle = query.trim();
    if (!index || !needle) return [];

    const limit = options?.limit ?? DEFAULT_GROUP_LIMIT;
    const currentPage = options?.currentPage ?? null;

    const components = componentEngine(index)
        .search(needle)
        .slice(0, limit)
        .map((result) => componentHit(result.item.component, fuseScore(result.score), currentPage));
    const nets = netEngine(index)
        .search(needle)
        .slice(0, limit)
        .map((result) => netHit(result.item.net, fuseScore(result.score)));
    return [...components, ...nets];
}

export function selectionFromDesignSearchHit(
    hit: DesignSearchHit,
    sourceContext: PrismSelectionContext,
    currentPage?: string | null,
): PrismSelection | null {
    if (hit.kind === "component") {
        const component = hit.component;
        if (!component) return null;
        const schematic = preferredSchematicRef(component, currentPage ?? null);
        return {
            kind: "component",
            sourceContext,
            reference: component.reference,
            componentUid: component.componentUid,
            uuid: schematic?.symbolUuid,
            anchor: {
                context: sourceContext,
                uuid: schematic?.symbolUuid,
                page: schematic?.page,
                sheet: schematic?.sheetInstancePath || schematic?.page,
            },
        };
    }
    const net = hit.net;
    if (!net) return null;
    return {
        kind: "net",
        sourceContext,
        netName: net.name,
        netUid: net.netUid,
        netCode: net.netCode,
        anchor: {
            context: sourceContext,
            page: net.schematicRefs?.[0]?.page,
            sheet: net.schematicRefs?.[0]?.sheetInstancePath || net.schematicRefs?.[0]?.page,
        },
    };
}

function componentEngine(index: PrismSemanticIndex): Fuse<ComponentRecord> {
    const cached = componentEngines.get(index);
    if (cached) return cached;
    const engine = new Fuse(
        index.components.map((component) => {
            const fields = Object.values(component.fields ?? {}).map(fieldText).filter(Boolean);
            return {
                component,
                reference: component.reference,
                value: component.value ?? "",
                footprint: component.footprint ?? "",
                fields: fields.join(" "),
            };
        }),
        {
            ...COMPONENT_FUSE_OPTIONS,
            keys: [
                { name: "reference", weight: 2 },
                { name: "value", weight: 1.5 },
                { name: "footprint", weight: 1 },
                { name: "fields", weight: 1 },
            ],
        },
    );
    componentEngines.set(index, engine);
    return engine;
}

function netEngine(index: PrismSemanticIndex): Fuse<NetRecord> {
    const cached = netEngines.get(index);
    if (cached) return cached;
    const engine = new Fuse(
        index.nets.map((net) => {
            const aliases = netAliases(net);
            return {
                net,
                name: net.name,
                netClass: net.netClass ?? "",
                aliases: aliases.join(" "),
                compact: compactSearchText(net.name, ...aliases),
                tokens: tokenSearchText(net.name, net.netClass, ...aliases),
            };
        }),
        {
            ...NET_FUSE_OPTIONS,
            keys: [
                { name: "name", weight: 2 },
                { name: "compact", weight: 2 },
                { name: "tokens", weight: 2 },
                { name: "aliases", weight: 1.5 },
                { name: "netClass", weight: 1 },
            ],
        },
    );
    netEngines.set(index, engine);
    return engine;
}

function componentHit(
    component: SemanticComponent,
    score: number,
    currentPage: string | null,
): DesignSearchHit {
    const pageLabel = pageSubtitle(component, currentPage);
    const detail = [component.value, component.footprint, pageLabel].filter(Boolean).join(" · ");
    return {
        kind: "component",
        id: `component:${component.componentUid || component.reference}`,
        title: component.reference,
        subtitle: detail,
        score,
        component,
    };
}

function netHit(net: SemanticNet, score: number): DesignSearchHit {
    return {
        kind: "net",
        id: `net:${net.netUid || net.name}`,
        title: net.name,
        subtitle: net.netClass ?? "",
        score,
        net,
    };
}

function fuseScore(score: number | undefined): number {
    return 1 - (score ?? 0);
}

function netAliases(net: SemanticNet): string[] {
    return net.aliases ?? [];
}

function compactSearchText(...parts: Array<string | undefined>): string {
    return parts
        .map((part) => (part ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""))
        .filter(Boolean)
        .join(" ");
}

function tokenSearchText(...parts: Array<string | undefined>): string {
    return parts
        .map((part) => (part ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
        .filter(Boolean)
        .join(" ");
}

function pageSubtitle(component: SemanticComponent, currentPage: string | null): string | undefined {
    const refs = component.schematicRefs ?? [];
    if (refs.length === 0) return undefined;
    const onCurrent = currentPage
        ? refs.some((reference) => pageMatches(reference.page, currentPage) || pageMatches(reference.sheetInstancePath, currentPage))
        : false;
    if (onCurrent) return undefined;
    const first = refs[0];
    const label = first.page || first.sheetInstancePath;
    if (!label) return refs.length > 1 ? `${refs.length} pages` : undefined;
    return refs.length > 1 ? `${label} · ${refs.length} pages` : label;
}

function preferredSchematicRef(
    component: SemanticComponent,
    currentPage: string | null,
) {
    const refs = component.schematicRefs ?? [];
    if (currentPage) {
        const match = refs.find((reference) =>
            pageMatches(reference.page, currentPage) || pageMatches(reference.sheetInstancePath, currentPage)
        );
        if (match) return match;
    }
    return refs[0];
}

function pageMatches(value: string | undefined, currentPage: string): boolean {
    if (!value) return false;
    return value === currentPage || currentPage.endsWith(value) || value.endsWith(currentPage);
}

function fieldText(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    return String(value);
}
