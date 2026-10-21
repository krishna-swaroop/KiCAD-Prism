/**
 * The drawn root sheet (CONTRACTS §14.1, §14.2): a pure function of the
 * document, the system bundle and, while a drag is in progress, a layout
 * override. The canvas draws a `Scene`; the script API (stage 2c) describes
 * one. Nothing here sends an op.
 */
import type {
  BundleConnector,
  BundleOccurrence,
  Edge,
  Occurrence,
  PortPlacement,
  SchematicPlacement,
  SystemBundle,
  SystemDocument,
} from "../model/types";
import {
  HARNESS_CORNER_NM,
  HARNESS_SIZE,
  NORMAL,
  PIN_GRID_NM,
  SHEET_CORNER_NM,
  SYMBOL_GAP_NM,
  autoRoute,
  defaultPorts,
  defaultSheetSize,
  neededLength,
  portPoint,
  snap,
  toPoints,
  type AngledPort,
  type Point,
  type Rect,
  type Size,
} from "./geometry";

export type SymbolKind = "board" | "body" | "entry" | "harness";

export interface ScenePort {
  /** The symbol's id (occurrence or harness). */
  item: string;
  /** Connector refdes on an occurrence; end id on a harness block. */
  key: string;
  edge: Edge;
  offsetNm: number;
  /** On the border: where connections attach. */
  point: Point;
  label: string;
  detail?: string;
  /** The connector is on the board's back (`B`). */
  back: boolean;
  /** The bundle no longer has this connector (drawn as a dangling end). */
  missing: boolean;
  connected: boolean;
  /** Its exports' labels (`NAME`, or `NAME{members}` for a sub-port's), drawn as hierarchical labels (§15.4). */
  exports?: string[];
}

export interface SceneSymbol {
  id: string;
  kind: SymbolKind;
  label: string;
  /** Under the symbol: the board's track, the entry's revision, the block's summary. */
  caption: string;
  /** The bundle's state for an occurrence; harness blocks are always "ready". */
  state: BundleOccurrence["state"] | "unknown";
  rect: Rect;
  corner: number;
  ports: ScenePort[];
  /** One line per far end (harness blocks). */
  lines: string[];
}

export interface SceneConnection {
  /** The mate's id, or the harness end's. */
  id: string;
  kind: "mate" | "harness";
  harness?: string;
  a: { item: string; key: string };
  b: { item: string; key: string };
  points: Point[];
  /** The route is stored (§2.8); otherwise it is drawn by the auto-router. */
  stored: boolean;
  /** One side's pin is missing. */
  dangling: boolean;
  label: string;
  /** A mate's pin count (the smaller side's), for its tag. */
  pins?: number;
}

export interface Scene {
  symbols: SceneSymbol[];
  connections: SceneConnection[];
  /** Everything drawn, for "fit". */
  bounds: Rect;
}

type Layout = SystemDocument["layout"];

const shortCommit = (commit: string) => commit.slice(0, 7);

function caption(occurrence: Occurrence, projectName?: string): string {
  const source = occurrence.source;
  switch (source.kind) {
    case "board": {
      const name = projectName ?? source.projectId;
      return source.track.kind === "followed"
        ? `${name} · ${source.track.branch} @ ${shortCommit(source.track.commit)}`
        : `${name} · pinned @ ${shortCommit(source.track.commit)}`;
    }
    case "entry":
      return "published system";
    case "body":
      return "mechanical part";
    default:
      return "no access";
  }
}

function symbolKind(occurrence: Occurrence): SymbolKind {
  const kind = occurrence.source.kind;
  return kind === "entry" ? "entry" : kind === "body" ? "body" : "board";
}

