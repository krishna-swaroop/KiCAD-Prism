# M7 performance follow-up

This follow-up benchmarks the completed Design Comparison revamp in its
production worker image, checks the dependency actually used by each Docker
configuration, replays the Cynthion failure case from
[issue 78](https://github.com/krishna-swaroop/KiCAD-Prism/issues/78), and
removes one remaining parser bottleneck.

All reported timings are medians of five cold, cache-isolated runs inside the
`prism-worker` container. The stack ran with `AUTH_ENABLED=false`,
`DEV_GUEST_ROLE=admin`, two initial revision workers, and two PCB workers.

## Dependency result

The default `docker-compose.yml` image still installs the published upstream
pin from `kicad-prism-viewer/requirements-runtime.txt`:

```text
kicad-monkey==2026.6.13
```

The local development override,
`docker-compose.local-kicad-monkey.yml`, installs the adjacent
`../kicad_monkey` working tree. The benchmarked local image reported
`kicad-monkey 2026.7.28` and `PRISM_KICAD_MONKEY_SOURCE=local-working-tree`.
A byte-for-byte hash of all 145 installed Python files matched the working
tree.

Earlier host benchmarks also imported the adjacent local fork. Their generator
label could misleadingly contain the installed environment's upstream version,
but their imported module was the local source tree.

## Local-fork optimizations

The fork contains four Design Comparison-relevant optimizations beyond the
current upstream branch:

- `1d1aec8` adds schematic-only serialization. Prism uses
  `include_pcb=False` during the semantic stage, avoiding an otherwise
  redundant board parse.
- `e7c9262` replaces repeated whole-board net resolution with one shared,
  linear lookup table.
- `dd2f73b` lexes S-expressions in one regex scan.
- `b4c862b` builds ordinary S-expression trees iteratively while retaining the
  recursive parser for span capture and KiCad's legacy `teardrops` dialect.

The last change was added after profiling this worker. On OBC's 2.39 MB largest
schematic, tree construction fell from 110 ms to 22 ms in isolation. Parser,
schematic round-trip, and corpus passthrough validation passed: 182 tests.

## Timing matrix

| input | configuration | median | relative result |
| --- | --- | ---: | --- |
| OBC A | M0 previous implementation | 14.08 s | baseline |
| OBC A | local fork before iterative tree builder | 9.73 s | 30.9% below M0 |
| OBC A | local fork at `b4c862b` | **7.11 s** | **49.5% below M0** |
| OBC A | published upstream `2026.6.13` | 57.57 s | 8.09x slower than current local |
| Backplane B | M0 previous implementation | 12.50 s | baseline |
| Backplane B | local fork before iterative tree builder | 11.76 s | within the old noise floor |
| Backplane B | local fork at `b4c862b` | **9.13 s** | **26.9% below M0** |
| Cynthion `r1.3.0..r1.4.0` | local fork at `b4c862b` | **1.86 s** | complete semantic result |
| Cynthion `r1.3.0..r1.4.0` | published upstream `2026.6.13` | 7.57 s | 4.06x slower and incomplete |

The iterative tree builder reduced the current large-input median by 26.9% on
OBC and 22.4% on Backplane. Cynthion moved from 1.82 s to 1.86 s, which is
below that input's timing noise and confirms the optimization is targeted at
large schematic trees.

Every local batch was deterministic. The OBC result remained 5,069 schematic,
0 PCB, and 57 BOM changes. The production-faithful Backplane snapshot remained
4,027 schematic, 1,699 PCB, and 154 BOM changes. Both had zero scoped-id
collisions and zero document-diff diagnostics.

## Revision concurrency

The two revisions are already generated concurrently:

- snapshot extraction: two threads;
- schematic semantics and BOM: two spawned Python processes;
- ecad-viewer object delta: one Node process, running alongside both semantic
  processes;
- PCB and stackup: two threads.

An OBC batch with one initial revision worker took 15.65 s. The equivalent
two-process batch took 9.73 s before the parser change: a 37.8% wall-time
reduction, or 1.61x throughput. More revision workers cannot help because
there are only two revisions. More parser workers would compete with the two
Python processes inside the worker's six-CPU budget.

## Cynthion replay

The normal import created project `prj_409c0b693ac1`. A production API
comparison of `r1.3.0` (`b4fc924`) to `r1.4.0` (`13aa71c`) completed on fence 1
with worker exit code 0 and no lease-loss warning.

The worker benchmark recorded 2.66 s total ready time and produced:

- 3,624 schematic changes;
- 4,706 PCB changes;
- 48 BOM changes;
- 18 documents and 9,127 recursively counted change entries;
- 9,127 unique scoped ids, zero duplicates, and zero diagnostics.

The published upstream package cannot complete Cynthion's semantic index.
Prism's compatibility fallback calls `to_json(include_indexes=True)`, which
materializes the board and fails while parsing a valid KiCad
`(at ... unlocked)` footprint-text form. M7's ecad-viewer delta still recovers
3,464 schematic changes, but the semantic nets, terminals, hierarchy, buses,
and 160 semantic-enriched schematic changes are absent. The local fork avoids
that board parse and produces 366/375 nets, 1,324/1,342 terminals, 20/20 sheet
instances, and 564/564 bus records.

This is the likely cause of issue 78's old stackup-only or incomplete result:
the previous pipeline cached the failed/empty semantic result, while its
Python geometry path also failed on the board syntax. The parser-owned M7 path
now degrades to native object changes, and the local fork restores the complete
semantic layer.

## Remaining bottlenecks

After `b4c862b`, the two-revision OBC median is dominated by:

| stage | summed revision time | wall-clock role |
| --- | ---: | --- |
| kicad-monkey semantic index | 10.85 s | overlaps across two processes |
| `load-project` within that index | 8.71 s | primary critical path |
| ecad-viewer object delta | 4.57 s | overlaps semantic work |
| netlist compilation | 1.70 s | secondary semantic cost |
| initial revision pipeline wall time | 5.94 s | 83.5% of total |

The Node delta's OBC profile was about 55-65% parser work and 20-30%
index/hash work. The 35 MB board represented roughly 73% of one revision's
Node parse, and the two-revision process peaked around 1.46 GB RSS. Splitting
schematic and PCB Node readiness could improve time-to-first-domain, but adding
worker threads is not a free total-time win and raises peak memory.

The next high-value work is therefore:

1. publish or otherwise pin a released fork build containing the four
   optimizations; the default upstream pin is both slower and incomplete on
   Cynthion;
2. continue reducing kicad-monkey schematic lex/tree/model construction, which
   remains the total-time critical path;
3. consider separating schematic and PCB object-delta readiness only if
   time-to-first-domain is more important than peak memory.

## Backplane fixture note

Production snapshots intentionally include KiCad sources, not generated legacy
`.net` exports. The Backplane repository's full checkout contains such an
export; allowing kicad-monkey to consume it reports 41 sheet instances, while
the production-faithful source snapshot reports 33. This explains the count
difference from the original M7 host replay and is unrelated to process
concurrency or the installed package. Benchmark comparisons must use the same
snapshot policy on both sides.
