#!/usr/bin/env node
/**
 * Parse a KiCad snapshot with ecad-viewer's own parser and emit an object
 * index.
 *
 * M1 of the Design Comparison revamp. The point is not speed for its own
 * sake: the server and the browser currently disagree about what objects a
 * design contains, because Prism scans the files in Python and the viewer
 * parses them with `kicad-sexpr-parser`. Using the same parser on both sides
 * makes "an object the server named" and "an object the viewer can resolve"
 * the same set by construction.
 *
 * Input is a snapshot directory. Output is one entry per addressable object:
 *
 *   { uuid, kind, documentPath, kiidPaths, at, rotation, mirror, layer,
 *     net, properties, parentUuid, hash }
 *
 * with no bounds, no point lists and no rendering geometry. `at` is a
 * centroid for every object, not only for components, because `position_delta`
 * groups by net and needs a position for tracks too.
 *
 * Usage:
 *   node scripts/ecad-parse.mjs <snapshot-dir> [--out FILE] [--summary-only]
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { BoardParser, SchematicParser } from "./vendor/kicad-sexpr-parser.mjs";

export const SCHEMA = "prism.ecad_object_index_v1";

/** Mirrors design_compare_service._GENERATED_PARTS. */
const GENERATED_PARTS = new Set([
    ".cache",
    ".git",
    ".kicad-prism",
    "archive",
    "autosave",
    "node_modules",
]);

// KiCad recomputes these or uses them as editor bookkeeping. Hashing them
// reports changes that do not alter the reviewed design:
// - zone fills/render caches are regenerated after unrelated board edits;
// - fields_autoplaced records how KiCad positioned fields, while the authored
//   field coordinates/effects are hashed separately and remain reviewable.
const GENERATED_FIELDS = new Set([
    "fields_autoplaced",
    "filled_polygons",
    "render_cache",
]);

// Identity, not content. A wire whose uuid changed but whose geometry did not
// is the same wire moved between files, and the hash should say so.
const IDENTITY_FIELDS = new Set(["uuid", "tstamp"]);

function collect_documents(root) {
    const documents = [];
    const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!GENERATED_PARTS.has(entry.name)) {
                    walk(join(directory, entry.name));
                }
                continue;
            }
            const extension = extname(entry.name);
            if (
                extension === ".kicad_sch"
                || extension === ".kicad_pcb"
                || extension === ".kicad_pro"
                || extension === ".kicad_dru"
            ) {
                documents.push(join(directory, entry.name));
            }
        }
    };
    walk(root);
    return documents.sort();
}

function canonical(value) {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }
    if (value && typeof value === "object") {
        const result = {};
        for (const key of Object.keys(value).sort()) {
            if (IDENTITY_FIELDS.has(key) || GENERATED_FIELDS.has(key)) {
                continue;
            }
            const child = value[key];
            if (child === undefined) {
                continue;
            }
            result[key] = canonical(child);
        }
        return result;
    }
    // KiCad's JSON settings commonly contain binary float tails such as
    // 0.09999999999999999 for the authored value 0.1. They are serialization
    // details, not design intent. KiCad geometry itself is written to at most
    // six decimal places, so this also gives every supported document format
    // the same stable numeric boundary.
    if (typeof value === "number") {
        const normalized = Object.is(value, -0) ? 0 : value;
        return Number.isFinite(normalized) ? round6(normalized) : normalized;
    }
    return value;
}

function content_hash(value) {
    return createHash("blake2b512")
        .update(JSON.stringify(canonical(value)))
        .digest("hex")
        .slice(0, 16);
}

/** A hash of the object minus every addressable child.
 *
 * Without this, editing one pad reports the pad *and* its footprint, and
 * every group above it. The child is replaced by its own hash so that
 * re-parenting still registers on the parent.
 */
function shallow_hash(value, child_keys) {
    const shallow = { ...value };
    for (const key of child_keys) {
        const children = shallow[key];
        shallow[key] = Array.isArray(children)
            ? children.map((child) => child?.uuid ?? child?.tstamp ?? "")
            : undefined;
    }
    return content_hash(shallow);
}

/** Remove generated hierarchy presentation data from a schematic object.
 *
 * KiCad rewrites `(page ...)` values when the hierarchy is reordered. The
 * stable instance path, reference, and unit describe the design; the page
 * number is merely the current navigator/print ordering and must not turn an
 * otherwise identical symbol or sheet into a review item.
 */
function schematic_hash_value(item) {
    if (!item?.instances?.projects) {
        return item;
    }
    return {
        ...item,
        instances: {
            ...item.instances,
            projects: item.instances.projects.map((project) => ({
                ...project,
                paths: (project.paths ?? []).map((path) => {
                    const { page: _generatedPage, ...authoredPath } = path;
                    return authoredPath;
                }),
            })),
        },
    };
}

function point_of(at) {
    const position = at?.position;
    if (!position || typeof position.x !== "number") {
        return null;
    }
    return [position.x, position.y];
}

function centroid_of(points) {
    const usable = (points ?? []).filter(
        (point) => point && typeof point.x === "number" && typeof point.y === "number",
    );
    if (usable.length === 0) {
        return null;
    }
    const x = usable.reduce((total, point) => total + point.x, 0) / usable.length;
    const y = usable.reduce((total, point) => total + point.y, 0) / usable.length;
    return [round6(x), round6(y)];
}

function round6(value) {
    // KiCad writes at most 6 decimal places. Keeping the float's full tail
    // would make a centroid differ between runs of the same file.
    return Math.round(value * 1e6) / 1e6;
}

function entry(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
            result[key] = value;
        }
    }
    return result;
}

function vector_text(value) {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.join(" × ");
    if (typeof value.x === "number" && typeof value.y === "number") {
        return `${value.x} × ${value.y}`;
    }
    return JSON.stringify(canonical(value));
}

function list_text(values) {
    return (values ?? []).filter(Boolean).join(", ") || undefined;
}

function object_text(value) {
    if (!value || typeof value !== "object") return value;
    return JSON.stringify(canonical(value));
}

function stroke_text(stroke) {
    if (!stroke) return undefined;
    const parts = [];
    if (stroke.width !== undefined) parts.push(`${stroke.width} mm`);
    if (stroke.type) parts.push(stroke.type);
    return parts.join(", ") || object_text(stroke);
}

function graphic_review_fields(item) {
    return entry({
        "Graphic type": item.type,
        Text: item.text,
        Stroke: stroke_text(item.stroke),
        Fill: object_text(item.fill),
    });
}

function zone_review_fields(zone) {
    return entry({
        "Zone name": zone.name,
        "Zone layers": list_text(zone.layers ?? (zone.layer ? [zone.layer] : [])),
        Priority: zone.priority,
        Hatch: object_text(zone.hatch),
        "Pad connection": object_text(zone.connect_pads),
        "Minimum thickness": zone.min_thickness,
        Keepout: object_text(zone.keepout),
        "Fill rules": object_text(zone.fill),
    });
}

