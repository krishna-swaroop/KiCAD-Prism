# Place private TLS material here for internal deployments

Tracked examples live one directory up:

- `../Caddyfile` — public ACME / Let's Encrypt over HTTP-01
- `../Caddyfile.dns-01` — public ACME over DNS-01, no inbound exposure needed
- `../Caddyfile.internal` — custom certificates (reads `/certs/...` in the container)
- `../nginx-tls.conf.example` — Nginx TLS terminator sketch

Typical files in this directory (not committed):

- `prism.crt`
- `prism.key`
- `corp-root-ca.crt` (distribute to KiCad workstations)

See `../../docs/DEPLOYMENT.md`.
