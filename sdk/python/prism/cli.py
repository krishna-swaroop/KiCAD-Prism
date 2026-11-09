"""The ``prism`` command-line client.

Thin wrappers over :class:`prism.client.Client`: human-readable tables by
default, the raw JSON body with ``--json``, and exit code 1 with
``code: detail`` on stderr when the API refuses a request.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from typing import Any, Iterable, Sequence

from .client import Client, PrismError

__all__ = ["main"]


def _json(data: Any) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def _table(headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> None:
    body = [[str(cell) for cell in row] for row in rows]
    widths = [len(str(header)) for header in headers]
    for row in body:
        for index, cell in enumerate(row):
            if index < len(widths):
                widths[index] = max(widths[index], len(cell))
    print("  ".join(str(header).ljust(widths[index]) for index, header in enumerate(headers)).rstrip())
    for row in body:
        print("  ".join(cell.ljust(widths[index]) for index, cell in enumerate(row)).rstrip())


def _project_row(project: dict[str, Any]) -> list[Any]:
    return [
        project.get("id", ""),
        project.get("display_name") or project.get("name", ""),
        project.get("path", ""),
    ]


def _projects_list(client: Client, args: argparse.Namespace) -> int:
    projects = client.list_projects() or []
    if args.json:
        _json(projects)
        return 0
    _table(["ID", "NAME", "PATH"], (_project_row(project) for project in projects))
    return 0


def _project_show(client: Client, args: argparse.Namespace) -> int:
    project = client.get_project_detail(args.id)
    if args.json:
        _json(project)
        return 0
    project = project or {}
    fields = ("id", "name", "display_name", "path", "description", "origin_url", "last_synced_at")
    _table(["FIELD", "VALUE"], ((name, project.get(name, "")) for name in fields))
    return 0


def _bom_table(data: dict[str, Any]) -> tuple[list[str], list[list[str]]]:
    columns = list(data.get("columns") or ["Reference", "Qty", "Value"])
    rows: list[list[str]] = []
    for line in data.get("lines") or []:
        fields = line.get("fields") or {}
        row: list[str] = []
        for column in columns:
            if column == "Reference":
                row.append(", ".join(str(reference) for reference in line.get("references") or []))
            elif column == "Qty":
                row.append(str(line.get("quantity", "")))
            else:
                row.append(str(fields.get(column, "")))
        rows.append(row)
    return columns, rows


def _bom(client: Client, args: argparse.Namespace) -> int:
    data = client.get_project_bom(args.project, commit=args.revision, assembly=args.assembly)
    data = data or {}
    if args.json:
        _json(data)
        return 0
    columns, rows = _bom_table(data)
    if args.csv:
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)
        return 0
    _table(columns, rows)
    return 0


def _design_search(client: Client, args: argparse.Namespace) -> int:
    data = client.search_design(args.project, q=args.query, revision=args.revision)
    data = data or {}
    if args.json:
        _json(data)
        return 0
    rows = []
    for hit in data.get("results") or []:
        rows.append(
            [
                hit.get("kind", ""),
                hit.get("reference") or hit.get("name") or "",
                hit.get("value") or "",
                hit.get("footprint") or "",
                hit.get("matched", ""),
                hit.get("field") or "",
            ]
        )
    _table(["KIND", "REFERENCE/NAME", "VALUE", "FOOTPRINT", "MATCHED", "FIELD"], rows)
    return 0


def _design_component(client: Client, args: argparse.Namespace) -> int:
    data = client.get_design_component(args.project, args.ref, revision=args.revision)
    data = data or {}
    if args.json:
        _json(data)
        return 0
    component = data.get("component") or {}
    _table(
        ["FIELD", "VALUE"],
        [
            ("Reference", component.get("reference", "")),
            ("Value", component.get("value", "")),
            ("Footprint", component.get("footprint", "")),
            ("Library", component.get("libraryRef") or ""),
            ("Sheet", component.get("sheet") or ""),
            ("DNP", component.get("dnp", False)),
        ],
    )
    pins = component.get("pins") or []
    if pins:
        print()
        _table(
            ["PIN", "NAME", "NET"],
            ((pin.get("pin", ""), pin.get("pinName", ""), pin.get("net") or "") for pin in pins),
        )
    return 0


def _design_net(client: Client, args: argparse.Namespace) -> int:
    data = client.get_design_net(args.project, args.name, revision=args.revision)
    data = data or {}
    if args.json:
        _json(data)
        return 0
    net = data.get("net") or {}
    _table(
        ["FIELD", "VALUE"],
        [
            ("Name", net.get("name", "")),
            ("Net class", net.get("netClass") or ""),
            ("Components", ", ".join(str(item) for item in net.get("components") or [])),
        ],
    )
    pins = net.get("pins") or []
    if pins:
        print()
        _table(
            ["REFERENCE", "PIN", "NAME"],
            ((pin.get("reference", ""), pin.get("pin", ""), pin.get("pinName", "")) for pin in pins),
        )
    return 0


def _event_row(event: dict[str, Any]) -> list[Any]:
    return [
        event.get("id", ""),
        event.get("kind", ""),
        event.get("topic", ""),
        event.get("projectId") or "",
        event.get("createdAt", ""),
    ]


def _events(client: Client, args: argparse.Namespace) -> int:
    if not args.follow:
        page = client.list_events(after=args.after) or {}
        if args.json:
            _json(page)
            return 0
        _table(["ID", "KIND", "TOPIC", "PROJECT", "CREATED"], (_event_row(e) for e in page.get("events") or []))
        return 0

    cursor = args.after
    while True:
        page = client.list_events(after=cursor) or {}
        for event in page.get("events") or []:
            if args.json:
                print(json.dumps(event, sort_keys=True))
            else:
                print("\t".join(str(cell) for cell in _event_row(event)))
        next_cursor = page.get("next")
        if not isinstance(next_cursor, int) or next_cursor <= cursor:
            time.sleep(2)
        else:
            cursor = next_cursor


def _job_table(job: dict[str, Any], job_id: str) -> None:
    _table(
        ["FIELD", "VALUE"],
        [
            ("Job", job.get("job_id", job_id)),
            ("Status", job.get("status") or ""),
            ("Kind", job.get("kind") or ""),
            ("Percent", job.get("percent") if job.get("percent") is not None else ""),
            ("Message", job.get("message") or ""),
            ("Error", (job.get("error_code") or "") + (f": {job['error_message']}" if job.get("error_message") else "")),
        ],
    )


def _job(client: Client, args: argparse.Namespace) -> int:
    job = client.wait_for_job(args.id) if args.wait else client.get_job(args.id)
    if args.json:
        _json(job)
        return 0
    _job_table(job or {}, args.id)
    return 0


def _text(value: str) -> str:
    """A text argument; ``-`` reads the rest of standard input."""
    return sys.stdin.read() if value == "-" else value


def _job_failed(job: dict[str, Any]) -> bool:
    return str(job.get("status") or "") in {"failed", "cancelled"}


def _report_job_failure(job: dict[str, Any]) -> None:
    code = job.get("error_code") or job.get("status") or "job-failed"
    message = job.get("error_message") or ""
    print(f"{code}: {message}" if message else str(code), file=sys.stderr)


def _wait_for_job(client: Client, job_id: str) -> dict[str, Any]:
    return client.wait_for_job(job_id) or {}


def _comment_add(client: Client, args: argparse.Namespace) -> int:
    body: dict[str, Any] = {"content": _text(args.text)}
    for key in ("component", "net", "sheet", "commit", "severity"):
        value = getattr(args, key)
        if value is not None:
            body[key] = value
    if args.comment_class is not None:
        body["commentClass"] = args.comment_class
    comment = client.create_anchored_comment(args.project, body=body) or {}
    if args.json:
        _json(comment)
        return 0
    fields: list[tuple[str, Any]] = [("ID", comment.get("id", ""))]
    if comment.get("link"):
        fields.append(("Link", comment["link"]))
    _table(["FIELD", "VALUE"], fields)
    return 0


def _comment_reply(client: Client, args: argparse.Namespace) -> int:
    data = client.add_reply(
        args.project, args.comment_id, body={"content": _text(args.text)}
    ) or {}
    if args.json:
        _json(data)
        return 0
    comment = data.get("comment") or {}
    reply = data.get("reply") or {}
    fields: list[tuple[str, Any]] = [
        ("Comment", comment.get("id", args.comment_id)),
        ("Reply", reply.get("id", "")),
    ]
    link = data.get("link") or comment.get("link")
    if link:
        fields.append(("Link", link))
    _table(["FIELD", "VALUE"], fields)
    return 0


def _first_line(content: str, limit: int = 80) -> str:
    lines = (content or "").strip().splitlines()
    line = lines[0].strip() if lines else ""
    return line if len(line) <= limit else line[: limit - 3].rstrip() + "..."


def _comment_list(client: Client, args: argparse.Namespace) -> int:
    data = client.get_comments(args.project) or {}
    if args.json:
        _json(data)
        return 0
    rows = []
    for comment in data.get("comments") or []:
        rows.append(
            [
                comment.get("id", ""),
                comment.get("status", ""),
                comment.get("author", ""),
                comment.get("elementRef") or comment.get("semanticItemId") or comment.get("filePath") or "",
                _first_line(comment.get("content", "")),
            ]
        )
    _table(["ID", "STATUS", "AUTHOR", "REF", "CONTENT"], rows)
    return 0


def _sync(client: Client, args: argparse.Namespace) -> int:
    data = client.sync_project_endpoint(args.project) or {}
    job_id = str(data.get("job_id") or "")
    if args.wait and job_id:
        job = _wait_for_job(client, job_id)
        if args.json:
            _json(job)
        else:
            _job_table(job, job_id)
        if _job_failed(job):
            _report_job_failure(job)
            return 1
        return 0
    if args.json:
        _json(data)
        return 0
    _table(
        ["FIELD", "VALUE"],
        [
            ("Job", job_id),
            ("Status", data.get("status") or ""),
            ("Message", data.get("message") or ""),
        ],
    )
    return 0


def _release_build(client: Client, args: argparse.Namespace) -> int:
    data = client.create_candidate(
        args.project,
        body={
            "commit_sha": args.commit,
            "config_key": args.config,
            "variant": args.variant or "",
        },
    ) or {}
    job = data.get("job") or {}
    job_id = str(job.get("job_id") or "")
    waited = False
    if args.wait and job_id:
        job = _wait_for_job(client, job_id)
        waited = True
    if args.json:
        _json(job if waited else data)
        return 0
    _job_table(job, job_id)
    if waited and _job_failed(job):
        _report_job_failure(job)
        return 1
    return 0


def _compare_reviews(client: Client, project: str, job_id: str) -> dict[str, Any]:
    return {
        "schematic": client.get_comparison_review(project, job_id, domain="sch") or {},
        "pcb": client.get_comparison_review(project, job_id, domain="pcb") or {},
    }


def _compare(client: Client, args: argparse.Namespace) -> int:
    started = client.start_design_compare(
        args.project, body={"base": args.base, "head": args.head}
    ) or {}
    job_id = str(started.get("job_id") or "")
    if args.wait and job_id:
        job = _wait_for_job(client, job_id)
        if _job_failed(job):
            if args.json:
                _json(job)
            else:
                _job_table(job, job_id)
            _report_job_failure(job)
            return 1
        reviews = _compare_reviews(client, args.project, job_id)
        if args.json:
            _json({"jobId": job_id, "reviews": reviews})
            return 0
        rows = []
        for domain, review in reviews.items():
            for group in review.get("groups") or []:
                rows.append(
                    [
                        domain,
                        group.get("impact", ""),
                        group.get("kind", ""),
                        group.get("title", ""),
                        group.get("summary", ""),
                        ", ".join(str(reference) for reference in group.get("references") or []),
                    ]
                )
        _table(["DOMAIN", "IMPACT", "KIND", "TITLE", "SUMMARY", "REFERENCES"], rows)
        return 0
    if args.json:
        _json(started)
        return 0
    _table(
        ["FIELD", "VALUE"],
        [("Job", job_id), ("Status", started.get("status") or "queued")],
    )
    return 0


def _read_rows(path: str, key: str) -> list[Any]:
    """A JSON list of rows, or an object holding them under ``key``, from a file or stdin (``-``)."""

    if path == "-":
        text = sys.stdin.read()
    else:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    data = json.loads(text)
    rows = data.get(key) if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise ValueError(f"expected a JSON list, or an object with {key!r}")
    return rows


def _supply_push_offers(client: Client, args: argparse.Namespace) -> int:
    result = client.push_connector_offers(args.connector, body={"offers": _read_rows(args.file, "offers"), "replace": args.replace})
    if args.json:
        _json(result)
        return 0
    _table(["FIELD", "VALUE"], [("Received", result.get("received")), ("Kept", result.get("kept")), ("Recorded", result.get("recorded"))])
    return 0


def _supply_push_levels(client: Client, args: argparse.Namespace) -> int:
    result = client.push_inventory_levels(args.source, body={"items": _read_rows(args.file, "items")})
    if args.json:
        _json(result)
        return 0
    _table(["FIELD", "VALUE"], [("Records", result.get("records")), ("Matched", result.get("matched")), ("Unmatched", result.get("unmatched"))])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="prism", description="KiCAD Prism from the command line.")
    commands = parser.add_subparsers(dest="command", required=True)

    projects = commands.add_parser("projects", help="Projects registered in Prism")
    project_commands = projects.add_subparsers(dest="action", required=True)
    project_list = project_commands.add_parser("list", help="List projects")
    project_list.add_argument("--json", action="store_true", help="print the raw JSON")
    project_list.set_defaults(handler=_projects_list)

    project = commands.add_parser("project", help="One project")
    project.add_argument("id")
    project.add_argument("--json", action="store_true", help="print the raw JSON")
    project.set_defaults(handler=_project_show)

    bom = commands.add_parser("bom", help="A revision's engineering BOM")
    bom.add_argument("project")
    bom.add_argument("--revision", help="commit or ref (default: HEAD)")
    bom.add_argument("--assembly", choices=("all", "assembly"), default="all")
    bom.add_argument("--csv", action="store_true", help="write CSV")
    bom.add_argument("--json", action="store_true", help="print the raw JSON")
    bom.set_defaults(handler=_bom)

    design = commands.add_parser("design", help="Design queries at a revision")
    design_commands = design.add_subparsers(dest="action", required=True)

    search = design_commands.add_parser("search", help="Find components and nets")
    search.add_argument("project")
    search.add_argument("query")
    search.add_argument("--revision", help="commit or ref (default: HEAD)")
    search.add_argument("--json", action="store_true", help="print the raw JSON")
    search.set_defaults(handler=_design_search)

    component = design_commands.add_parser("component", help="One component")
    component.add_argument("project")
    component.add_argument("ref")
    component.add_argument("--revision", help="commit or ref (default: HEAD)")
    component.add_argument("--json", action="store_true", help="print the raw JSON")
    component.set_defaults(handler=_design_component)

    net = design_commands.add_parser("net", help="One net")
    net.add_argument("project")
    net.add_argument("name")
    net.add_argument("--revision", help="commit or ref (default: HEAD)")
    net.add_argument("--json", action="store_true", help="print the raw JSON")
    net.set_defaults(handler=_design_net)

    events = commands.add_parser("events", help="The event log")
    events.add_argument("--after", type=int, default=0, help="start after this event id")
    events.add_argument("--follow", action="store_true", help="keep polling for new events")
    events.add_argument("--json", action="store_true", help="print the raw JSON")
    events.set_defaults(handler=_events)

    job = commands.add_parser("job", help="One job's status")
    job.add_argument("id")
    job.add_argument("--wait", action="store_true", help="poll until the job finishes")
    job.add_argument("--json", action="store_true", help="print the raw JSON")
    job.set_defaults(handler=_job)

    comment = commands.add_parser("comment", help="Review comments")
    comment_commands = comment.add_subparsers(dest="action", required=True)

    comment_add = comment_commands.add_parser("add", help="Comment on a component, net or sheet")
    comment_add.add_argument("project")
    anchor = comment_add.add_mutually_exclusive_group(required=True)
    anchor.add_argument("--component", metavar="REF", help="component reference, for example R1")
    anchor.add_argument("--net", metavar="NAME", help="net name")
    anchor.add_argument("--sheet", metavar="PATH", help="schematic sheet path")
    comment_add.add_argument("--commit", help="commit or ref (default: HEAD)")
    comment_add.add_argument("--severity", help="severity, for example info or warning")
    comment_add.add_argument("--class", dest="comment_class", help="comment class")
    comment_add.add_argument("text", help="comment text, or - to read standard input")
    comment_add.add_argument("--json", action="store_true", help="print the raw JSON")
    comment_add.set_defaults(handler=_comment_add)

    comment_reply = comment_commands.add_parser("reply", help="Reply to a comment")
    comment_reply.add_argument("project")
    comment_reply.add_argument("comment_id")
    comment_reply.add_argument("text", help="reply text, or - to read standard input")
    comment_reply.add_argument("--json", action="store_true", help="print the raw JSON")
    comment_reply.set_defaults(handler=_comment_reply)

    comment_list = comment_commands.add_parser("list", help="List a project's comment threads")
    comment_list.add_argument("project")
    comment_list.add_argument("--json", action="store_true", help="print the raw JSON")
    comment_list.set_defaults(handler=_comment_list)

    sync = commands.add_parser("sync", help="Sync a project with its remote")
    sync.add_argument("project")
    sync.add_argument("--wait", action="store_true", help="poll until the sync job finishes")
    sync.add_argument("--json", action="store_true", help="print the raw JSON")
    sync.set_defaults(handler=_sync)

    release = commands.add_parser("release", help="Release Studio")
    release_commands = release.add_subparsers(dest="action", required=True)
    release_build = release_commands.add_parser("build", help="Queue a release build")
    release_build.add_argument("project")
    release_build.add_argument("--commit", required=True, metavar="SHA", help="the 40-character commit to build")
    release_build.add_argument("--config", default="release", metavar="KEY", help="release configuration key (default: release)")
    release_build.add_argument("--variant", default="", metavar="V", help="design variant")
    release_build.add_argument("--wait", action="store_true", help="poll until the build job finishes")
    release_build.add_argument("--json", action="store_true", help="print the raw JSON")
    release_build.set_defaults(handler=_release_build)

    compare = commands.add_parser("compare", help="Compare two revisions")
    compare.add_argument("project")
    compare.add_argument("base", help="base commit, branch or tag")
    compare.add_argument("head", help="commit, branch or tag to compare against base")
    compare.add_argument("--wait", action="store_true", help="wait for the job and print the review groups")
    compare.add_argument("--json", action="store_true", help="print the raw JSON")
    compare.set_defaults(handler=_compare)

    supply = commands.add_parser("supply", help="Push offers and stock to Supply (a push token is enough)")
    supply_commands = supply.add_subparsers(dest="action", required=True)
    push_offers = supply_commands.add_parser("push-offers", help="Push offers to a CSV, LCSC or JLCPCB connector")
    push_offers.add_argument("connector", help="connector id")
    push_offers.add_argument("file", help="JSON file of offers, or - for stdin")
    push_offers.add_argument("--replace", action="store_true", help="these are all the connector's offers")
    push_offers.add_argument("--json", action="store_true", help="print the raw JSON")
    push_offers.set_defaults(handler=_supply_push_offers)
    push_levels = supply_commands.add_parser("push-levels", help="Push the whole stock of a push inventory source")
    push_levels.add_argument("source", help="inventory source id")
    push_levels.add_argument("file", help="JSON file of stock rows, or - for stdin")
    push_levels.add_argument("--json", action="store_true", help="print the raw JSON")
    push_levels.set_defaults(handler=_supply_push_levels)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        client = Client()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    try:
        return int(args.handler(client, args) or 0)
    except PrismError as error:
        print(f"{error.code}: {error.detail}", file=sys.stderr)
        return 1
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