/** The labels of a connector's exports, whole connector first, then its sub-ports' (§15.4). */
function exportLabels(document: SystemDocument, occurrence: string, connector: string): string[] | undefined {
  const exports = document.exports.filter((item) => item.site.occurrence === occurrence && item.site.connector === connector);
  if (!exports.length) return undefined;
  return [...exports]
    .sort((a, b) => Number(Boolean(a.site.subPort)) - Number(Boolean(b.site.subPort)) || naturalCompare(a.name, b.name))
    .map((item) => {
      const subPort = item.site.subPort?.kind === "occurrence" ? document.subPorts.find((candidate) => candidate.id === item.site.subPort?.id) : undefined;
      return subPort ? `${item.name}{${subPort.pins.join(" ")}}` : item.name;
    });
}

/** Connectors the document names on an occurrence: mates, harness ends, exports, sub-ports. */
function namedConnectors(document: SystemDocument, occurrence: string): string[] {
  const named = new Set<string>();
  for (const mate of document.mates) {
    if (mate.a.occurrence === occurrence) named.add(mate.a.connector);
    if (mate.b.occurrence === occurrence) named.add(mate.b.connector);
  }
  for (const harness of document.harnesses) {
    for (const end of harness.ends) if (end.site?.occurrence === occurrence) named.add(end.site.connector);
  }
  for (const item of document.exports) if (item.site.occurrence === occurrence) named.add(item.site.connector);
  for (const sub of document.subPorts) if (sub.occurrence === occurrence) named.add(sub.connector);
  return [...named];
}

/** Natural order: `J2` before `J10`. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
}

interface ConnectorView {
  refdes: string;
  angleDeg?: number;
  back: boolean;
  detail?: string;
  missing: boolean;
}

function connectorsOf(document: SystemDocument, occurrence: string, bundled: BundleOccurrence | undefined): ConnectorView[] {
  const fromBundle = new Map<string, BundleConnector>((bundled?.connectors ?? []).map((item) => [item.refdes, item]));
  const ready = bundled?.state === "ready";
  const refs = new Set<string>([...fromBundle.keys(), ...namedConnectors(document, occurrence)]);
  return [...refs].sort(naturalCompare).map((refdes) => {
    const connector = fromBundle.get(refdes);
    return {
      refdes,
      angleDeg: connector?.placement?.angleDeg,
      back: connector?.placement?.side === "bottom",
      detail: connector ? [connector.value || connector.mpn, `${connector.pins.length}`].filter(Boolean).join(" · ") : undefined,
      missing: ready && !connector,
    };
  });
}

/** A harness block grows so each edge fits its ends (§14.2). */
function harnessSize(counts: Record<Edge, number>): Size {
  return {
    widthNm: Math.max(HARNESS_SIZE.widthNm, neededLength(Math.max(counts.top, counts.bottom), HARNESS_CORNER_NM)),
    heightNm: Math.max(HARNESS_SIZE.heightNm, neededLength(Math.max(counts.left, counts.right), HARNESS_CORNER_NM)),
  };
}