function net_class_review_fields(netClass) {
    return entry({
        Clearance: netClass.clearance,
        "Track width": netClass.track_width,
        "Via diameter": netClass.via_diameter,
        "Via drill": netClass.via_drill,
        "Microvia diameter": netClass.microvia_diameter,
        "Microvia drill": netClass.microvia_drill,
        "Differential pair width": netClass.diff_pair_width,
        "Differential pair gap": netClass.diff_pair_gap,
        "Differential pair via gap": netClass.diff_pair_via_gap,
    });
}

const SETTING_LABELS = {
    COPYRIGHT: "Copyright",
    DATE: "Date",
    LICENSE: "License",
    TITLE: "Title",
    VERSION: "Revision / version",
    allow_blind_buried_vias: "Allow blind/buried vias",
    allow_microvias: "Allow microvias",
    max_error: "Maximum approximation error (mm)",
    min_clearance: "Minimum copper clearance (mm)",
    min_connection: "Minimum connection width (mm)",
    min_copper_edge_clearance: "Minimum copper-to-edge clearance (mm)",
    min_hole_clearance: "Minimum copper-to-hole clearance (mm)",
    min_hole_to_hole: "Minimum hole-to-hole clearance (mm)",
    min_microvia_diameter: "Minimum microvia diameter (mm)",
    min_microvia_drill: "Minimum microvia drill (mm)",
    min_resolved_spokes: "Minimum resolved thermal spokes",
    min_silk_clearance: "Minimum silkscreen clearance (mm)",
    min_text_height: "Minimum text height (mm)",
    min_text_thickness: "Minimum text thickness (mm)",
    min_through_hole_diameter: "Minimum through-hole diameter (mm)",
    min_track_width: "Minimum track width (mm)",
    min_via_annular_width: "Minimum via annular width (mm)",
    min_via_diameter: "Minimum via diameter (mm)",
    solder_mask_to_copper_clearance: "Solder-mask-to-copper clearance (mm)",
    use_height_for_length_calcs: "Include via height in length calculations",
};

function humanize_setting(key) {
    if (SETTING_LABELS[key]) return SETTING_LABELS[key];
    return String(key)
        .replace(/^td_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toLocaleUpperCase());
}

function flattened_review_fields(value, prefix = "") {
    const fields = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (prefix) fields[prefix] = canonical(value);
        return fields;
    }
    for (const [key, child] of Object.entries(value)) {
        if (key === "meta") continue;
        const label = prefix
            ? `${prefix} · ${humanize_setting(key)}`
            : humanize_setting(key);
        if (child && typeof child === "object" && !Array.isArray(child)) {
            Object.assign(fields, flattened_review_fields(child, label));
        } else {
            fields[label] = canonical(child);
        }
    }
    return entry(fields);
}

function formatted_dimensions(values, keys) {
    if (!Array.isArray(values) || values.length === 0) return undefined;
    return values.map((value) => keys
        .map((key) => `${humanize_setting(key)} ${canonical(value?.[key] ?? 0)}`)
        .join(" / "));
}

function routing_preset_fields(settings) {
    return entry({
        "Track widths (mm)": canonical(settings.track_widths),
        "Via presets (mm)": formatted_dimensions(
            settings.via_dimensions,
            ["diameter", "drill"],
        ),
        "Differential-pair presets (mm)": formatted_dimensions(
            settings.diff_pair_dimensions,
            ["width", "gap", "via_gap"],
        ),
    });
}

function exclusion_details(signature) {
    const [violation = "DRC violation", rawX, rawY, ...objects] = String(signature).split("|");
    const x = Number(rawX);
    const y = Number(rawY);
    const location = Number.isFinite(x) && Number.isFinite(y)
        ? `${round6(x / 1e6)} × ${round6(y / 1e6)} mm`
        : undefined;
    const violationLabel = humanize_setting(violation);
    return {
        label: location ? `${violationLabel} at ${location}` : violationLabel,
        reviewFields: entry({
            Violation: violationLabel,
            Location: location,
            "Affected objects": objects.filter(Boolean).length,
        }),
    };
}

const ERC_PIN_TYPES = [
    "Input",
    "Output",
    "Bidirectional",
    "Tri-state",
    "Passive",
    "Free",
    "Unspecified",
    "Power input",
    "Power output",
    "Open collector",
    "Open emitter",
    "No connect",
];

function erc_exclusion_details(signature) {
    const [violation = "ERC violation", rawX, rawY, ...objects] = String(signature).split("|");
    const x = Number(rawX);
    const y = Number(rawY);
    const location = Number.isFinite(x) && Number.isFinite(y)
        ? `${round6(x / 1e4)} × ${round6(y / 1e4)} mm`
        : undefined;
    const violationLabel = humanize_setting(violation);
    return {
        label: location ? `${violationLabel} at ${location}` : violationLabel,
        reviewFields: entry({
            Violation: violationLabel,
            Location: location,
            "Affected items": objects.filter(Boolean).length,
        }),
    };
}

function erc_severity(value) {
    return ({ 0: "Allowed", 1: "Warning", 2: "Error", 3: "Excluded" })[value]
        ?? `Level ${String(value)}`;
}

function push_review_object(objects, {
    kind,
    name,
    documentPath,
    reviewFields,
    uuidIdentity = name,
}) {
    if (!reviewFields || Object.keys(reviewFields).length === 0) return false;
    objects.push(entry({
        uuid: `${kind.replace(/_/g, "-")}:${content_hash(uuidIdentity)}`,
        kind,
        name,
        documentPath,
        hash: content_hash(reviewFields),
        reviewFields,
        reviewOnly: true,
    }));
    return true;
}

