/**
 * The connectors of one occurrence as the selection panel lists them: the
 * refdes, its value, its pin count and where it goes (a mate's other side, a
 * harness, or a dash). The bundle supplies the facts; the document supplies
 * the links.
 */
import type { SystemBundle, SystemDocument } from "../model/types";
import { naturalCompare } from "./scene";

export interface ConnectorRow {
  refdes: string;
  value: string;
  pins: number | null;
  linkedTo: string;
}

export function connectorRows(document: SystemDocument, bundle: SystemBundle | undefined, occurrence: string): ConnectorRow[] {
  const bundled = bundle?.occurrences.find((item) => item.occurrence === occurrence);
  const labelOf = (id: string) => document.occurrences.find((item) => item.id === id)?.label ?? id;
  const links = new Map<string, string[]>();
  const link = (connector: string, target: string) => links.set(connector, [...(links.get(connector) ?? []), target]);
  for (const mate of document.mates) {
    if (mate.a.occurrence === occurrence) link(mate.a.connector, `${labelOf(mate.b.occurrence)}.${mate.b.connector}`);
    if (mate.b.occurrence === occurrence) link(mate.b.connector, `${labelOf(mate.a.occurrence)}.${mate.a.connector}`);
  }
  for (const harness of document.harnesses) {
    for (const end of harness.ends) if (end.site?.occurrence === occurrence) link(end.site.connector, harness.label);
  }
  const connectors = new Map((bundled?.connectors ?? []).map((connector) => [connector.refdes, connector]));
  const refs = new Set<string>([...connectors.keys(), ...links.keys()]);
  return [...refs].sort(naturalCompare).map((refdes) => {
    const connector = connectors.get(refdes);
    return {
      refdes,
      value: connector ? connector.value || connector.mpn || "—" : "—",
      pins: connector ? connector.pins.length : null,
      linkedTo: links.get(refdes)?.join(", ") ?? "—",
    };
  });
}
