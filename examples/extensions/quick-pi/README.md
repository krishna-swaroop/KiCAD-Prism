# Quick PI Lite

An independently hosted extension for manual DC series-path screening,
inspired by [WayriCAD Quick PI](https://github.com/wayri/WayriCAD/blob/decdee0a40d82128e957150f2acc7ecc2df5b41b/quick_pi_plugin/README.md).
This is an original implementation of elementary analytical formulas. It does
not copy, embed or depend on the WayriCAD solver or its GPL implementation.

From the repository root, serve both bundled extensions:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory examples/extensions
```

Use `examples/extensions/registry.json` as `PRISM_EXTENSIONS_FILE`, then open
**Project → Extensions → Open DC path screen**. You can also open
`http://127.0.0.1:8765/quick-pi/` directly. Prism must use a different hostname;
use `localhost` for Prism during local testing.

## Declare a path

1. Enter source voltage in V, constant load current in A, copper resistivity in
   nΩ·m at your operating temperature, and the permitted voltage drop in percent.
2. Add trace, via-group and lumped resistor stages. Include the return path.
3. Enter dimensions and identical parallel-path counts. The via diameter is the
   **finished inner hole diameter**, and plating thickness is radial copper.
4. Click **Calculate**. Editing any input hides the old result until recalculated.
5. Expand **Study report JSON** and select the text to copy a reproducible report.

The sandbox needs only scripts. Classic scripts work with the stock static
server in an opaque-origin frame; module scripts would need CORS. No API calls,
credentials, storage, dependency install, build, downloads or host changes are
required. A page reload or revision change resets the study; copy the report
before leaving. Project context is attribution supplied by Prism, not evidence
that these dimensions came from the selected board.

## Equations and numerical checks

For resistivity ρ in Ω·m and dimensions in metres:

- Trace: R = ρL/(wt).
- Via barrel: R = ρL/[πp(d + p)], where d is the finished bore and p the plating.
- N identical parallel paths: stage resistance is R/N, with equal sharing.
- Series sum: Rtotal = ΣRstage; drop = I Rtotal; conductor loss = I² Rtotal.
- Average conductor current density: J = I/(N A), reported in A/mm².

The default copper assumption is ρ = 1.724×10⁻⁸ Ω·m at 20°C. The reference
example has two 10×1 mm, 35 µm strips and a 1.6 mm via with 0.3 mm finished bore
and 25 µm plating, at 2 A. These dimensions match WayriCAD's documented
[analytical reference fixtures](https://github.com/wayri/WayriCAD/blob/decdee0a40d82128e957150f2acc7ecc2df5b41b/docs/PI_REFERENCE_BENCHMARKS.md).
The tests compare independently expressed analytic answers, unit conversions,
parallel sharing, conservation, infeasible demands and invalid inputs at a
relative tolerance of 10⁻¹² for non-zero reference values.

```sh
node --test examples/extensions/tests/quick-pi.test.mjs
```

These checks verify the formulas in software; they do not establish measured
board accuracy. This version has one constant-current load and an ideal source.
It does not extract copper, mesh a board, infer return paths, include contact
or spreading resistance, resolve crowding, qualify current capacity, predict
heating/fusing, or perform AC/transient/constant-power studies. The average J
value is not a maximum allowable current. A budget result applies only to the
declared voltage-drop constraint; a load voltage of zero or below is infeasible.