function index_project(text, documentPath, timings) {
    const parseStarted = performance.now();
    const project = JSON.parse(text);
    timings.parserMs += performance.now() - parseStarted;
    const netSettings = project.net_settings ?? {};
    const classes = Array.isArray(netSettings.classes) ? netSettings.classes : [];
    const assignments = netSettings.netclass_assignments ?? {};
    const patterns = Array.isArray(netSettings.netclass_patterns)
        ? netSettings.netclass_patterns
        : [];
    const designSettings = project.board?.design_settings ?? {};
    const erc = project.erc ?? {};
    const objects = [];

    for (const netClass of classes) {
        const name = String(netClass.name ?? "").trim();
        if (!name) continue;
        const reviewFields = net_class_review_fields(netClass);
        objects.push(entry({
            uuid: `net-class:${content_hash(name)}`,
            kind: "net_class",
            name,
            documentPath,
            hash: content_hash(reviewFields),
            reviewFields,
            reviewOnly: true,
        }));
    }

    for (const [pattern, assignedClass] of Object.entries(assignments)) {
        const name = String(pattern).trim();
        if (!name) continue;
        const reviewFields = entry({
            "Net pattern": name,
            "Net class": assignedClass,
        });
        objects.push(entry({
            uuid: `net-class-assignment:${content_hash(name)}`,
            kind: "net_class_assignment",
            name,
            documentPath,
            hash: content_hash(reviewFields),
            reviewFields,
            reviewOnly: true,
        }));
    }

    for (const assignment of patterns) {
        const name = String(assignment?.pattern ?? "").trim();
        if (!name) continue;
        const reviewFields = entry({
            "Net pattern": name,
            "Net class": assignment.netclass,
        });
        objects.push(entry({
            uuid: `net-class-assignment:${content_hash(name)}`,
            kind: "net_class_assignment",
            name,
            documentPath,
            hash: content_hash(reviewFields),
            reviewFields,
            reviewOnly: true,
        }));
    }

    const boardConstraintCount = push_review_object(objects, {
        kind: "board_constraint",
        name: "Board constraints",
        documentPath,
        reviewFields: flattened_review_fields(designSettings.rules),
    }) ? 1 : 0;
    const severityCount = push_review_object(objects, {
        kind: "drc_severity",
        name: "DRC severities",
        documentPath,
        reviewFields: flattened_review_fields(designSettings.rule_severities),
    }) ? 1 : 0;
    const routingPresetCount = push_review_object(objects, {
        kind: "routing_preset",
        name: "Routing presets",
        documentPath,
        reviewFields: routing_preset_fields(designSettings),
    }) ? 1 : 0;
    const boardDefaultCount = push_review_object(objects, {
        kind: "board_default",
        name: "Board drawing defaults",
        documentPath,
        reviewFields: flattened_review_fields(designSettings.defaults),
    }) ? 1 : 0;
    const teardropCount = push_review_object(objects, {
        kind: "teardrop_setting",
        name: "Teardrop settings",
        documentPath,
        reviewFields: entry({
            Options: canonical(designSettings.teardrop_options),
            Parameters: canonical(designSettings.teardrop_parameters),
        }),
    }) ? 1 : 0;
    const zoneSettingCount = push_review_object(objects, {
        kind: "zone_setting",
        name: "Zone settings",
        documentPath,
        reviewFields: entry({
            "Allow external fillets": designSettings.zones_allow_external_fillets,
            "Use no outline": designSettings.zones_use_no_outline,
        }),
    }) ? 1 : 0;

    const exclusions = Array.isArray(designSettings.drc_exclusions)
        ? designSettings.drc_exclusions
        : [];
    for (const signature of exclusions) {
        const details = exclusion_details(signature);
        push_review_object(objects, {
            kind: "drc_exclusion",
            name: details.label,
            documentPath,
            reviewFields: details.reviewFields,
            // Object UUIDs inside KiCad's waiver signature are implementation
            // identities. The violation, location and affected-object count
            // describe the review intent and survive library UUID rewrites.
            uuidIdentity: `${details.label}:${details.reviewFields["Affected objects"]}`,
        });
    }

    const ercExclusions = Array.isArray(erc.erc_exclusions) ? erc.erc_exclusions : [];
    for (const signature of ercExclusions) {
        const details = erc_exclusion_details(signature);
        push_review_object(objects, {
            kind: "erc_exclusion",
            name: details.label,
            documentPath,
            reviewFields: details.reviewFields,
            uuidIdentity: `${details.label}:${details.reviewFields["Affected items"]}`,
        });
    }

    let ercPinRuleCount = 0;
    const pinMap = Array.isArray(erc.pin_map) ? erc.pin_map : [];
    for (let left = 0; left < pinMap.length; left += 1) {
        if (!Array.isArray(pinMap[left])) continue;
        for (let right = left; right < pinMap[left].length; right += 1) {
            const level = pinMap[left][right];
            if (level === undefined || level === null) continue;
            const leftName = ERC_PIN_TYPES[left] ?? `Pin type ${left}`;
            const rightName = ERC_PIN_TYPES[right] ?? `Pin type ${right}`;
            ercPinRuleCount += push_review_object(objects, {
                kind: "erc_pin_rule",
                name: `${leftName} ↔ ${rightName}`,
                documentPath,
                reviewFields: entry({
                    "Pin type A": leftName,
                    "Pin type B": rightName,
                    Severity: erc_severity(level),
                }),
                uuidIdentity: `${left}:${right}`,
            }) ? 1 : 0;
        }
    }

    const projectMetadataCount = push_review_object(objects, {
        kind: "project_metadata",
        name: "Project title-block variables",
        documentPath,
        reviewFields: flattened_review_fields(project.text_variables),
    }) ? 1 : 0;

    return {
        objects,
        anonymous: {},
        routeMetrics: {},
        collections: {
            net_classes: classes.length,
            net_class_assignments: Object.keys(assignments).length + patterns.length,
            board_constraints: boardConstraintCount,
            drc_severities: severityCount,
            routing_presets: routingPresetCount,
            board_defaults: boardDefaultCount,
            teardrop_settings: teardropCount,
            zone_settings: zoneSettingCount,
            drc_exclusions: exclusions.length,
            erc_exclusions: ercExclusions.length,
            erc_pin_rules: ercPinRuleCount,
            project_metadata: projectMetadataCount,
        },
    };
}

/** Minimal generic S-expression reader for .kicad_dru files.
 *
 * The board/schematic parser intentionally has no custom-rule grammar. A
 * generic reader is preferable here because rule conditions are user-authored
 * expressions and new KiCad constraint clauses should remain reviewable even
 * before Prism learns a friendly label for them.
 */
function parse_sexpressions(text) {
    const roots = [];
    const stack = [];
    let index = 0;
    const append = (value) => {
        if (stack.length) stack[stack.length - 1].push(value);
        else roots.push(value);
    };

    while (index < text.length) {
        const character = text[index];
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (character === ";" || character === "#") {
            while (index < text.length && text[index] !== "\n") index += 1;
            continue;
        }
        if (character === "(") {
            const form = [];
            append(form);
            stack.push(form);
            index += 1;
            continue;
        }
        if (character === ")") {
            if (!stack.length) throw new Error("Unexpected ')' in design rules");
            stack.pop();
            index += 1;
            continue;
        }
        if (character === '"') {
            let value = "";
            index += 1;
            while (index < text.length) {
                const current = text[index++];
                if (current === '"') break;
                if (current === "\\" && index < text.length) {
                    const escaped = text[index++];
                    value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
                } else {
                    value += current;
                }
            }
            append(value);
            continue;
        }
        const start = index;
        while (
            index < text.length
            && !/\s/.test(text[index])
            && text[index] !== "("
            && text[index] !== ")"
        ) {
            index += 1;
        }
        append(text.slice(start, index));
    }
    if (stack.length) throw new Error("Unclosed form in design rules");
    return roots;
}

function sexpr_text(value) {
    if (!Array.isArray(value)) {
        const text = String(value ?? "");
        return /[\s()]/.test(text) ? JSON.stringify(text) : text;
    }
    return `(${value.map(sexpr_text).join(" ")})`;
}

