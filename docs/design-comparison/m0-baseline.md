# M0: the baseline, and what it took to make it reproducible

M0 of [the revamp plan](../DESIGN_COMPARISON_REVAMP.md). The plan said no later
milestone's numbers mean anything until the current pipeline can be measured
repeatably. Making that true took three fixes; two of them were harness bugs
that had been silently corrupting measurements, including some of the numbers
the plan itself rests on.

Harness: `scripts/benchmark_design_compare.py`, run inside `prism-worker`
(the compare pipeline runs there, not in `backend`).

## Verdict

| | |
| --- | --- |
| **Output determinism** | **pass** — identical change counts, object counts and serialized bytes across every run |
| **A single run's timing** | **not reproducible** — 9–28% peak-to-peak on identical input |
| **Median of five runs** | **reproducible** — two independent batches agree to 8.4% (A) and 3.4% (B) |

So the gate is met, but only in its restated form: **compare medians of five
runs, not single runs.** The band an improvement must clear is roughly 10%.

## Fixed panels

- **A** — JTYU-OBC `8f71cfe → 4b0a39a`
- **B** — `SSD_XX_200_EPS_BACKPLANE` `05a89dd → 934be89`

## What was broken

### 1. Cache isolation never reached the revision workers

`--cache-dir` and the default temporary cache set `design_compare_service._CACHE_ROOT`
in the parent. The revision workers are `ProcessPoolExecutor` processes started
with **spawn**, not fork: they re-import the module and take the cache root
from `PRISM_DESIGN_COMPARE_CACHE`. The parent's assignment never reached them.

Three consequences, all of which looked like results:

- Run 2 of a `--repeat 2` scored `initial-cache-hit` against run 1's supposedly
  isolated cache and finished in 1.2 s instead of 12 s.
- `_build_pcb_revisions` runs in the *parent*, so it looked for a snapshot in
  the parent's cache root, found nothing, and reported **zero PCB geometry
  objects in 0.1 ms** — a stage that actually takes 4.8 s per revision on A.
- `revision.json` measured 10.4 MB instead of 31.7 MB, because it was missing
  the geometry the absent snapshot never produced.

Fixed by exporting `PRISM_DESIGN_COMPARE_CACHE` before each run.

### 2. Every run left its cache behind

Each cold run leaves ~64 MB of snapshots and `revision.json` on disk. Holding
all of them until the end put the container under page-cache pressure that
accumulated across runs: run 3 of 3 was 28% slower than run 1, monotonically,
in every stage. That reads as an unreproducible pipeline when it is the
harness. Each run's cache is now deleted as soon as its artifact stats have
been collected.

### 3. Hash randomisation is a measurable term

`PYTHONHASHSEED` is unset by default, so dict and set iteration order differs
per process. On the netlist compile that is worth a great deal: its run-to-run
spread fell from **29.9% to 1.1%** once the seed was pinned. The script now
re-execs itself with `PYTHONHASHSEED=0` if the caller did not set one.

## What is still variable, and why it is not a harness bug

After all three fixes, individual cold runs still vary by 9–28% peak to peak.
`cpuMs` was recorded alongside wall clock specifically to tell scheduling noise
from real work, and the two track each other to within a few tenths of a
percent on every stage that does its work in-thread. So this is the pipeline
genuinely doing more or less work, plus host state — not the scheduler, and
not something more harness care removes.

The distribution has a long fast tail rather than symmetric noise. Five runs of
A: 14.47, 16.72, 14.08, 13.60, 13.76 s. Raw peak-to-peak is 22%, driven
entirely by the one run that caught a quiet host; the rest sit inside 6%. The
reported band therefore drops the fastest and slowest run before measuring,
which needs five runs to mean anything — hence `--repeat 5`.

`revision.pcb.cache-write` is the one stage that stays wide (73% on A) even
trimmed. It writes 32 MB twice; that is disk, and M3 deletes most of it.

## Baseline

Medians of five runs, production worker configuration (2 initial + 2 PCB
workers), cold cache. Stage times are **summed over both revisions**, which
build concurrently; the per-revision column is that halved.

### A — JTYU-OBC

| stage | median | per revision | band |
| --- | ---: | ---: | ---: |
| **cold compare, wall clock** | **14.08 s** | | 5.1% |
| `schematic-semantic-index` | 12.57 s | 6.29 s | 5.4% |
| ├ `load-project` | 9.53 s | 4.76 s | 3.0% |
| ├ `compile-netlist` | 1.78 s | 0.89 s | 0.2% |
| └ `scan-instance-fields` | 0.80 s | 0.40 s | 13.3% |
| `pcb-geometry` | 9.54 s | 4.77 s | 4.7% |
| `schematic-geometry` | 1.42 s | 0.71 s | 7.8% |
| `snapshot` | 0.82 s | 0.41 s | 8.1% |
| `cache-write` (pcb) | 1.13 s | 0.56 s | 73.1% |

