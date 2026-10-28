# Context bridge example

Run the static extension from the repository root:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory examples/extensions/context-bridge
```

Set `PRISM_EXTENSIONS_FILE` to the absolute path of `examples/extensions/registry.json`
in the backend environment and restart the backend. In Prism, open a project,
select **Extensions**, then **Inspect context**. **Open context bridge** opens
the same example in a separate tab. The loopback address refers to the computer
running your browser.

The example displays the context using text nodes and makes no network requests
beyond loading its own static assets. It does not implement a SPIKE protocol or
access design data. For a real integration, host your own bridge and give that
service a separately configured scoped Prism token.

See the [extension guide](../../website/src/content/docs/automate/extensions.md)
for installation, manifest fields, panel limits, and authentication.