function rule_review_fields(rule) {
    const fields = {};
    const repeated = new Map();
    for (const clause of rule.slice(2)) {
        if (!Array.isArray(clause) || !clause.length) continue;
        const rawName = String(clause[0]);
        const number = (repeated.get(rawName) ?? 0) + 1;
        repeated.set(rawName, number);
        const label = `${humanize_setting(rawName)}${number > 1 ? ` ${number}` : ""}`;
        fields[label] = clause.slice(1).map(sexpr_text).join(" ");
    }
    // This catches future KiCad clauses and positional syntax without making
    // the UI expose parser internals. Whitespace/comments canonicalize away.
    fields.Definition = sexpr_text(rule);
    return entry(fields);
}

function index_design_rules(text, documentPath, timings) {
    const parseStarted = performance.now();
    const roots = parse_sexpressions(text);
    timings.parserMs += performance.now() - parseStarted;
    const rules = roots.filter((form) => Array.isArray(form) && form[0] === "rule");
    const objects = [];
    for (const rule of rules) {
        const name = String(rule[1] ?? "Unnamed custom rule").trim() || "Unnamed custom rule";
        push_review_object(objects, {
            kind: "custom_rule",
            name,
            documentPath,
            reviewFields: rule_review_fields(rule),
            uuidIdentity: name,
        });
    }
    return {
        objects,
        anonymous: {},
        routeMetrics: {},
        collections: { custom_rules: rules.length },
    };
}

/** Every KIID_PATH this symbol or sheet is placed at.
 *
 * A reused hierarchical sheet is one file, so each of its instances holds the
 * very same symbol UUIDs; KiCad identifies a symbol by sheet instance path +
 * UUID. Emitting an array rather than a single path is deliberate -- taking
 * the first one is what collapsed distinct components onto one change id.
 */
function kiid_paths(item) {
    const paths = new Set();
    for (const project of item?.instances?.projects ?? []) {
        for (const instance of project.paths ?? []) {
            if (typeof instance.path === "string" && instance.path) {
                paths.add(`${instance.path.replace(/\/$/, "")}/${item.uuid}`);
            }
        }
    }
    return paths.size > 0 ? [...paths].sort() : undefined;
}

function symbol_reference(symbol) {
    for (const project of symbol?.instances?.projects ?? []) {
        for (const instance of project.paths ?? []) {
            if (instance.reference) {
                return instance.reference;
            }
        }
    }
    if (symbol?.default_instance?.reference) {
        return symbol.default_instance.reference;
    }
    return symbol?.properties?.find((property) => property.name === "Reference")?.text;
}

function symbol_instances(symbol) {
    const instances = [];
    for (const project of symbol?.instances?.projects ?? []) {
        for (const instance of project.paths ?? []) {
            instances.push(
                entry({
                    reference: instance.reference,
                    path:
                        typeof instance.path === "string" && instance.path
                            ? `${instance.path.replace(/\/$/, "")}/${symbol.uuid}`
                            : undefined,
                }),
            );
        }
    }
    if (instances.length === 0 && symbol?.default_instance?.reference) {
        instances.push({ reference: symbol.default_instance.reference });
    }
    return instances.length > 0 ? instances : undefined;
}

function symbol_properties(symbol) {
    // Attributes, not just values. `at`, `hide` and `effects` on a property
    // are invisible to the current pipeline, which is why a field that only
    // moved reads as unchanged.
    return (symbol.properties ?? []).map((property) =>
        entry({
            name: property.name,
            value: property.text,
            at: point_of(property.at),
            rotation: property.at?.rotation,
            hide: property.hide === true ? true : undefined,
            effects: property.effects,
        }),
    );
}

function index_schematic(text, documentPath, timings) {
    const parseStarted = performance.now();
    const schematic = new SchematicParser().parse(text);
    timings.parserMs += performance.now() - parseStarted;
    const objects = [];
    const anonymous = {};

    const push = (item, kind, extra = {}, childKeys = []) => {
        if (!item?.uuid) {
            // Anonymous forms are not independently addressable -- the viewer
            // cannot resolve them either -- so they stay folded into whatever
            // parent's hash covers them. Counted, not silently dropped.
            anonymous[kind] = (anonymous[kind] ?? 0) + 1;
            return;
        }
        objects.push(
            entry({
                uuid: item.uuid,
                kind,
                documentPath,
                hash: shallow_hash(schematic_hash_value(item), childKeys),
                ...extra,
            }),
        );
    };

    for (const symbol of schematic.symbols ?? []) {
        const reference = symbol_reference(symbol);
        push(
            symbol,
            "symbol",
            entry({
                libId: symbol.lib_id,
                at: point_of(symbol.at),
                rotation: symbol.at?.rotation,
                mirror: symbol.mirror,
                unit: symbol.unit,
                // Keep both sides of assembly-state edits explicit. Omitting
                // KiCad's default `yes`/`no` values made the review card say
                // `— → No`, which is much weaker evidence than `Yes → No`.
                dnp: symbol.dnp === true,
                inBom: symbol.in_bom !== false,
                onBoard: symbol.on_board !== false,
                refdes: reference,
                kiidPaths: kiid_paths(symbol),
                instances: symbol_instances(symbol),
                properties: symbol_properties(symbol),
                reviewFields: entry({ Unit: symbol.unit }),
            }),
            // Not `properties`: a schematic property has no uuid, so
            // replacing it with a child reference would make every property
            // edit -- value, position, visibility -- invisible on the symbol.
            ["pins"],
        );
        for (const pin of symbol.pins ?? []) {
            push(
                pin,
                "pin",
                entry({
                    parentUuid: symbol.uuid,
                    number: pin.number,
                    refdes: reference,
                    // A pin instance carries no position of its own; the
                    // viewer derives it from the library symbol. Inheriting
                    // the parent's centroid keeps every object positioned
                    // without inventing geometry.
                    at: point_of(symbol.at),
                    reviewFields: entry({ "Pin number": pin.number }),
                }),
            );
        }
    }

    for (const sheet of schematic.sheets ?? []) {
        push(
            sheet,
            "sheet",
            entry({
                at: point_of(sheet.at),
                kiidPaths: kiid_paths(sheet),
                properties: symbol_properties(sheet),
            }),
            ["pins"],
        );
        for (const pin of sheet.pins ?? []) {
            const pinName = pin.name ?? pin.text;
            push(
                pin,
                "sheet_pin",
                entry({
                    parentUuid: sheet.uuid,
                    // The parser exposes hierarchical-sheet pin text as
                    // `name` (not `text`). Losing it reduced real interface
                    // renames to opaque UUID add/remove rows in the review UI.
                    name: pinName,
                    text: pinName,
                    at: point_of(pin.at),
                    rotation: pin.at?.rotation,
                    reviewFields: entry({
                        "Sheet pin": pinName,
                        "Electrical type": pin.shape,
                    }),
                }),
            );
        }
    }

    for (const [key, kind] of [
        ["wires", "wire"],
        ["buses", "bus"],
    ]) {
        for (const item of schematic[key] ?? []) {
            push(item, kind, entry({
                at: centroid_of(item.pts),
                reviewFields: entry({ Stroke: stroke_text(item.stroke) }),
            }));
        }
    }

    for (const alias of schematic.bus_aliases ?? []) {
        const name = String(alias.name ?? "").trim();
        if (!name) {
            anonymous.bus_alias = (anonymous.bus_alias ?? 0) + 1;
            continue;
        }
        push_review_object(objects, {
            kind: "bus_alias",
            name,
            documentPath,
            reviewFields: entry({
                "Bus alias": name,
                Members: (alias.members ?? []).join(", "),
            }),
        });
    }

    for (const [key, kind] of [
        ["junctions", "junction"],
        ["no_connects", "no_connect"],
        ["bus_entries", "bus_entry"],
    ]) {
        for (const item of schematic[key] ?? []) {
            push(item, kind, entry({
                at: point_of(item.at),
                reviewFields: entry({
                    Diameter: item.diameter,
                    Size: vector_text(item.size),
                    Stroke: stroke_text(item.stroke),
                }),
            }));
        }
    }

    for (const [key, kind] of [
        ["net_labels", "label"],
        ["global_labels", "global_label"],
        ["hierarchical_labels", "hierarchical_label"],
    ]) {
        for (const item of schematic[key] ?? []) {
            push(
                item,
                kind,
                entry({
                    text: item.text,
                    net: item.text,
                    at: point_of(item.at),
                    rotation: item.at?.rotation,
                    reviewFields: entry({ Text: item.text }),
                }),
            );
        }
    }

    for (const drawing of schematic.drawings ?? []) {
        push(
            drawing,
            "graphic",
            entry({
                at:
                    point_of(drawing.at) ??
                    centroid_of(drawing.pts) ??
                    centroid_of([drawing.start, drawing.end].filter(Boolean)),
                text: drawing.text,
                reviewFields: graphic_review_fields(drawing),
            }),
        );
    }

    for (const image of schematic.images ?? []) {
        push(image, "image", entry({
            at: point_of(image.at),
            reviewFields: entry({ Scale: image.scale }),
        }));
    }
    for (const table of schematic.tables ?? []) {
        push(table, "table", entry({
            reviewFields: entry({
                Columns: table.column_count,
                Rows: table.row_heights?.length,
                "Table content": (table.cells ?? []).map((cell) => cell.text ?? "").join(" | "),
            }),
        }));
    }

    return {
        objects,
        anonymous,
        collections: {
            symbols: (schematic.symbols ?? []).length,
            sheets: (schematic.sheets ?? []).length,
            wires: (schematic.wires ?? []).length,
            buses: (schematic.buses ?? []).length,
            bus_aliases: (schematic.bus_aliases ?? []).length,
            junctions: (schematic.junctions ?? []).length,
            no_connects: (schematic.no_connects ?? []).length,
            bus_entries: (schematic.bus_entries ?? []).length,
            net_labels: (schematic.net_labels ?? []).length,
            global_labels: (schematic.global_labels ?? []).length,
            hierarchical_labels: (schematic.hierarchical_labels ?? []).length,
            drawings: (schematic.drawings ?? []).length,
            images: (schematic.images ?? []).length,
            tables: (schematic.tables ?? []).length,
            lib_symbols: (schematic.lib_symbols ?? []).length,
        },
    };
}

