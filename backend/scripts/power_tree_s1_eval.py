"""Spike eval: the regex power tree against a System One model, both scored on hand labels.

    python scripts/power_tree_s1_eval.py dump  --index <semantic-index.json> --out <board>.records.json
    python scripts/power_tree_s1_eval.py run   --index <semantic-index.json> --out <board>.model.json [--url ...]
    python scripts/power_tree_s1_eval.py score --index <semantic-index.json> --labels <board>.labels.json \
                                               --model <board>.model.json

Labels are {"nets": {net: role}, "parts": {ref: role}, "voltages": {net: volts}} over the dumped records,
with roles from ``power_tree_s1.NET_ROLES`` / ``PART_ROLES``. Unlabelled subjects are not scored.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.sim_studio import power_tree, power_tree_s1  # noqa: E402
from app.sim_studio.board_facts import from_semantic_index  # noqa: E402
from app.sim_studio.drafting import _CONTROL, _GROUND, rail_voltage  # noqa: E402

_CONTROL_TOKEN = re.compile(r"(?:^|[_\-])(?:EN|ENABLE|PG|PGOOD|PWRGD|POK|FB|SENSE|SNS|ILIM|SS|COMP|BST|BOOT)(?:[_\-]|$)", re.I)
_LINEAR = re.compile(r"ldo|linear", re.I)


def _facts(path: str):
    return from_semantic_index(json.loads(Path(path).read_text()))


def heuristic(facts) -> dict[str, dict[str, str]]:
    """What the regex rules in ``power_tree`` say each candidate is, in the model's role names."""

    board = power_tree._Board(facts)
    cand = power_tree.candidates(facts)
    named = power_tree._named_rails(board)
    found, _ = power_tree._converters(board, named, power_tree.Draft())
    rails = {r["net"] for r in cand["rails"]}
    switch = {p.net for c in found if c["kind"] == "switching" for p in board.pins.get(c["ref"], ())
              if (p.type == "POWER_OUT" or power_tree._OUTPUT_PIN.match(p.name)) and p.net not in named}
    nets = {}
    for net in power_tree_s1.candidate_nets(facts):
        leaf = net.rsplit("/", 1)[-1]
        if net in board.grounds:
            nets[net] = "ground"
        elif net in switch:
            nets[net] = "switch_node"
        elif _CONTROL.search(leaf) or _CONTROL_TOKEN.search(leaf):
            nets[net] = "power_control"
        elif net in rails:
            nets[net] = "supply_rail"
        else:
            nets[net] = "signal"
    kinds = {c["ref"]: c["kind"] for c in found}
    unsure = {row["component"] for row in cand["converters"]} - set(kinds)
    inputs = {row["component"] for row in cand["sources"] if not row["fed"]}
    loads = {row["component"] for row in cand["loads"] if not row["connector"] and row["power_in"]}
    parts = {}
    for ref in power_tree_s1.candidate_parts(facts):
        part = facts.parts.get(ref, {})
        text = " ".join(part.get(k, "") for k in ("library_ref", "value", "description"))
        if ref in kinds:
            parts[ref] = "linear_regulator" if kinds[ref] == "linear" else "switching_regulator"
        elif ref in unsure:
            parts[ref] = "linear_regulator" if _LINEAR.search(text) else "switching_regulator"
        elif ref in inputs:
            parts[ref] = "power_input"
        elif power_tree._is_connector(ref, part) or power_tree._prefix(ref) == "TP":
            parts[ref] = "signal_connector"
        elif ref in loads:
            parts[ref] = "load"
        else:
            parts[ref] = "other"
    return {"nets": nets, "parts": parts}


def dump(args) -> None:
    facts = _facts(args.index)
    index = power_tree_s1._Index(facts)
    out = {
        "nets": {net: power_tree_s1.net_state(index, net) for net in power_tree_s1.candidate_nets(facts)},
        "parts": {ref: power_tree_s1.part_state(index, ref) for ref in power_tree_s1.candidate_parts(facts)},
    }
    Path(args.out).write_text(json.dumps(out, indent=1))
    print(f"{len(out['nets'])} nets, {len(out['parts'])} parts -> {args.out}")


