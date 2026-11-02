---
title: Set up HTTPS
description: Put Prism behind HTTPS with the bundled Caddy proxy, Tailscale, DNS-01 certificates, your own CA or an existing proxy.
sidebar:
  order: 4
---

Prism needs HTTPS for anything other than a private trial. KiCad's remote
symbol panel refuses a Prism that advertises `http://` addresses, and most
identity providers refuse `http://` redirect addresses.

## How requests reach Prism

```text
browser or KiCad -> HTTPS proxy -> frontend:80 -> backend:8000
```

Point the proxy at the `frontend` container. It serves the web app and passes
`/api/`, `/oauth/`, `/mcp`, `/git/`, `/remote-provider/` and the
`/.well-known/` discovery documents to the API.

Whatever terminates HTTPS must:

- keep the public `Host` header;
- send `X-Forwarded-Proto: https`.

Then set the public address in the environment file:

```env
PUBLIC_BASE_URL=https://prism.example.com
CORS_ORIGINS_STR=https://prism.example.com
```

The session cookie becomes `Secure` on its own once `PUBLIC_BASE_URL` is
`https://`. See [Public address](/KiCAD-Prism/admin/configuration/#public-address).

## Choose a scheme

| Scheme | Use it when | What you provide |
| --- | --- | --- |
| [Public certificate over HTTP-01](#public-certificate-over-http-01) | The host is reachable from the internet. | A DNS name; ports 80 and 443 open. |
| [Public certificate over DNS-01](#public-certificate-over-dns-01) | The host must stay internal, but browsers should trust it without a private CA. | A DNS provider API credential. |
| [Your own certificate](#your-own-certificate) | You have an internal CA. | `prism.crt` and `prism.key`. |
| [Tailscale](#tailscale) | Your team already uses Tailscale. | MagicDNS and HTTPS certificates turned on. Installer only. |
| [Existing reverse proxy](#existing-reverse-proxy) | nginx, Traefik or a load balancer already terminates TLS. | Its configuration. |
| [Plain HTTP](#plain-http-for-a-trial) | You are trying Prism on one machine. | Nothing. |

The [guided installer](/KiCAD-Prism/admin/deployment/#deploy-with-the-guided-installer)
offers all six and writes the files for you. The steps below are for a release
bundle, which you configure by hand.

## Public certificate over HTTP-01

1. Point a DNS record for your host name at the server.
2. Open ports 80 and 443 to the internet.
3. In `Caddyfile`, replace `prism.example.com` with your host name.
4. Set `PUBLIC_BASE_URL` and `CORS_ORIGINS_STR` to `https://` and that name.
5. Start with the proxy profile:

   ```bash
   docker compose --profile proxy up -d --wait
   ```

Caddy obtains and renews the certificate from Let's Encrypt.

If port 80 or 443 is already taken on the host, set `PRISM_CADDY_HTTP_PORT` and
`PRISM_CADDY_HTTPS_PORT` in `.env` and include the port in the public address,
for example `https://prism.example.com:8443`. HTTP-01 needs ports 80 and 443
reachable from the internet, so with other ports use DNS-01 or your own
certificate.

## Public certificate over DNS-01

DNS-01 proves you own the name by publishing a TXT record. Ports 80 and 443 stay
closed to the internet, the DNS record may exist only in internal DNS, and no
private CA has to reach the KiCad workstations. In exchange the host holds a DNS
credential and runs a custom Caddy image.

1. Build a Caddy image with your DNS provider's module. The stock `caddy:2`
   image cannot do DNS-01. From the bundle directory:

   ```bash
   docker build -f Dockerfile.caddy-dns --build-arg DNS_PROVIDER_MODULE=github.com/caddy-dns/cloudflare -t kicad-prism-caddy-dns:2 .
   ```

2. Check that the module is in the image. The command must print a line:

   ```bash
   docker run --rm kicad-prism-caddy-dns:2 caddy list-modules | grep dns.providers
   ```

3. Create the narrowest credential your provider allows. For Cloudflare that is
   an API token with **Zone / DNS / Edit** on the one zone, not the Global API
   Key.
4. Copy `Caddyfile.dns-01` over `Caddyfile`. Set the host name and your
   provider's `dns` line, and uncomment the staging `ca` line for the first run.
5. Set `PRISM_CADDY_IMAGE=kicad-prism-caddy-dns:2` and the credential, for
   example `CLOUDFLARE_API_TOKEN`, in `.env`.
6. Pass the credential to the proxy with an override file, so `compose.yml`
   stays untouched:

   ```yaml
   # docker-compose.dns-01.yml
   services:
     caddy:
       environment:
         - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN in .env}
   ```

7. Start, and watch issuance in the proxy log:

   ```bash
   docker compose -f compose.yml -f docker-compose.dns-01.yml --profile proxy up -d --wait
   ```

   ```bash
   docker compose -f compose.yml -f docker-compose.dns-01.yml logs -f caddy
   ```

8. When the staging certificate is issued, comment the `ca` line out again,
   stop the stack, remove the Caddy data volume so the staging account goes
   with it, and start again:

   ```bash
   docker volume rm kicad-prism_caddy-data
   ```

An installer deployment does step 8 with `./deploy.sh --promote`.

Check issuance in the proxy log, not in a browser. Prism sends
`Strict-Transport-Security` for one year, so once a name has served a trusted
certificate, browsers refuse to make an exception for the staging one.

If your DNS team will not hand out a credential for the whole zone, delegate
only the challenge record to a separate zone that this deployment controls:

```text
_acme-challenge.prism.example.com.  CNAME  prism.acme-delegation.example.
```

Things to know:

- Container traffic must reach the certificate authority and the DNS provider's
  API. A filter that intercepts them makes the failure look like a TLS error
  against `acme-v02.api.letsencrypt.org`. Test from inside the container:

  ```bash
  docker compose exec caddy nslookup acme-v02.api.letsencrypt.org
  ```

- Every certificate is published in Certificate Transparency logs, so the host
  name becomes public within minutes even though the service is internal.
- Renewal is automatic at about 30 days before expiry, but needs the DNS
  credential to still be valid. Track its expiry too.

## Your own certificate

1. Copy `Caddyfile.internal` over `Caddyfile` and set your host name.
2. Put `prism.crt` and `prism.key` in `certs/`.
3. Install the issuing root CA on every browser and KiCad workstation.
4. Start with the proxy profile:

   ```bash
   docker compose --profile proxy up -d --wait
   ```

### Bare IP addresses

Browsers and Windows send no server name when the address is an IP, so Caddy
cannot pick a certificate and the handshake fails (`ERR_SSL_PROTOCOL_ERROR` in
Chrome). Name the IP in a global `default_sni` block at the top of the
Caddyfile and use it as the site address:

```caddyfile
{
	default_sni 192.168.1.20
}

192.168.1.20 {
	tls /certs/prism.crt /certs/prism.key
	# the rest of the site block from Caddyfile.internal
}
```

The certificate must list the address as an IP subject alternative name, and
`PUBLIC_BASE_URL` must be `https://192.168.1.20`. Public certificates cannot be
issued for a private IP. A DNS name, even an internal-only one, avoids all of
this.

## Tailscale

Tailscale Serve terminates HTTPS under the node's MagicDNS name and issues and
renews the certificate. There is no public DNS record, no open inbound port and
nothing to renew. Only devices on your tailnet can reach Prism.

Turn on **MagicDNS** and **HTTPS Certificates** on the DNS page of the Tailscale
admin console, then run the installer and choose Tailscale. It offers two modes:

- **Use this host's Tailscale**, when the server is already on the tailnet. No
  container is added. Point Serve at the frontend once; it survives reboots:

  ```bash
  tailscale serve --bg 8080
  ```

- **Sidecar**, when it is not. The installer adds a Tailscale container that
  joins the tailnet with a reusable auth key. Leave the key's **Ephemeral**
  option off, or the node may come back under a new name and certificate.

## Existing reverse proxy

1. Start Prism without the proxy profile.
2. Route your proxy to `http://127.0.0.1:8080`.
3. Keep the `Host` header and set `X-Forwarded-Proto: https`.
4. Allow request bodies up to 2 GB and read timeouts of a few minutes. Library
   imports upload large files, and some API calls run long.

`deploy/nginx-tls.conf.example` in the repository is a starting point for
nginx. With several proxies in a row, set `PUBLIC_BASE_URL`; it wins over any
forwarded header.

Prism sends its own security headers: `Content-Security-Policy`,
`X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`,
`X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`. Pass them
through unchanged. A proxy that replaces the Content Security Policy, or loosens
`connect-src`, lets a page send design data to other sites. Prism cannot be
framed by another site; serve it as its own page.

## Plain HTTP for a trial

The installer's plain HTTP scheme runs Prism without TLS on one machine. The
KiCad remote symbol panel does not work with it, and most identity providers
refuse its redirect address, so the installer offers to turn sign-in off. The
guest then gets the `viewer` role, and the port is bound to `127.0.0.1`.
Everything else works.

Prism refuses to start with sign-in off when `PUBLIC_BASE_URL` is `https://`,
or when it names another host and the guest role is `admin`.

## Check the result

Every address in these two documents must start with your public `https://`
address:

```bash
curl -fsS https://prism.example.com/.well-known/kicad-remote-provider
```

```bash
curl -fsS https://prism.example.com/oauth/.well-known/oauth-authorization-server
```

If they show `http://`:

1. Set `PUBLIC_BASE_URL=https://<your host>`.
2. Make the outer proxy keep `Host` and send `X-Forwarded-Proto: https`.
3. Recreate the containers and fetch the documents again.