/** The net a board item belongs to, whichever shape the file used.
 *
 * The declared type is `number | string`, but the parser actually hands back
 * `{ number, name }` for pads, tracks and vias. Trusting the declaration
 * silently produced an undefined net on every copper object -- and
 * `position_delta` groups by net, so that would have split one net into many.
 */
function net_name_of(item, netsByCode) {
    const net = item?.net;
    if (net && typeof net === "object") {
        return net.name || netsByCode.get(net.number) || undefined;
    }
    if (typeof net === "string") {
        return net || undefined;
    }
    if (typeof net === "number") {
        return netsByCode.get(net) || undefined;
    }
    return undefined;
}

/** Canonical KiCad layer name across parser versions.
 *
 * Most board items expose a string, while text-like graphics may expose
 * `{ name, knockout }`. Letting that object cross the Node boundary makes the
 * Python adapter attempt to add a dictionary to a set.
 */
function layer_name_of(value) {
    if (value && typeof value === "object") {
        return value.name || value.canonical_name || undefined;
    }
    return typeof value === "string" && value ? value : undefined;
}

/** Footprint fields, from whichever of the two shapes the file uses.
 *
 * KiCad 8 moved footprint fields from the `properties` map to repeated
 * `(property "Name" "value")` forms, which the parser surfaces as
 * `properties_kicad_8`. Reading only `properties` left `refdes` undefined on
 * every footprint in every modern board.
 */
function footprint_properties(footprint) {
    const kicad8 = (footprint.properties_kicad_8 ?? []).map((property) =>
        entry({
            name: property.name,
            value: property.value ?? property.text,
            at: point_of(property.at),
            hide: property.hide === true ? true : undefined,
        }),
    );
    const properties = kicad8.length > 0
        ? kicad8
        : Object.entries(footprint.properties ?? {}).map(([name, value]) => ({
            name,
            value,
        }));
    // KiCad 7 stores Reference and Value only as fp_text entries. Without
    // this fallback every footprint, pad, and footprint graphic loses its
    // RefDes and the review panel can only show repeated library names.
    for (const [type, name] of [["reference", "Reference"], ["value", "Value"]]) {
        if (properties.some((property) => property.name === name)) continue;
        const authoredText = (footprint.fp_texts ?? []).find(
            (text) => String(text.type ?? "").toLocaleLowerCase() === type,
        );
        if (authoredText?.text !== undefined) {
            properties.push(entry({
                name,
                value: authoredText.text,
                at: point_of(authoredText.at),
                hide: authoredText.hide === true ? true : undefined,
            }));
        }
    }
    return properties;
}

function selected_layer_names(mask, layers) {
    if (!Number.isSafeInteger(mask) || mask < 0) return undefined;
    const bits = BigInt(mask);
    const selected = (layers ?? [])
        .filter((layer) => Number.isInteger(layer.ordinal) && layer.ordinal >= 0)
        .filter((layer) => ((bits >> BigInt(layer.ordinal)) & 1n) === 1n)
        .map((layer) => layer.canonical_name)
        .filter(Boolean);
    return selected.length ? selected : [];
}

function fabrication_output_fields(board) {
    const setup = board.setup ?? {};
    const plot = setup.pcbplotparams ?? {};
    const outputFormats = {
        1: "Gerber",
        2: "PostScript",
        3: "SVG",
        4: "DXF",
        5: "HPGL",
        6: "PDF",
    };
    return entry({
        "Solder mask expansion (mm)": setup.pad_to_mask_clearance,
        "Solder paste clearance (mm)": setup.pad_to_paste_clearance,
        "Solder paste clearance ratio": setup.pad_to_paste_clearance_ratio,
        "Plot layers": selected_layer_names(plot.layerselection, board.layers),
        "Plot on all layers": selected_layer_names(
            plot.plot_on_all_layers_selection,
            board.layers,
        ),
        "Output format": outputFormats[plot.outputformat] ?? plot.outputformat,
        "Output directory": plot.outputdirectory,
        "Use Gerber file extensions": plot.usegerberextensions,
        "Use Gerber X2 attributes": plot.usegerberattributes,
        "Use Gerber net attributes": plot.usegerberadvancedattributes,
        "Create Gerber job file": plot.creategerberjobfile,
        "Plot drawing sheet": plot.plotframeref,
        "Plot reference designators": plot.plotreference,
        "Plot component values": plot.plotvalue,
        "Plot invisible text": plot.plotinvisibletext,
        "Sketch pads on fabrication layers": plot.sketchpadsonfab,
        "Subtract solder mask from silkscreen": plot.subtractmaskfromsilk,
        "Include vias on solder mask": plot.viasonmask,
        "Use auxiliary origin": plot.useauxorigin,
        "Mirror output": plot.mirror,
        "Drill marks": plot.drillshape,
    });
}

