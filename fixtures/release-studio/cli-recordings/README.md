# Release Studio CLI recordings

These JSON files are deterministic, scrubbed test inputs for environments that
do not have `kicad-cli`. They describe the focused board/schematic and jobset
commands used by R0. `<fixture>` and `<output>` are placeholders; recordings
never contain a machine path, timestamp, secret, or generated output directory.

The records are normalized around successful KiCad `10.0.4` invocations. A
live test still executes the real command through the shared test seam when the
pinned Release Studio executor is present.
