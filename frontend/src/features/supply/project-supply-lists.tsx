import { Link } from "react-router-dom";

import type { ProjectSupply } from "@/types/supply";
import { partHref } from "./supply-views";
import { releaseComplianceCsvUrl } from "./release-check-api";
import { StatusDot } from "./status-dot";
import { formatDay, STATUS_LABEL } from "./supply-format";

/** A folded section with its count in the summary; an empty one has a summary and nothing to open. */
const section = (title: string, children: React.ReactNode, count?: number) => (
  <details>
    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">{count === undefined ? title : `${title} (${count})`}</summary>
    <section aria-label={title} className="mt-2 space-y-2">{children}</section>
  </details>
);

/** Each release's supply when it was published, and the parts that were fine then and are not now. */
export function ProjectSupplyReleases({ projectId, releases }: { projectId: string; releases: ProjectSupply["releases"] }) {
  if (releases.length === 0) return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Releases: no release has a supply snapshot</p>;
  return section("Releases", (
    <ul className="divide-y border text-sm">
      {releases.map((release) => (
        <li key={release.build_id} className="space-y-1 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot status={release.status} />
            <span className="font-medium">{release.tag}</span>
            <span className="text-xs text-muted-foreground">
              {release.health === null ? STATUS_LABEL[release.status] : `Health ${release.health.toFixed(1)} of 10`}, {release.parts} parts,{" "}
              {release.needing_a_look} needed a look, {formatDay(release.created_at)}
            </span>
            <a href={releaseComplianceCsvUrl(projectId, release.build_id)} className="ml-auto text-xs text-primary hover:underline">Compliance CSV</a>
          </div>
          {release.changed_since.length > 0 ? (
            <p className="text-xs text-destructive">
              Since then:{" "}
              {release.changed_since.map((item, index) => (
                <span key={item.part_id}>{index > 0 ? ", " : ""}<Link className="underline" to={partHref(item.part_id)}>{item.mpn}</Link> is now {STATUS_LABEL[item.now].toLowerCase()}</span>
              ))}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  ), releases.length);
}

/** The notes written on BOM lines, listed per project. Each opens the BOM, where they stay. */
export function ProjectSupplyNotes({ supply }: { supply: ProjectSupply }) {
  const names = new Map((supply.parts ?? []).map((part) => [part.key, part.mpn || part.key]));
  if (supply.notes.length === 0) return null;
  return section("Line notes", (
    <ul className="divide-y border text-sm">
      {supply.notes.map((note) => (
        <li key={note.id} className="p-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <Link to="?section=visualizers" className="font-medium text-primary hover:underline">{names.get(note.line_key) ?? note.line_key}</Link>
            <span className="text-xs text-muted-foreground">{note.author_name || note.author}, {formatDay(note.created_at)}</span>
          </div>
          <p className="whitespace-pre-wrap">{note.body}</p>
        </li>
      ))}
    </ul>
  ), supply.notes.length);
}