function index_board(text, documentPath, timings) {
    const parseStarted = performance.now();
    const board = new BoardParser().parse(text);
    timings.parserMs += performance.now() - parseStarted;
    const objects = [];
    const anonymous = {};
    const netsByCode = new Map((board.nets ?? []).map((net) => [net.number, net.name]));
    const routeMetrics = {};

    const route_metric = (net) => {
        const name = net || "";
        return (routeMetrics[name] ??= {
            routeLengthMm: 0,
            viaCount: 0,
            usedLayers: [],
            viaSpans: {},
        });
    };

    const add_layer = (metric, value) => {
        const layer = layer_name_of(value);
        if (layer && !metric.usedLayers.includes(layer)) {
            metric.usedLayers.push(layer);
        }
    };

    const distance = (a, b) =>
        a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;

    const segment_length = (segment) => {
        if (!segment.mid) {
            return distance(segment.start, segment.end);
        }
        const a = segment.start;
        const b = segment.mid;
        const c = segment.end;
        if (!a || !b || !c) {
            return 0;
        }
        const determinant =
            2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(determinant) < 1e-12) {
            return distance(a, b) + distance(b, c);
        }
        const aa = a.x * a.x + a.y * a.y;
        const bb = b.x * b.x + b.y * b.y;
        const cc = c.x * c.x + c.y * c.y;
        const ux =
            (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y))
            / determinant;
        const uy =
            (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x))
            / determinant;
        const radius = Math.hypot(a.x - ux, a.y - uy);
        const angle = (point) => Math.atan2(point.y - uy, point.x - ux);
        const tau = Math.PI * 2;
        const ccw = ((angle(c) - angle(a)) % tau + tau) % tau;
        const midCcw = ((angle(b) - angle(a)) % tau + tau) % tau;
        const sweep = midCcw <= ccw + 1e-9 ? ccw : tau - ccw;
        return radius * sweep;
    };

    const push = (item, kind, extra = {}, childKeys = []) => {
        const uuid = item?.uuid || item?.tstamp;
        if (!uuid) {
            anonymous[kind] = (anonymous[kind] ?? 0) + 1;
            return;
        }
        objects.push(
            entry({
                uuid,
                kind,
                documentPath,
                // Copper objects carry a numeric net-table code in the raw
                // parser object. KiCad freely renumbers that table on save,
                // so hash the resolved semantic net name instead. A genuine
                // connectivity edit still changes both this hash and the
                // projected `net` field used by the diff classifier.
                hash: shallow_hash(
                    Object.prototype.hasOwnProperty.call(extra, "net")
                        ? { ...item, net: extra.net }
                        : item,
                    childKeys,
                ),
                ...extra,
            }),
        );
    };

    for (const footprint of board.footprints ?? []) {
        const parentUuid = footprint.uuid || footprint.tstamp;
        const properties = footprint_properties(footprint);
        const footprintReference = properties.find(
            (property) => property.name === "Reference",
        )?.value;
        push(
            footprint,
            "footprint",
            entry({
                libId: footprint.library_link,
                at: point_of(footprint.at),
                rotation: footprint.at?.rotation,
                layer: layer_name_of(footprint.layer),
                // `path` on a footprint is already the KIID_PATH of the
                // schematic symbol it came from.
                kiidPaths: footprint.path ? [footprint.path] : undefined,
                refdes: footprintReference,
                sheetfile: footprint.sheetfile || undefined,
                properties,
                reviewFields: entry({
                    Description: footprint.descr,
                    Attributes: object_text(footprint.attr),
                    "Exclude from BOM": footprint.attr?.exclude_from_bom === true,
                    "Exclude from position files":
                        footprint.attr?.exclude_from_pos_files === true,
                    "Board only": footprint.attr?.board_only === true,
                }),
            }),
            // Not `properties`: they carry no uuid, so replacing them with
            // child references would make every property edit invisible.
            ["pads", "zones", "drawings", "fp_texts", "models"],
        );
        for (const pad of footprint.pads ?? []) {
            push(
                pad,
                "pad",
                entry({
                    parentUuid,
                    number: pad.number,
                    refdes: footprintReference,
                    at: point_of(pad.at),
                    rotation: pad.at?.rotation,
                    layer: layer_name_of((pad.layers ?? [])[0]),
                    net: net_name_of(pad, netsByCode),
                    reviewFields: entry({
                        "Pad number": pad.number,
                        "Pad type": pad.type,
                        "Pad shape": pad.shape,
                        Size: vector_text(pad.size),
                        Drill: object_text(pad.drill),
                        Layers: list_text(pad.layers),
                        Clearance: pad.clearance,
                        "Solder mask margin": pad.solder_mask_margin,
                        "Solder paste margin": pad.solder_paste_margin,
                        "Thermal width": pad.thermal_width,
                        "Thermal gap": pad.thermal_gap,
                        "Zone connection": pad.zone_connect,
                    }),
                }),
            );
        }
        for (const zone of footprint.zones ?? []) {
            push(
                zone,
                "footprint_zone",
                entry({
                    parentUuid,
                    refdes: footprintReference,
                    at: centroid_of(
                        (zone.polygons ?? []).flatMap((poly) => poly.pts ?? []),
                    ),
                    layer: layer_name_of(
                        zone.layer ?? (zone.layers ?? [])[0],
                    ),
                    net: zone.net_name || net_name_of(zone, netsByCode),
                    name: zone.name,
                    reviewFields: zone_review_fields(zone),
                }),
            );
        }
        for (const drawing of footprint.drawings ?? []) {
            push(
                drawing,
                "footprint_graphic",
                entry({
                    parentUuid,
                    refdes: footprintReference,
                    at:
                        point_of(drawing.at) ??
                        centroid_of(drawing.pts) ??
                        centroid_of([drawing.start, drawing.mid, drawing.end].filter(Boolean)),
                    layer: layer_name_of(drawing.layer),
                    text: drawing.text,
                    reviewFields: graphic_review_fields(drawing),
                }),
            );
        }
        for (const text of footprint.fp_texts ?? []) {
            push(
                text,
                "footprint_text",
                entry({
                    parentUuid,
                    refdes: footprintReference,
                    at: point_of(text.at),
                    rotation: text.at?.rotation,
                    layer: layer_name_of(text.layer),
                    text: text.text,
                    reviewFields: entry({
                        "Text kind": text.type,
                        Text: text.text,
                    }),
                }),
            );
        }
    }

    for (const segment of board.segments ?? []) {
        const net = net_name_of(segment, netsByCode);
        const metric = route_metric(net);
        metric.routeLengthMm += segment_length(segment);
        add_layer(metric, segment.layer);
        push(
            segment,
            segment.mid ? "arc_segment" : "segment",
            entry({
                at: centroid_of([segment.start, segment.mid, segment.end].filter(Boolean)),
                layer: layer_name_of(segment.layer),
                net,
                reviewFields: entry({ Width: segment.width }),
            }),
        );
    }

    for (const via of board.vias ?? []) {
        const net = net_name_of(via, netsByCode);
        const layers = (via.layers ?? []).map(layer_name_of).filter(Boolean);
        const metric = route_metric(net);
        metric.viaCount += 1;
        for (const layer of layers) {
            add_layer(metric, layer);
        }
        const span = layers.length > 0 ? layers.join("|") : "";
        metric.viaSpans[span] = (metric.viaSpans[span] ?? 0) + 1;
        push(
            via,
            "via",
            entry({
                at: point_of(via.at),
                layer: layers[0],
                layers,
                net,
                reviewFields: entry({
                    "Via type": via.type,
                    Diameter: via.size,
                    Drill: via.drill,
                    "Layer span": list_text(layers),
                }),
            }),
        );
    }

    for (const zone of board.zones ?? []) {
        push(
            zone,
            "zone",
            entry({
                at: centroid_of((zone.polygons ?? []).flatMap((poly) => poly.pts ?? [])),
                layer: layer_name_of(zone.layer),
                net: zone.net_name || net_name_of(zone, netsByCode),
                name: zone.name,
                reviewFields: zone_review_fields(zone),
            }),
        );
    }

    for (const drawing of board.drawings ?? []) {
        push(
            drawing,
            "drawing",
            entry({
                at:
                    point_of(drawing.at) ??
                    centroid_of(drawing.pts) ??
                    centroid_of([drawing.start, drawing.mid, drawing.end].filter(Boolean)),
                layer: layer_name_of(drawing.layer),
                text: drawing.text,
                reviewFields: graphic_review_fields(drawing),
            }),
        );
    }

    for (const group of board.groups ?? []) {
        // KiCad's auto-generated board-characteristics and stackup tables come
        // through as groups with a name, no id and `members: [null]`. Nothing
        // can address them, here or in the viewer.
        push({ ...group, uuid: group.id }, "group", entry({
            name: group.name,
            reviewFields: entry({
                Group: group.name,
                Members: group.members?.length,
            }),
        }));
    }

    const fabricationOutputCount = push_review_object(objects, {
        kind: "fabrication_output",
        name: "Fabrication output settings",
        documentPath,
        reviewFields: fabrication_output_fields(board),
    }) ? 1 : 0;

    return {
        objects,
        anonymous,
        routeMetrics,
        collections: {
            footprints: (board.footprints ?? []).length,
            pads: (board.footprints ?? []).reduce(
                (total, footprint) => total + (footprint.pads ?? []).length,
                0,
            ),
            footprint_zones: (board.footprints ?? []).reduce(
                (total, footprint) => total + (footprint.zones ?? []).length,
                0,
            ),
            footprint_graphics: (board.footprints ?? []).reduce(
                (total, footprint) => total + (footprint.drawings ?? []).length,
                0,
            ),
            footprint_texts: (board.footprints ?? []).reduce(
                (total, footprint) => total + (footprint.fp_texts ?? []).length,
                0,
            ),
            segments: (board.segments ?? []).length,
            vias: (board.vias ?? []).length,
            zones: (board.zones ?? []).length,
            drawings: (board.drawings ?? []).length,
            groups: (board.groups ?? []).length,
            nets: (board.nets ?? []).length,
            fabrication_outputs: fabricationOutputCount,
        },
    };
}

