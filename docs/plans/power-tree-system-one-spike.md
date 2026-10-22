# Spike: a System One model for power-tree roles

Branch `spike/power-tree-system-one`, cut from `feature/analytic-pack-spike` (16b1436b), 2026-10-16.

## Question

Can an open System One decision model replace the regular expressions in
`backend/app/sim_studio/power_tree.py` that decide what each net and part *is*
(rail, ground, control, regulator, connector...), and can it run on a 16 GB
M2 Pro?

## What was built

- `backend/app/sim_studio/power_tree_s1.py` turns each net and active part into a
  compact record and asks one typed `choice` question over the TypeSafe
  `/v1/systemone` wire format. Confidences are kept. The topology in
  `power_tree.py` (inductor across a switch node, filtered sub-rails, ground
  pads) is unchanged.
- `tools/system-one-mlx/serve.py` runs H2O-Lightning-4B (Apache-2.0, Qwen3.5-4B
  fine-tune, #7 on JevBench v1.6.1 at 75.0 capability against Jev's 77.1) on MLX.
  It sits behind H2O's own shim, loaded from the model repo, in place of vLLM.
- `backend/scripts/power_tree_s1_eval.py` dumps records, runs the model, and
  scores the regex rules and the model against labels.
- `backend/.s1-eval/` holds four boards' labels and outputs. It is untracked.

Von (395M, the first candidate) was dropped before testing. It scores 27.5
composite on JevBench.

## Labels

There are four boards, 890 nets and 123 parts:

- openswitch-lan969x
- openswitch-10x10g-carrier
- Cynthion
- USB-PD-Trigger-Board

Claude subagents labelled them from the KiCad schematics and datasheets. They
did not see either system's output. **The labels are unreviewed.** Each
`*.labels.json` lists the cases its labeller was unsure of.

## Results (all four boards)

| | Nets right | Parts right |
|---|---|---|
| Regex (`power_tree.py` rules) | 787/890 (0.884) | 89/123 (0.724) |
| Model alone | 786/890 (0.883) | 92/123 (0.748) |
| **Hybrid, model at confidence ≥ 0.7** | **806/890 (0.906)** | **98/123 (0.797)** |

In the hybrid, the regex keeps ground and switch nodes. The model decides
everything else when its confidence is at least 0.7; below that, the regex
answer stands.

Per role, precision / recall:

| Role | Regex | Model | Hybrid@0.7 |
|---|---|---|---|
| supply_rail (n 90) | 0.97 / 0.70 | 0.85 / 0.82 | 0.97 / 0.80 |
| power_control (n 90) | 1.00 / 0.18 | 0.88 / 0.56 | 0.96 / 0.30 |
| ground (n 5) | 1.00 / 0.80 | 0.08 / 1.00 | 1.00 / 0.80 |
| switch_node (n 7) | 0.78 / 1.00 | 0.80 / 0.57 | 0.78 / 1.00 |
| power_switch (n 13) | — / 0.00 | 0.57 / 1.00 | 0.92 / 0.92 |
| switching_regulator (n 7) | 0.58 / 1.00 | 1.00 / 1.00 | 0.70 / 1.00 |
| power_input (n 10) | 0.45 / 0.50 | 0.36 / 0.40 | 0.42 / 0.50 |

Readings:

- **The two fail in different places.** The model finds rails without a
  voltage in their name, such as Cynthion's, where regex recall was 0.33. It
  also finds load switches, eFuses and back-to-back FET pairs, which the regex
  has no concept of. It is badly wrong on ground: about 60 nets, CC lines among
  them, were called ground. Names and topology handle ground and switch nodes
  better.
- **Confidence is calibrated enough to gate on.** On every board, answers at
  confidence ≥ 0.9 were 100% right, covering 16–50% of subjects. At ≥ 0.7, net
  answers were about 97% right, covering 59–86%.
- **Power input stays poor for both, at about 0.45.** Whether power enters or
  leaves through a connector is a direction-of-flow question. One net or part
  record does not show it; the board graph does.
- **The model cannot read unnamed rail voltages.** It mostly answers
  "unknown": 50% right on lan969x and 4% on the carrier, whose SFP VccT/VccR
  sub-rails sit behind ferrites. A voltage needs the feeding regulator's
  fixed-output part number or its feedback divider. That belongs in a
  deterministic resolver, not this model.

## On this machine (M2 Pro, 16 GB)

- 8-bit MLX conversion: 4.2 GB on disk, about 5.8 GB resident once MLX's buffer
  cache is capped. Uncapped, it grew to 11 GB and pushed the machine into swap.
- **About 1.1 s per question.** That is prefill-bound at about 3 ms per prompt
  token, for records of about 400 tokens. Batching does not help: the machine is
  compute-bound. A 300-net board takes about 6 minutes.
- So it runs here, but it is a background job, not an interactive one. On a
  GPU sim-worker, the model card reports 20–30 ms per question.

## Recommendation

Not as a replacement. As a **gated second opinion inside the regex inference**:

1. Keep `power_tree.py`'s topology, ground and switch-node rules.
2. Ask the model only about nets and parts the rules leave ambiguous: no
   voltage in the name but power pins on it, unknown regulator-like parts, and
   anything between two rails. That also cuts the question count, and so the
   time, several-fold.
3. Auto-accept at confidence ≥ 0.9, and show 0.7–0.9 as an editable assumption
   on the setup canvas. That fits sim-adr-0017's "inferred values are editable
   assumptions".
4. Add a `power_switch` element to the setup contract. The model finds these
   and the engine needs them as series elements.
5. Solve connector direction and rail voltages deterministically, not with the
   model.

Before acting on any of this, review the labels. They are the weakest link.
