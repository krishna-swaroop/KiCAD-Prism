# Extension examples

Run the static examples from the repository root:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory examples/extensions
```

Set `PRISM_EXTENSIONS_FILE` to the absolute path of `examples/extensions/registry.json`
in the backend environment and restart the backend. In Prism, open a project,
select **Extensions**, then **Inspect context**. **Open context bridge** opens
the same example in a separate tab. The loopback address refers to the computer
running your browser.

The registry also installs **Quick PI Lite**. Select **Open DC path screen**
to calculate a manually declared DC path with trace, via and resistor stages.
The report includes the selected Prism project and revision, input units,
assumptions and per-stage results. It does not extract PCB geometry or run the
WayriCAD copper solver. See [Quick PI Lite](quick-pi/README.md) for equations,
reference checks and model limits. If Prism uses `127.0.0.1`, open Prism through
`localhost` so the extensions have a separate hostname.

The context bridge displays identifiers using text nodes and makes no network requests
beyond loading its own static assets. It does not implement a SPIKE protocol or
access design data. For a real integration, host your own bridge and give that
service a separately configured scoped Prism token.

See the [extension guide](../../website/src/content/docs/automate/extensions.md)
for installation, manifest fields, panel limits, and authentication.