/** Index one document's text. The unit the tests exercise. */
export function index_document(text, documentPath) {
    const timings = { parserMs: 0 };
    const extension = extname(documentPath);
    const result = extension === ".kicad_pcb"
        ? index_board(text, documentPath, timings)
        : extension === ".kicad_pro"
            ? index_project(text, documentPath, timings)
            : extension === ".kicad_dru"
                ? index_design_rules(text, documentPath, timings)
                : index_schematic(text, documentPath, timings);
    const byUuid = new Map(result.objects.map((object) => [object.uuid, object]));
    return { ...result, byUuid };
}

export function index_snapshot(root) {
    const started = performance.now();
    const documents = [];
    const objects = [];
    const collections = {};
    const anonymous = {};
    const routeMetrics = {};
    // `parserMs` is the parser alone; `parseMs` is parser plus building the
    // index on top of it. Keeping them apart is what makes this comparable
    // with the 639 ms the plan quotes, which measured only the parse.
    const timings = { parserMs: 0 };
    let readMs = 0;
    let parseMs = 0;

    for (const path of collect_documents(root)) {
        const documentPath = relative(root, path).split(sep).join("/");
        const readStarted = performance.now();
        const text = readFileSync(path, "utf8");
        readMs += performance.now() - readStarted;

        const parseStarted = performance.now();
        const extension = extname(path);
        const board = extension === ".kicad_pcb";
        const project = extension === ".kicad_pro";
        const designRules = extension === ".kicad_dru";
        let result;
        let error;
        try {
            result = board
                ? index_board(text, documentPath, timings)
                : project
                    ? index_project(text, documentPath, timings)
                    : designRules
                        ? index_design_rules(text, documentPath, timings)
                        : index_schematic(text, documentPath, timings);
        } catch (cause) {
            error = String(cause?.message ?? cause);
            result = { objects: [], collections: {}, anonymous: {}, routeMetrics: {} };
        }
        const elapsed = performance.now() - parseStarted;
        parseMs += elapsed;

        objects.push(...result.objects);
        for (const [key, value] of Object.entries(result.collections)) {
            collections[key] = (collections[key] ?? 0) + value;
        }
        for (const [key, value] of Object.entries(result.anonymous ?? {})) {
            anonymous[key] = (anonymous[key] ?? 0) + value;
        }
        for (const [net, value] of Object.entries(result.routeMetrics ?? {})) {
            const metric = (routeMetrics[net] ??= {
                routeLengthMm: 0,
                viaCount: 0,
                usedLayers: [],
                viaSpans: {},
            });
            metric.routeLengthMm += value.routeLengthMm ?? 0;
            metric.viaCount += value.viaCount ?? 0;
            metric.usedLayers = [
                ...new Set([...metric.usedLayers, ...(value.usedLayers ?? [])]),
            ].sort();
            for (const [span, count] of Object.entries(value.viaSpans ?? {})) {
                metric.viaSpans[span] = (metric.viaSpans[span] ?? 0) + count;
            }
        }
        documents.push(
            entry({
                path: documentPath,
                docType: board ? "kicad_pcb" : project ? "kicad_pro" : "kicad_sch",
                bytes: statSync(path).size,
                objects: result.objects.length,
                parseMs: Math.round(elapsed * 1000) / 1000,
                error,
            }),
        );
    }

    const byKind = {};
    for (const object of objects) {
        byKind[object.kind] = (byKind[object.kind] ?? 0) + 1;
    }

    return {
        schema: SCHEMA,
        root,
        documents,
        objects,
        routeMetrics,
        counts: { total: objects.length, byKind, anonymous },
        collections,
        timings: {
            readMs: Math.round(readMs * 1000) / 1000,
            parserMs: Math.round(timings.parserMs * 1000) / 1000,
            indexMs: Math.round((parseMs - timings.parserMs) * 1000) / 1000,
            parseMs: Math.round(parseMs * 1000) / 1000,
            totalMs: Math.round((performance.now() - started) * 1000) / 1000,
        },
        // libuv normalises ru_maxrss to kilobytes on every platform,
        // including Darwin where the syscall reports bytes -- verified
        // against process.memoryUsage().rss rather than assumed, because
        // getting it wrong here understates peak memory 1000-fold and M1's
        // gate is a memory ceiling.
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        node: process.version,
    };
}