def run(args) -> None:
    facts = _facts(args.index)
    client = power_tree_s1.SystemOne(args.url, workers=args.workers, model=args.model_id,
                                     api_key=os.environ.get(args.key_env) if args.key_env else None)
    t0 = time.time()
    result = power_tree_s1.classify(facts, client)
    took = time.time() - t0
    unnamed = [d.subject for d in result["nets"] if d.answer == "supply_rail" and rail_voltage(d.subject) is None]
    volts = power_tree_s1.rail_voltages(facts, client, unnamed)
    asked = len(result["nets"]) + len(result["parts"])
    Path(args.out).write_text(json.dumps({
        "seconds": took, "questions": asked,
        "nets": [asdict(d) for d in result["nets"]],
        "parts": [asdict(d) for d in result["parts"]],
        "voltages": [asdict(d) for d in volts],
    }, indent=1))
    print(f"{asked} questions in {took:.1f}s ({took / max(asked, 1) * 1000:.0f} ms each); "
          f"{len(volts)} unnamed rails given voltages -> {args.out}")


def _score(name: str, truth: dict[str, str], guess: dict[str, str], conf: dict[str, float] | None = None) -> dict:
    keys = [k for k in truth if k in guess]
    right = [k for k in keys if truth[k] == guess[k]]
    roles = sorted(set(truth.values()))
    per_role = {}
    for role in roles:
        tp = sum(1 for k in keys if truth[k] == role and guess[k] == role)
        fp = sum(1 for k in keys if truth[k] != role and guess[k] == role)
        fn = sum(1 for k in keys if truth[k] == role and guess[k] != role)
        per_role[role] = {"n": tp + fn, "precision": round(tp / (tp + fp), 3) if tp + fp else None,
                          "recall": round(tp / (tp + fn), 3) if tp + fn else None}
    row = {"who": name, "n": len(keys), "accuracy": round(len(right) / max(len(keys), 1), 3), "per_role": per_role,
           "errors": sorted(f"{k}: {truth[k]} -> {guess[k]}" for k in keys if truth[k] != guess[k])}
    if conf is not None:
        # Selective accuracy: what share the model could auto-accept, and how right those are.
        for cut in (0.5, 0.7, 0.9):
            sure = [k for k in keys if conf.get(k, 0) >= cut]
            row[f"auto@{cut}"] = {"share": round(len(sure) / max(len(keys), 1), 3),
                                  "accuracy": round(sum(truth[k] == guess[k] for k in sure) / max(len(sure), 1), 3)}
    return row


def score(args) -> None:
    facts = _facts(args.index)
    labels = json.loads(Path(args.labels).read_text())
    heur = heuristic(facts)
    report = {}
    model = json.loads(Path(args.model).read_text()) if args.model else None
    for kind in ("nets", "parts"):
        truth = labels.get(kind, {})
        report[kind] = [_score("regex", truth, heur[kind])]
        if model:
            guess = {d["subject"]: d["answer"] for d in model[kind]}
            conf = {d["subject"]: d["confidence"] for d in model[kind]}
            report[kind].append(_score("model", truth, guess, conf))
    if model and labels.get("voltages"):
        truth = {k: str(v) for k, v in labels["voltages"].items() if rail_voltage(k) is None}
        guess = {d["subject"]: d["answer"] for d in model["voltages"]}
        report["unnamed_rail_voltages"] = _score("model", truth, guess)
    report["label_mix"] = {kind: dict(Counter(labels.get(kind, {}).values())) for kind in ("nets", "parts")}
    text = json.dumps(report, indent=1)
    if args.out:
        Path(args.out).write_text(text)
    print(text)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("dump", "run", "score"):
        p = sub.add_parser(name)
        p.add_argument("--index", required=True)
        p.add_argument("--out")
        if name == "run":
            p.add_argument("--url", default=power_tree_s1.DEFAULT_URL)
            p.add_argument("--workers", type=int, default=1)
            p.add_argument("--model-id", help="model name for a multi-model gateway, e.g. jev-1.13-free")
            p.add_argument("--key-env", help="environment variable holding the bearer token, e.g. OPENCODE_API_KEY")
        if name == "score":
            p.add_argument("--labels", required=True)
            p.add_argument("--model")
    args = ap.parse_args()
    {"dump": dump, "run": run, "score": score}[args.cmd](args)


if __name__ == "__main__":
    main()
