# Accepted divergences: index

A bundle member may differ from its golden only by a divergence accepted here (ADR §7, conventions.md §14). Each member's divergences live in two files owned by its producer WP (ownership.md item 11):

- `divergences/<member>.md` (the prose): the case, today's output and the bundle's, why the bundle is right, the affected consumer, and which committed fixtures it touches;
- `divergences/<member>.json` (`prism.parity.divergences.a0`): what the runner applies, as a rule, exact patches or ignored pointers (`prism_parity/divergences.py`).

The field map's "Expected divergences" table is the source of each id. A divergence that the golden transform already reflects, such as unit conversion or repository-relative paths, needs no runner entry; its `.md` section says so.

| Member | Producer | Prose | Runner entries | Applied on the committed fixtures |
|---|---|---|---|---|
| `semantic-index` | P1 | [semantic-index.md](divergences/semantic-index.md) | D1 (rule `semantic-index/envelope-a2`, every case) | every golden: `/schema` a1 → a2 |
| `board-objects` | P2 | [board-objects.md](divergences/board-objects.md) | none | — |
| `occurrences` | P2 | [occurrences.md](divergences/occurrences.md) | none | — |
| `route-metrics` | P2 | [route-metrics.md](divergences/route-metrics.md) | D7 (rule `route-metrics/via-spans-used-layers`, every case) | `rs-cynthion`: 150 of 336 nets gain inner copper layers |
| `stackup` | P3 | [stackup.md](divergences/stackup.md) | none | — |
| `placements` | P3 | [placements.md](divergences/placements.md) | none | — |
| `project` | P4 | [project.md](divergences/project.md) | none | — |
| `system-interface` | P5 | [system-interface.md](divergences/system-interface.md) | none | — |
| `component-models` | V1 | [component-models.md](divergences/component-models.md) | none (checked by `component_models_check.py`, not the runner) | — |

Expected refusals: `dv-malformed`'s sources are rejected by today's code, so stage parse must fail. `capture.json` records today's error for every member, and the runner reports `expected-refusal` when the bundle has no such member, or fails with `unexpected-member` when it has one.

Consumer-side divergences, which change what a consumer shows but not a member, are in the field maps. The runner does not apply them, but the capture's consumer checks in `capture.json` name each one that occurs on a fixture (for example placements D5 on the 14 boards without board-level Edge.Cuts, and occurrences D6 on 31 fixtures).