/** Collection totals the parser reports, against objects actually indexed.
 *
 * M1's gate is that the index accounts for everything the parser found. A
 * silent shortfall is the failure mode that matters -- an object the server
 * never names cannot appear in a diff -- so every collection is reconciled
 * explicitly and anything deliberately not indexed says why.
 */
const RECONCILIATION = {
    net_classes: ["net_class"],
    net_class_assignments: ["net_class_assignment"],
    board_constraints: ["board_constraint"],
    drc_severities: ["drc_severity"],
    routing_presets: ["routing_preset"],
    board_defaults: ["board_default"],
    teardrop_settings: ["teardrop_setting"],
    zone_settings: ["zone_setting"],
    drc_exclusions: ["drc_exclusion"],
    erc_exclusions: ["erc_exclusion"],
    erc_pin_rules: ["erc_pin_rule"],
    project_metadata: ["project_metadata"],
    custom_rules: ["custom_rule"],
    fabrication_outputs: ["fabrication_output"],
    footprints: ["footprint"],
    pads: ["pad"],
    footprint_zones: ["footprint_zone"],
    footprint_graphics: ["footprint_graphic"],
    footprint_texts: ["footprint_text"],
    segments: ["segment", "arc_segment"],
    vias: ["via"],
    zones: ["zone"],
    drawings: ["drawing", "graphic"],
    groups: ["group"],
    symbols: ["symbol"],
    sheets: ["sheet"],
    wires: ["wire"],
    buses: ["bus"],
    bus_aliases: ["bus_alias"],
    junctions: ["junction"],
    no_connects: ["no_connect"],
    bus_entries: ["bus_entry"],
    net_labels: ["label"],
    global_labels: ["global_label"],
    hierarchical_labels: ["hierarchical_label"],
    images: ["image"],
    tables: ["table"],
};

const NOT_INDEXED = {
    nets: "connectivity, not placed content; kicad-monkey owns net identity",
    lib_symbols: "a definition cache, not placed content -- its pin uuids "
        + "would collide conceptually with real instance pins",
};

export function reconcile(report) {
    const rows = [];
    for (const [collection, kinds] of Object.entries(RECONCILIATION)) {
        const found = report.collections[collection];
        if (found === undefined) {
            continue;
        }
        const indexed = kinds.reduce(
            (total, kind) => total + (report.counts.byKind[kind] ?? 0),
            0,
        );
        const skipped = kinds.reduce(
            (total, kind) => total + (report.counts.anonymous[kind] ?? 0),
            0,
        );
        rows.push({
            collection,
            kinds,
            found,
            indexed,
            anonymous: skipped,
            delta: indexed + skipped - found,
        });
    }
    return {
        rows,
        notIndexed: NOT_INDEXED,
        shortfall: rows.filter((row) => row.delta !== 0),
    };
}

function main(argv) {
    const positional = [];
    let out = null;
    let summaryOnly = false;
    let repeat = 1;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--out") {
            out = argv[(index += 1)];
        } else if (argument === "--repeat") {
            repeat = Number(argv[(index += 1)]);
        } else if (argument === "--summary-only") {
            summaryOnly = true;
        } else {
            positional.push(argument);
        }
    }
    if (positional.length < 1 || !Number.isInteger(repeat) || repeat < 1) {
        console.error(
            "usage: ecad-parse.mjs <snapshot-dir>... [--out FILE] [--repeat N] "
            + "[--summary-only]",
        );
        process.exit(2);
    }

    // Several snapshots in one process is the production shape, not a
    // convenience: the design is one Node process per compare, parsing base
    // and head. Measured separately, each revision pays JIT warm-up that the
    // second one would not -- 2.1 s standalone against 1.3 s warm on the same
    // input, which is most of the difference between hitting M1's target and
    // missing it. Repeats also share the process on purpose: peak RSS is
    // monotone within one, so the reported ceiling is the worst case.
    const snapshots = [];
    let report;
    for (const root of positional) {
        const runs = [];
        for (let index = 0; index < repeat; index += 1) {
            report = index_snapshot(root);
            // A copy: the last run's timings object is the one `runs` gets
            // attached to, so keeping the reference makes it circular.
            runs.push({ ...report.timings });
        }
        report.reconciliation = reconcile(report);
        if (repeat > 1) {
            const totals = runs.map((timing) => timing.totalMs).sort((a, b) => a - b);
            report.timings.runs = runs;
            report.timings.medianTotalMs = totals[Math.floor(totals.length / 2)];
            report.timings.minTotalMs = totals[0];
            report.timings.maxTotalMs = totals[totals.length - 1];
        }
        snapshots.push(report);
    }

    const summaries = snapshots.map((snapshot) => ({
        ...snapshot,
        objects: undefined,
        documents: snapshot.documents.length,
    }));
    const payload =
        positional.length === 1
            ? snapshots[0]
            : {
                  schema: SCHEMA,
                  snapshots,
                  // RSS is process-wide, so the meaningful figure is the one
                  // read after the last snapshot, not a per-snapshot value.
                  peakRssBytes: process.resourceUsage().maxRSS * 1024,
                  totalMs: snapshots.reduce(
                      (total, snapshot) => total + snapshot.timings.totalMs,
                      0,
                  ),
              };

    if (out) {
        writeFileSync(
            out,
            JSON.stringify(
                summaryOnly
                    ? { ...payload, snapshots: summaries, objects: undefined }
                    : payload,
            ),
        );
    }
    console.log(
        JSON.stringify(
            positional.length === 1
                ? summaries[0]
                : { ...payload, snapshots: summaries },
            null,
            2,
        ),
    );
    const shortfall = snapshots.flatMap((snapshot) => snapshot.reconciliation.shortfall);
    if (shortfall.length > 0) {
        for (const row of shortfall) {
            console.error(
                `unaccounted: ${row.collection} parsed ${row.found}, indexed ${row.indexed}`,
            );
        }
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2));
}