function angleTo(from: Point, to: Point): number {
  // Screen y grows down; angles are counter-clockwise with +y up.
  return (Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI;
}

export interface SceneOptions {
  /** Layout entries replacing the document's while a gesture is in progress. */
  override?: Layout;
  /** Project names by id, for captions. */
  projectNames?: Record<string, string>;
}

/** The root sheet: occurrences and harness blocks with no `sheet`, and their connections. */
export function buildScene(document: SystemDocument, bundle: SystemBundle | undefined, options: SceneOptions = {}): Scene {
  const layout: Layout = { ...document.layout, ...options.override };
  const bundled = new Map((bundle?.occurrences ?? []).map((item) => [item.occurrence, item]));
  const occurrences = document.occurrences.filter((item) => !item.sheet);
  const harnesses = document.harnesses.filter((item) => !item.sheet);

  const connected = new Set<string>();
  const pinKey = (item: string, key: string) => `${item}\u0000${key}`;
  for (const mate of document.mates) {
    connected.add(pinKey(mate.a.occurrence, mate.a.connector));
    connected.add(pinKey(mate.b.occurrence, mate.b.connector));
  }
  for (const harness of harnesses) {
    for (const end of harness.ends) {
      if (end.site) connected.add(pinKey(end.site.occurrence, end.site.connector));
      connected.add(pinKey(harness.id, end.id));
    }
  }

  // Occurrences: their own layout, or a row to the right of what is placed (§14.2).
  const symbols: SceneSymbol[] = [];
  const unplaced: SceneSymbol[] = [];
  for (const occurrence of occurrences) {
    const entry: SchematicPlacement | undefined = layout[occurrence.id];
    const state = bundled.get(occurrence.id)?.state ?? "unknown";
    const redacted = state === "redacted" || (occurrence.source as { kind: string }).kind === "redacted";
    const connectors = redacted ? [] : connectorsOf(document, occurrence.id, bundled.get(occurrence.id));
    const angled: AngledPort[] = connectors.map((item) => ({ key: item.refdes, angleDeg: item.angleDeg }));
    const outline = bundled.get(occurrence.id)?.outline;
    const size = entry?.size ?? defaultSheetSize(outline, angled);
    const ports = { ...defaultPorts(angled, size), ...(entry?.ports ?? {}) };
    const symbol: SceneSymbol = {
      id: occurrence.id,
      kind: symbolKind(occurrence),
      label: occurrence.label,
      caption: caption(occurrence, occurrence.source.kind === "board" ? options.projectNames?.[occurrence.source.projectId] : undefined),
      state,
      rect: { x: entry?.xNm ?? 0, y: entry?.yNm ?? 0, w: size.widthNm, h: size.heightNm },
      corner: SHEET_CORNER_NM,
      ports: connectors.map((connector) => {
        const placement = ports[connector.refdes] as PortPlacement;
        return {
          item: occurrence.id,
          key: connector.refdes,
          edge: placement.edge,
          offsetNm: placement.offsetNm,
          point: { x: 0, y: 0 },
          label: connector.refdes,
          detail: connector.detail,
          back: connector.back,
          missing: connector.missing,
          connected: connected.has(pinKey(occurrence.id, connector.refdes)),
          exports: exportLabels(document, occurrence.id, connector.refdes),
        };
      }),
      lines: [],
    };
    (entry ? symbols : unplaced).push(symbol);
  }
  let nextX = symbols.length ? Math.max(...symbols.map((item) => item.rect.x + item.rect.w)) + SYMBOL_GAP_NM : 0;
  const top = symbols.length ? Math.min(...symbols.map((item) => item.rect.y)) : 0;
  for (const symbol of unplaced) {
    symbol.rect.x = snap(nextX, PIN_GRID_NM);
    symbol.rect.y = top;
    nextX = symbol.rect.x + symbol.rect.w + SYMBOL_GAP_NM;
    symbols.push(symbol);
  }
  for (const symbol of symbols) {
    for (const port of symbol.ports) {
      port.point = portPoint(symbol.rect, sizeOf(symbol.rect), port, symbol.corner);
    }
  }

  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const portOf = (item: string, key: string) => byId.get(item)?.ports.find((port) => port.key === key);
  const pinsOf = (item: string, key: string) => bundled.get(item)?.connectors.find((connector) => connector.refdes === key)?.pins.length;
  const occurrenceLabel = new Map(document.occurrences.map((item) => [item.id, item.label]));

  // Harness blocks: between their ends' pins by default; each end's pin faces its site.
  for (const harness of harnesses) {
    const entry = layout[harness.id];
    const sitePorts = harness.ends.map((end) => (end.site ? portOf(end.site.occurrence, end.site.connector) : undefined));
    const centre: Point | undefined = entry
      ? { x: entry.xNm + (entry.size?.widthNm ?? HARNESS_SIZE.widthNm) / 2, y: entry.yNm + (entry.size?.heightNm ?? HARNESS_SIZE.heightNm) / 2 }
      : defaultBlockCentre(sitePorts.filter((port): port is ScenePort => Boolean(port)), symbols);
    const angled: AngledPort[] = harness.ends.map((end, index) => {
      const site = sitePorts[index];
      return { key: end.id, angleDeg: site && centre ? angleTo(centre, site.point) : undefined };
    });
    // Edges first at the default size; the block then grows to fit them.
    const counts: Record<Edge, number> = { left: 0, right: 0, top: 0, bottom: 0 };
    for (const placed of Object.values(defaultPorts(angled, HARNESS_SIZE, HARNESS_CORNER_NM))) counts[placed.edge] += 1;
    const size = entry?.size ?? harnessSize(counts);
    const ports = { ...defaultPorts(angled, size, HARNESS_CORNER_NM), ...(entry?.ports ?? {}) };
    const rect: Rect = entry
      ? { x: entry.xNm, y: entry.yNm, w: size.widthNm, h: size.heightNm }
      : centre
        ? { x: snap(centre.x - size.widthNm / 2, PIN_GRID_NM), y: snap(centre.y - size.heightNm / 2, PIN_GRID_NM), w: size.widthNm, h: size.heightNm }
        : { x: 0, y: belowAll(symbols), w: size.widthNm, h: size.heightNm };
    const farEnds = harness.ends.map((end) => (end.site ? `${occurrenceLabel.get(end.site.occurrence) ?? end.site.occurrence}.${end.site.connector}` : "unsited end"));
    const symbol: SceneSymbol = {
      id: harness.id,
      kind: "harness",
      label: harness.label,
      caption: `${harness.links.length} ${harness.links.length === 1 ? "link" : "links"} · ${harness.ends.length} ${harness.ends.length === 1 ? "end" : "ends"}`,
      state: "ready",
      rect,
      corner: HARNESS_CORNER_NM,
      ports: harness.ends.map((end, index) => {
        const placement = ports[end.id] as PortPlacement;
        return {
          item: harness.id,
          key: end.id,
          edge: placement.edge,
          offsetNm: placement.offsetNm,
          point: portPoint(rect, size, placement, HARNESS_CORNER_NM),
          label: "",
          detail: farEnds[index],
          back: false,
          missing: false,
          connected: Boolean(end.site),
        };
      }),
      lines: farEnds,
    };
    symbols.push(symbol);
    byId.set(symbol.id, symbol);
  }

  const obstacles = symbols.map((symbol) => symbol.rect);
  const connections: SceneConnection[] = [];
  const route = (id: string, a: ScenePort | undefined, b: ScenePort | undefined) => {
    const stored = layout[id]?.route;
    if (stored) return { points: toPoints(stored), stored: true };
    if (!a || !b) return { points: [a?.point ?? b?.point ?? { x: 0, y: 0 }], stored: false };
    return { points: autoRoute({ point: a.point, edge: a.edge }, { point: b.point, edge: b.edge }, obstacles), stored: false };
  };
  for (const { id, a: siteA, b: siteB } of document.mates) {
    if (!byId.has(siteA.occurrence) || !byId.has(siteB.occurrence)) continue;
    const a = portOf(siteA.occurrence, siteA.connector);
    const b = portOf(siteB.occurrence, siteB.connector);
    const aPins = pinsOf(siteA.occurrence, siteA.connector);
    const bPins = pinsOf(siteB.occurrence, siteB.connector);
    connections.push({
      id,
      kind: "mate",
      a: { item: siteA.occurrence, key: siteA.connector },
      b: { item: siteB.occurrence, key: siteB.connector },
      ...route(id, a, b),
      dangling: !a || !b || a.missing || b.missing,
      label: `${siteA.connector} ↔ ${siteB.connector}`,
      pins: aPins === undefined ? bPins : bPins === undefined ? aPins : Math.min(aPins, bPins),
    });
  }
  for (const harness of harnesses) {
    for (const end of harness.ends) {
      const site = end.site;
      if (!site || !byId.has(site.occurrence)) continue;
      const a = portOf(site.occurrence, site.connector);
      const b = portOf(harness.id, end.id);
      connections.push({
        id: end.id,
        kind: "harness",
        harness: harness.id,
        a: { item: site.occurrence, key: site.connector },
        b: { item: harness.id, key: end.id },
        ...route(end.id, a, b),
        dangling: !a || a.missing,
        label: `${occurrenceLabel.get(site.occurrence) ?? site.occurrence}.${site.connector}`,
      });
    }
  }

  return { symbols, connections, bounds: boundsOfScene(symbols, connections) };
}

/**
 * Where a harness block without a layout entry goes (§14.2): 25.4 mm out from
 * its sites' pins along their normals (their mean) when that spot is clear;
 * otherwise the clear spot nearest its pins among: further out from each
 * pin, and just above or below the boards its sites are on.
 */
function defaultBlockCentre(sites: readonly ScenePort[], symbols: readonly SceneSymbol[]): Point | undefined {
  if (!sites.length) return undefined;
  const reach = sites.map((port) => outward(port, SYMBOL_GAP_NM));
  const candidates: Point[] = [
    { x: reach.reduce((sum, point) => sum + point.x, 0) / reach.length, y: reach.reduce((sum, point) => sum + point.y, 0) / reach.length },
  ];
  for (const site of sites) for (let step = 1; step <= 4; step += 1) candidates.push(outward(site, SYMBOL_GAP_NM * step));
  const boards: Rect[] = [];
  for (const symbol of symbols) if (sites.some((site) => site.item === symbol.id)) boards.push(symbol.rect);
  if (boards.length) {
    const left = Math.min(...boards.map((rect) => rect.x));
    const right = Math.max(...boards.map((rect) => rect.x + rect.w));
    const top = Math.min(...boards.map((rect) => rect.y));
    const bottom = Math.max(...boards.map((rect) => rect.y + rect.h));
    const middle = (left + right) / 2;
    for (let step = 1; step <= 3; step += 1) {
      candidates.push({ x: middle, y: bottom + SYMBOL_GAP_NM * step }, { x: middle, y: top - SYMBOL_GAP_NM * step });
    }
  }
  const clear = (centre: Point) => {
    const block: Rect = { x: centre.x - HARNESS_SIZE.widthNm / 2, y: centre.y - HARNESS_SIZE.heightNm / 2, w: HARNESS_SIZE.widthNm, h: HARNESS_SIZE.heightNm };
    return symbols.every((symbol) => !overlaps(block, symbol.rect));
  };
  const cost = (centre: Point) => sites.reduce((sum, site) => sum + Math.abs(site.point.x - centre.x) + Math.abs(site.point.y - centre.y), 0);
  if (clear(candidates[0])) return candidates[0];
  const open = candidates.slice(1).filter(clear);
  return open.length ? open.reduce((best, item) => (cost(item) < cost(best) ? item : best)) : candidates[0];
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function sizeOf(rect: Rect): Size {
  return { widthNm: rect.w, heightNm: rect.h };
}

function belowAll(symbols: readonly SceneSymbol[]): number {
  if (!symbols.length) return 0;
  return snap(Math.max(...symbols.map((symbol) => symbol.rect.y + symbol.rect.h)) + SYMBOL_GAP_NM, PIN_GRID_NM);
}

function boundsOfScene(symbols: readonly SceneSymbol[], connections: readonly SceneConnection[]): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const symbol of symbols) {
    xs.push(symbol.rect.x, symbol.rect.x + symbol.rect.w);
    ys.push(symbol.rect.y, symbol.rect.y + symbol.rect.h);
  }
  for (const connection of connections) {
    for (const point of connection.points) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The outward point a pin's glyph and label hang from. */
export function outward(port: ScenePort, distance: number): Point {
  const normal = NORMAL[port.edge];
  return { x: port.point.x + normal.x * distance, y: port.point.y + normal.y * distance };
}