### B — backplane

| stage | median | per revision | band |
| --- | ---: | ---: | ---: |
| **cold compare, wall clock** | **12.50 s** | | 15.4% |
| `schematic-semantic-index` | 15.78 s | 7.89 s | 20.0% |
| ├ `load-project` | 10.55 s | 5.27 s | 13.8% |
| ├ `compile-netlist` | 2.98 s | 1.49 s | 22.3% |
| └ `scan-instance-fields` | 1.19 s | 0.59 s | 22.7% |
| `pcb-geometry` | 2.03 s | 1.02 s | 9.1% |
| `schematic-geometry` | 1.54 s | 0.77 s | 9.2% |
| `snapshot` | 0.69 s | 0.35 s | 13.7% |

B is consistently the noisier panel. Its medians are nonetheless stable: two
independent five-run batches gave 12.50 s and 12.92 s.

### Artifacts and object counts

| | A base | A head | B base | B head |
| --- | ---: | ---: | ---: | ---: |
| `revision.json` | 31.70 MB | 32.16 MB | 13.87 MB | 14.13 MB |
| geometry sidecar | 26.73 MB | 26.94 MB | 7.04 MB | 7.37 MB |
| geometry share | 84.3% | 83.8% | 50.8% | 52.2% |
| schematic geometry objects | 18,468 | 19,180 | 21,247 | 22,212 |
| PCB geometry objects | 18,697 | 18,697 | 1,595 | 1,925 |
| semantic components | 944 | 986 | 1,039 | 1,029 |
| semantic nets | 912 | 995 | 2,326 | 2,082 |
| semantic terminals | 3,658 | 3,822 | 5,241 | 5,219 |

| PROJECT_DIFF | A | B |
| --- | ---: | ---: |
| serialized | 1.14 MB | 1.48 MB |
| documents | 12 | 17 |
| change entries | 2,255 | 3,480 |
| unique `(id, side)` | 2,251 | 3,417 |
| **inflation** | **1.0018×** | **1.0184×** |
| entries carrying a `bbox` | 2,255 | 3,480 |
| navigation entries | 803 | 1,783 |
| diagnostics | 10 | 64 |

Changes: A 1,297 schematic / 0 PCB / 95 BOM. B 1,575 / 459 / 150.

Every one of these is byte-for-byte identical across all five runs, which is
the property that matters most: a later milestone cannot appear faster by
quietly producing a different answer.

## Reconciliation with the plan's figures

| plan | measured | |
| --- | --- | --- |
| `revision.json` 32.15 MB | A head **32.16 MB**; B 14.13 MB | reproduces, but it is A's number, not a general one |
| Change-id inflation 1.002× / 1.021× | **1.0018× / 1.0184×** | reproduces |
| `_extract_geometry` 2.2 s | B **1.79 s**/rev; A **5.48 s**/rev | reproduces on B only |
| `build_semantic_index` 4.1 s | A **6.29 s**/rev; B **7.89 s**/rev | **does not reproduce** — 1.5–1.9× higher |
| Cold compare ~8.3 s | A **14.08 s**; B **12.50 s** | **does not reproduce** — 1.5–1.7× higher |

Two things to take from this.

**The geometry stage's cost is dominated by board size, not by the project.**
A's board carries 18,697 PCB geometry objects against B's 1,595; the same code
costs 4.77 s per revision on one and 1.02 s on the other. Quoting a single
figure for `_extract_geometry` was never meaningful. It is also why A is the
right panel for M1's memory question.

**The plan's prior timings were not measured in the worker image.** They are
1.5–1.9× optimistic against what the pipeline actually costs where it runs.
That matters directly for the parser comparison the whole revamp turns on:
`kicad-sexpr-parser`'s 639 ms board and 250 ms schematics were measured on the
host, and are being compared against Python stages now known to be
substantially slower in-container than the host figures suggested. The
comparison probably still favours the parser — the gap is large — but it is
not yet a like-for-like measurement, and M1 must produce one before anything
is deleted.

## Consequences for later milestones

- **M3's target must be restated.** "≤5.5 s, from ~8.3 s" was written against a
  figure that does not reproduce. Against this baseline the honest equivalent
  of that ambition (a ~34% reduction) is **≤9.3 s on A and ≤8.3 s on B**, and
  the artifact target of ≤6 MB should be read against A's 32.16 MB and B's
  14.13 MB separately.
- **M1 must measure in the image, on panel A**, and report per-revision figures
  next to A's 6.29 s semantic index and 4.77 s PCB geometry.
- **Report medians of five runs.** A single before/after pair cannot support any
  claim smaller than about 30%.
- **A carries no PCB changes** (`pcbChanges: 0`) even though it has the larger
  board, so M2's PCB agreement rate has to be measured on B.
