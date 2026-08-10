# Public Demo Plan (demo.<your-domain>)

Plan for hosting a public, no-login KiCAD Prism instance showing a curated corpus
of open-source KiCad projects.

Audience: someone who has never deployed a public site before. Every command is
meant to be run in order.

---

## 0. Reality check on the hosting constraint

You asked for "cheap compute that charges by usage/traffic rather than time".
For most web apps that means serverless (Cloudflare Workers, Vercel functions,
AWS Lambda). **Prism cannot run there**, and it is worth being explicit about why
before picking a host:

| Prism requirement | Why serverless fails |
|---|---|
| Backend image is ~3 GB (built **on top of** the `kicad/kicad` image, which ships the full KiCad binary + libraries) | Lambda caps at 10 GB but cold-starts badly; Workers cap at a few MB |
| Invokes `kicad-cli` as a subprocess | No arbitrary native binaries in most serverless runtimes |
| PostgreSQL 17 with four schemas (`workspace`, `comments`, `catalog`, `operations`) | Needs a persistent database, billed separately |
| Cloned Git repos + generated artifacts on a **read-write filesystem** under `/app/projects` | Serverless filesystems are ephemeral; Prism expects durable disk |
| Long-running background jobs (`prism-worker`, `catalog-worker`) | Request-scoped execution model, hard timeouts |

So the honest options are: **a small always-on VM** (charges by time, but the
absolute number is tiny), or **a scale-to-zero container host** (charges closer
to per-use, but with caveats). Recommendation and comparison in §2.

### The single most important cost decision

Prism's expensive work is *artifact generation*: the semantic index, WebGPU 3D
assets, iBOM, thumbnails, and design-comparison caches. For a **read-only
demo, none of that has to happen on the server.**

Generate everything locally on your Mac, then ship the finished `data/` directory
to the server. The public host then only serves pre-computed files, which means:

- no `prism-worker` / `catalog-worker` containers in production
- ~2 vCPU / 4 GB instead of the 24 GB of memory limits the dev compose file allows
- visitors physically cannot trigger a compute bill

This is the difference between a ~$6/mo demo and a ~$50/mo demo. Everything
below assumes this "pre-baked corpus" model.

---

## 1. Corpus: open-source KiCad projects

Selection criteria: genuinely KiCad-native (not an Altium export), complex enough
to show off hierarchical schematics and dense layout, permissively licensed, and
exercising a *different* Prism feature from the others.

### Tier 1 — the core demo set

| Project | Source | Size | Why it earns its slot |
|---|---|---|---|
| **USB-PD Trigger Board** | `github.com/krishna-swaroop/USB-PD-Trigger-Board` | 41 MB | Yours. Already has a release tag (`A.1.0.0`), hierarchical subsheets, a 3D model, and iBOM committed. Best "guided tour" project because you can explain every design decision. |
| **Antmicro Jetson Orin Nano Baseboard** | `github.com/antmicro/jetson-orin-baseboard` | 1.28 GB | The showpiece. High-speed SoM carrier, very dense, deep sheet hierarchy. Antmicro maintains it *in* KiCad, Apache-licensed. |
| **Antmicro Kria K26 Devboard** | `github.com/antmicro/kria-k26-devboard` | 521 MB | Xilinx UltraScale+ SoM carrier. Second flavour of the same class, good for showing the component catalog finding shared parts across projects. |
| **MNT Reform** | `source.mnt.re/reform/reform` | large | **A true monorepo: 7 separate PCBs** (motherboard, keyboard, OLED, trackball, trackball sensor, trackpad, battery). This is the one project that demonstrates Prism's multi-board monorepo import, which nothing else here does. Also a GitLab remote, proving Prism isn't GitHub-only. |
| **Glasgow Interface Explorer** | `github.com/GlasgowEmbedded/glasgow` | 55 MB | 2.1k stars, 0BSD, genuinely famous in this community, and *small*. Best cost-to-credibility ratio in the list. |

### Tier 2 — add if you want more breadth

| Project | Source | Size | Note |
|---|---|---|---|
| Antmicro CM4 Baseboard | `github.com/antmicro/cm4-baseboard` | 429 MB | KiCad 9.x, clean modern project |
| Antmicro COM Express 7 Baseboard | `github.com/antmicro/com-express-7-baseboard` | 577 MB | Dense, lots of high-speed differential routing |
| Antmicro Jetson AGX Thor Baseboard | `github.com/antmicro/jetson-agx-thor-baseboard` | 153 MB | Newest silicon in the list; good "we're current" signal |
| Cynthion | `github.com/greatscottgadgets/cynthion-hardware` | 38 MB | CERN-OHL-P, USB test instrument, compact |
| System76 Launch Keyboard | `github.com/system76/launch` | 27 MB | GPL-3.0, commercially shipped product, very different design domain |
| OrangeCrab | `github.com/orangecrab-fpga/orangecrab-hardware` | small | Greg Davill, ECP5 + DDR3L in a Feather footprint. Impressive density-per-square-inch. |
| ThunderScope | `github.com/EEVengers/ThunderScope` | 1.17 GB | MIT, 4-channel PCIe scope. Analog + high-speed digital mix. Large — clone shallow if disk is tight. |
| Olimex A64-OLinuXino | `github.com/OLIMEX/OLINUXINO` | large | Featured on kicad.org; note it's a big multi-product monorepo, so import only the `HARDWARE/A64-OLinuXino` subtree. |

### On your two other suggestions

- **Lukas Henkel / Open Visions Technology (Pi.MX8, Jet-SoM 8MP, the Linux
  smartwatch).** These are excellent, ambitious designs and he is a great name to
  associate with — but **the Pi.MX8 is designed in Altium Designer.** The
  published files are Altium data with a KiCad import promised but, as far as I
  can find, not delivered. Don't build the demo around this. If you want him
  represented, email him first and ask whether a KiCad export exists; a native
  KiCad version of that SiP/HDI work would be a fantastic addition precisely
  because it's HDI, which almost nothing else open-source is.
- **Wavenumber Engineering.** I could not find public open-source KiCad
  repositories for them. The only concrete trace is a KiCon North America 2025
  talk, "From Altium to KiCad and everything in between", about migrating a
  professional workflow with 20+ years of legacy projects into KiCad. That's a
  *relationship* worth having (they're exactly your target user) but not a corpus
  source today. Worth reaching out to about the talk rather than scraping.

### Deliberately excluded

- `antmicro/hardware-components` — **14 GB.** It's a component library, not a
  board project, and it would dominate your disk. You already have it cloned
  locally; use it to seed the Library Manager if you want, but don't import it as
  a project.
- `opulo-inc/lumenpnp` — 3.7 GB, and most of that is mechanical CAD, not PCB.

### Disk budget

Tier 1 alone is roughly **2 GB of Git data**, and Prism's generated artifacts
(semantic index, WebGPU 3D, previews, design-compare cache) will add on the order
of 2–4× that. **Provision at least 80 GB and expect to use 20–40 GB.** Tier 1 +
Tier 2 pushes toward 60–80 GB used, so size up to 160 GB if you take everything.

### Licence hygiene

Every project above is open-source, but "open" is not "do anything". Before
publishing, add a `LICENSE`/attribution line to each project's demo landing
copy. Specifically: CERN-OHL-S (Pi.MX8, if it ever lands) is *strongly*
reciprocal, CERN-OHL-P (Cynthion) is permissive, GPL-3.0 (System76 Launch)
covers the design files. You are only *displaying* them, which is fine, but
crediting the designer by name next to their board is both correct and good
manners — and it is the thing most likely to make those designers amplify your
demo rather than resent it.

---

## 2. Where to host

### Option A — Small x86 VM (recommended)

**Hetzner Cloud CPX31**: 4 AMD vCPU, 8 GB RAM, 160 GB NVMe, ~20 TB/mo traffic
included at EU locations. Roughly **€16–17/mo** — but note Hetzner adjusted
prices in 2026 (a further adjustment took effect 15 June 2026), so **check
current pricing before committing.**

If the pre-baked model works as intended, the cheaper **CPX21** (3 vCPU, 4 GB,
80 GB) at roughly €8/mo is likely sufficient for Tier 1. Start there; resizing up
on Hetzner is a 2-minute reboot.

Why this wins:
- **Traffic is effectively free** at 20 TB. Your demo will use single-digit GB.
  This satisfies the spirit of "charges by traffic" better than metered hosts do,
  because the traffic bill is simply zero.
- **x86 matters.** Your `.env` currently targets
  `KICAD_BASE_IMAGE=kicad/kicad:10.0.4-arm64-local` — a base image you built
  yourself on Apple Silicon, which does not exist in any registry. On an x86 host
  use the repository's pinned upstream `kicad/kicad:10.0.4` AMD64 image and its
  digest. Native ARM64 release images are not published; Docker Desktop can
  emulate the supported AMD64 image for local testing, but AMD64 is the public
  deployment target.
- Everything you already have — `docker-compose.yml`, `deploy/Caddyfile` — runs
  unchanged.

Equivalent alternatives: DigitalOcean ($24/mo for 4 GB, 4 TB transfer), Vultr,
Linode. All ~2–3× Hetzner for the same specs.

### Option B — Scale-to-zero container host

**Fly.io** with `auto_stop_machines`. Genuinely closest to "pay per traffic":
compute stops when nobody is visiting, ~$0.0027/hr for the smallest shared-CPU
machine.

Caveats you must know before choosing this:
- **Volumes bill even when the machine is stopped** — $0.15/GB/mo. A 40 GB volume
  is $6/mo *before any compute*, which already matches a whole Hetzner box.
- Fly's free tier ended in 2026.
- Cold start on a 3 GB image is not 1–3 seconds; expect **20–60 s** for the first
  visitor after idle. For a demo you're linking from a talk or a README, the
  first person to click gets a blank page. That's a bad first impression.
- Still needs managed Postgres (Fly Postgres, or Neon/Supabase free tier).

**Google Cloud Run** is the other real option here (per-request billing, up to
32 GB RAM, scales to zero, and its startup-CPU-boost helps). But Cloud Run has no
persistent writable disk — you'd need GCS via FUSE or Filestore, which is a
meaningful rearchitecture of how Prism stores `data/projects`. Not worth it for a
demo.

**Verdict:** Option B costs about the same as Option A, adds cold-start pain, and
requires more work. Choose it only if traffic is genuinely spiky and rare.

### Option C — Free

**Oracle Cloud Always Free** ARM Ampere: 4 OCPU, 24 GB RAM, 200 GB, 10 TB/mo
egress, free indefinitely. Tempting, and the specs are absurd for free.

But: it's **ARM**, so you inherit the KiCad-from-source build problem above;
capacity is frequently unavailable in popular regions; and Oracle reclaims idle
free instances. Don't put a demo you're showing to industry people on it.

### Recommendation

**Hetzner CPX21 or CPX31 (x86, EU) + Cloudflare in front (free tier).**
Cloudflare gives you DNS, caching, DDoS protection, and analytics at no cost, and
caching matters here: the large static artifacts (3D assets, iBOM, images) get
served from Cloudflare's edge rather than your origin, which keeps a small box
responsive under a traffic spike from Hacker News or a conference talk.

Budget: **~€8–17/mo server + ~$10/yr domain.**

---

## 3. Step-by-step: from nothing to a live demo

### Step 1 — Buy the domain (~$10–12/yr)

Registrar: **Cloudflare Registrar** (sells at wholesale cost, no markup, no
upsells, free WHOIS privacy) or **Porkbun** (similar pricing, nicer UI, can
register TLDs Cloudflare won't).

Name suggestions, in order of preference:
- `kicadprism.com` — clearest
- `prism-ecad.com` / `prismecad.com` — safer if you ever want distance from the
  KiCad trademark
- `kicadprism.dev` — `.dev` is HSTS-preloaded, so browsers *force* HTTPS. Nice
  security property, and cheap.

> **Trademark note:** "KiCad" is a registered trademark of the KiCad project.
> Using it in a domain for a third-party commercial product is the kind of thing
> worth a short, friendly email to the KiCad team before you buy — they are
> approachable, and you're already in that community via KiCon. Getting an
> explicit "fine by us" costs you one email and removes a real future headache.

You'll serve the demo from a subdomain: `demo.kicadprism.com`.

### Step 2 — Point the domain at Cloudflare

1. Create a free account at `cloudflare.com`.
2. "Add a site", enter your domain.
3. Cloudflare gives you two nameservers. If you bought at Cloudflare Registrar
   this is already done. At Porkbun, paste them into the domain's nameserver
   settings.
4. Wait for propagation (minutes to a few hours). Cloudflare emails you.

### Step 3 — Create the server

1. Sign up at `hetzner.com/cloud`, create a project.
2. **Add your SSH key first** (Security → SSH keys). On your Mac:
   ```bash
   ssh-keygen -t ed25519 -C "hetzner-prism-demo"
   ```
   Press Enter for the default path, set a passphrase. Then paste the contents of
   `~/.ssh/id_ed25519.pub` into Hetzner.

   > This is your *personal* key for logging into the server. It is unrelated to
   > the Git deploy key Prism manages at `data/ssh/` — don't reuse it there.
3. Create a server: Location **Nuremberg or Helsinki** (cheapest traffic),
   Image **Ubuntu 24.04**, Type **CPX21** (shared vCPU / AMD), your SSH key,
   and enable **Backups** (+20%, worth it).
4. Note the public IPv4 address.

### Step 4 — First login and basic hardening

```bash
ssh root@<SERVER_IP>
```

```bash
apt update && apt upgrade -y
adduser prism
usermod -aG sudo prism
rsync --archive --chown=prism:prism ~/.ssh /home/prism
```

Lock down SSH — edit `/etc/ssh/sshd_config` and set:

```
PermitRootLogin no
PasswordAuthentication no
```

```bash
systemctl restart ssh
```

Firewall — only SSH and HTTP(S):

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Unattended security updates:

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

Now reconnect as the non-root user and confirm it works before closing the root
session:

```bash
ssh prism@<SERVER_IP>
```

### Step 5 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker prism
```

Log out and back in for the group change to apply, then verify:

```bash
docker run --rm hello-world
```

### Step 6 — DNS record

In Cloudflare → your domain → DNS → Add record:

- Type **A**, Name **demo**, IPv4 **<SERVER_IP>**
- Proxy status: **Proxied** (orange cloud) — this is what gives you caching,
  DDoS protection, and analytics

Then SSL/TLS → Overview → set encryption mode to **Full (strict)**.

> Ordering matters: Caddy needs to solve an ACME challenge to get its
> certificate, and Cloudflare's proxy can interfere. Easiest path is to set the
> record to **DNS only** (grey cloud) first, let Caddy issue the cert in Step 8,
> confirm HTTPS works, *then* switch to Proxied.

### Step 7 — Deploy the code

```bash
cd /opt
sudo git clone https://github.com/krishna-swaroop/KiCAD-Prism.git prism
sudo chown -R prism:prism prism
cd prism
cp .env.example .env
```

Edit `.env`. The demo-critical values (see §4 for the full rationale — **do not
skip that section, the defaults are unsafe for public hosting**):

```env
# --- Platform: use the Dockerfile AMD64 KiCad default ---
# Exact digest lives only in backend/Dockerfile. Override at build time with:
#   docker compose build --build-arg KICAD_BASE_IMAGE=...
KICAD_BASE_PLATFORM=linux/amd64
DOCKER_PLATFORM=linux/amd64

# --- Public, no-login demo ---
AUTH_ENABLED=false
DEV_GUEST_ROLE=viewer          # Keep the least-privilege guest role explicit
DEV_MODE=false

WORKSPACE_NAME=KiCAD Prism — Public Demo
PUBLIC_BASE_URL=https://demo.kicadprism.com
CORS_ORIGINS_STR=https://demo.kicadprism.com

# --- Keep heavy features off; artifacts are pre-baked ---
CATALOG_KLC_ENABLED=false
CATALOG_RETENTION_ENABLED=true

# --- Postgres ---
POSTGRES_PASSWORD=<generate a long random string>

# --- Not used in guest mode, but must not be a placeholder ---
SESSION_SECRET=<generate with the command below>
GITHUB_TOKEN=
```

Generate secrets:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
```

### Step 8 — TLS via Caddy

You already have `deploy/Caddyfile`. Point it at the real hostname:

```
demo.kicadprism.com {
    reverse_proxy frontend:8080
}
```

Caddy obtains and renews a Let's Encrypt certificate automatically. Bring the
stack up with the proxy overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

The first build compiles the frontend and installs the Python environment on top
of the KiCad image — **expect 15–30 minutes** on a shared-vCPU box. Watch it:

```bash
docker compose logs -f
```

Then confirm the origin is healthy and HTTPS is live:

```bash
curl -I https://demo.kicadprism.com
```

Once that returns `200`, go back to Cloudflare and flip the DNS record to
**Proxied**.

### Step 9 — Load the corpus

Do the imports **locally on your Mac first**, where you have CPU to spare and an
admin session, then copy the finished data up. Locally, with `DEV_GUEST_ROLE=admin`:

1. Import each Tier 1 project through the UI.
2. For each one, generate every artifact the demo needs: semantic index,
   WebGPU 3D, thumbnail, iBOM.
3. For MNT Reform, use the monorepo import path so all 7 boards appear.
4. Pre-compute the diffs and design comparisons you plan to show, so the results
   are already cached (see §4.3 — visitors won't be able to trigger these).
5. Click through the whole demo yourself and confirm nothing shows a spinner that
   never resolves.

Then ship it:

```bash
# from your Mac, in KiCAD-Prism/
docker compose stop
tar -czf prism-demo-data.tar.gz data/projects
rsync -avP prism-demo-data.tar.gz prism@<SERVER_IP>:/opt/prism/
```

```bash
# on the server
cd /opt/prism
docker compose stop backend
tar -xzf prism-demo-data.tar.gz
docker compose up -d
docker compose restart frontend   # refresh Nginx's DNS for the backend container
```

Also dump and restore Postgres, or the database won't know about the projects you
just copied:

```bash
# Mac
docker compose exec postgres pg_dump -U postgres kicad_prism > prism-demo.sql
rsync -avP prism-demo.sql prism@<SERVER_IP>:/opt/prism/
# server
docker compose exec -T postgres psql -U postgres kicad_prism < prism-demo.sql
```

### Step 10 — Analytics

**Cloudflare Web Analytics** (free) is the right default:
- Dashboard → Analytics → Web Analytics → add your hostname
- It gives you pageviews, visitors, referrers, countries, and Core Web Vitals
- **No cookies, no client-side fingerprinting** → under GDPR you do not need a
  consent banner, which matters because your audience is heavily European

You also get request counts, bandwidth, cache hit ratio, and threat blocks for
free in the main Cloudflare dashboard, with no code change at all.

If you later want per-project funnel data ("which board do people open? do they
reach the 3D view?"), self-host **Umami** or **Plausible** as one extra container
— both are cookieless and roughly 200 MB of RAM. Skip until you actually need it.

### Step 11 — Guard against surprise bills and abuse

1. **Hetzner** → set a traffic alert. Traffic beyond the included 20 TB is billed
   per TB, so know before it happens.
2. **Cloudflare** → Security → WAF → add a rate limiting rule: more than
   ~100 requests/minute from one IP to `/api/*` gets blocked. The free tier
   includes one rate-limiting rule; this is the single highest-value use of it,
   because it is your backstop for §4.3.
3. **Cloudflare** → Caching → set a Cache Rule so the large immutable artifacts
   (3D assets, iBOM HTML, preview images) are cached at the edge. This is what
   keeps a €8 box alive during a traffic spike.
4. **Uptime monitoring**: a free UptimeRobot or Better Stack check on
   `https://demo.kicadprism.com` so you find out before your audience does.

---

## 4. Changes needed on Prism's side

Prism already has a guest mode (`AUTH_ENABLED=false`), so this is *mostly*
configuration. Guest mode remains unsuitable for an internet-facing service,
but the default role and open-deployment guard are now least-privilege. The
remaining demo work is rate limiting, pre-baking expensive views, and shaping
the UI around read-only access.

### 4.1 Guest role hardening (implemented)

The default guest role in `backend/app/core/config.py` is now `viewer`:

```python
DEV_GUEST_ROLE: str = Field(
    default="viewer",
    description="Role granted to the implicit guest user when AUTH_ENABLED is false."
)
```

and `docker-compose.yml` passes it straight through:

```yaml
- DEV_GUEST_ROLE=${DEV_GUEST_ROLE:-viewer}
```

`AUTH_ENABLED=false` still serves every request as that configured guest role,
so keep `DEV_GUEST_ROLE=viewer` explicit in a public-demo environment. The
configuration validator refuses open HTTPS deployments and refuses an
anonymous-admin configuration when the public origin is not local. Startup
also logs a prominent guest-mode warning. An administrator guest is appropriate
only for a private local seed/evaluation machine.

### 4.2 `viewer` breaks two features you probably want in the demo

Audited guards on the mutating endpoints:

| Feature | Endpoint | Guard | Works as guest viewer? |
|---|---|---|---|
| Visual SCH/PCB/BOM diff | `POST /api/projects/{id}/diff` | `require_designer` | **No** |
| Design comparison | `POST /api/projects/{id}/design-compare` | `require_viewer` | Yes |
| Trigger jobset workflow | `POST /api/projects/{id}/workflows` | `require_designer` | No (good) |
| Generate semantic index | `POST /api/projects/{id}/semantic-index/generate` | `require_designer` | No (good) |
| Generate WebGPU 3D | `POST /api/projects/{id}/webgpu-3d/generate` | `require_designer` | No (good) |
| Sync repo from remote | `POST /api/projects/{id}/sync` | `require_designer` | No (good) |
| Create/reply comment | `POST /api/projects/{id}/comments` | `require_designer` | No |
| Delete project | `DELETE /api/projects/{id}` | `require_designer` | No (good) |
| Folder create/move/delete | `folders.py` | `require_designer` | No (good) |

The problem: **visual diff is designer-gated**, and it's one of the most
compelling things Prism does. Two ways to handle it:

- **Simplest (do this first):** pre-compute diffs locally for a few interesting
  commit pairs so the cached results render, and deep-link to them from your demo
  landing copy. Your own USB-PD board already has a tag (`A.1.0.0`) and a commit
  history to diff against.
- **Better long-term:** introduce an explicit `PRISM_DEMO_MODE=true` flag that
  relaxes *read-only-but-expensive* operations for viewers while keeping all
  destructive operations designer-gated. Implement it as a dedicated dependency
  (e.g. `require_designer_or_demo`) applied only to `POST .../diff`, so the
  permission widening is visible at each call site rather than hidden in role
  resolution. Do **not** solve this by promoting guests to `designer` — that
  would hand them project deletion, repo import, and jobset execution.

The comments UI is shipped, but guest viewers cannot create or reply to
comments. That keeps a public demo read-only while preserving discussion review;
public write access would be a spam magnet.

### 4.3 Endpoints that are viewer-guarded but expensive — the real abuse surface

These are reachable by anonymous visitors once `DEV_GUEST_ROLE=viewer`, and they
are the ones that can cost you money or take the box down:

1. **`POST /api/projects/{id}/design-compare` (`require_viewer`)** — kicks off a
   heavy multi-worker comparison job (`PRISM_DESIGN_COMPARE_MAX_*_WORKERS`).
   Anonymous, unauthenticated, unrate-limited, and repeatable in a loop. This is
   the most serious issue after §4.1. Mitigate by: pre-warming the revision cache
   (`PRISM_DESIGN_COMPARE_CACHE`) for the pairs you demo, adding a demo-mode
   check that serves only cached comparisons and returns `429`/`503` for
   uncached requests, and the Cloudflare rate-limit rule from Step 11.

2. **`POST /api/projects/{id}/design-compare/debug-log` (`require_viewer`)** —
   accepts up to 128 KB per event and appends to a file on disk. It's a debugging
   aid with rotation, but it is an anonymous write primitive. **Disable it
   entirely when `PRISM_DEMO_MODE=true`.**

3. **Job cancellation is designer-gated.** `POST /api/jobs/{job_id}/cancel`
   requires a designer (or the catalog write role for catalog jobs), so a guest
   viewer cannot cancel another visitor's work. Keep this authorization in place
   when shaping a public-demo overlay.

Note that Prism's existing `rate_limit_service` is wired into the *login* and
*OAuth* paths only (`auth.py:104`, `oauth.py:26`) — not the job-creating
endpoints. Extending it to cover design-compare is the natural fix, and reuses
`rate_limit_service.client_fingerprint(request)` which already exists.

### 4.4 Production compose overlay

Add a `docker-compose.demo.yml` overlay that:

- **omits `catalog-worker` and `prism-worker`** entirely (artifacts are pre-baked;
  their default limits of 8 GB and 12 GB of memory are why you'd otherwise need a
  much bigger server)
- **removes the `ports:` mapping on `backend`** — right now `docker-compose.yml`
  publishes `8000:8000`, which on a public host exposes the API directly,
  bypassing the frontend proxy, Caddy, TLS, and Cloudflare. Only Caddy should be
  reachable from outside. `ufw` in Step 4 blocks this at the firewall too, but
  Docker has a habit of writing its own iptables rules — fix it in compose, don't
  rely on the firewall.
- mounts `./data/projects` **read-only** (`:ro`) if you can confirm nothing writes
  at request time. Verify first: the design-compare cache and debug log both write
  under this tree, so this depends on §4.3 being done.
- sets `UVICORN_WORKERS=2` and modest `PRISM_BACKEND_CPU_LIMIT` /
  `PRISM_BACKEND_MEMORY_LIMIT` to match the small box.

### 4.5 Frontend touches

- `frontend/src/App.tsx:246-254` already branches on `user.email === 'guest@local'`,
  so the plumbing for a guest-specific UI exists. Extend it to hide the Settings
  and access-control navigation for viewers, so guests don't click through to a
  wall of `403`s.
- Add a persistent demo banner: "Public read-only demo — [what Prism is] —
  [request a trial]". This is your conversion path; don't ship the demo without
  it.
- Hide or disable "Import repository", "Sync", and "New folder" for viewers
  rather than letting them fail. A greyed-out control with a tooltip ("disabled
  in the public demo") reads as intentional; a `403` toast reads as broken.
- Add a short per-project description and attribution line naming the original
  designer and licence (see §1). Prism already supports project display names and
  descriptions (`PUT /api/projects/{id}/description`), so this needs no new
  backend work.

### 4.6 Pre-launch checklist

Run through this against the live public URL before sharing the link:

```bash
# All of these MUST return 403
curl -X DELETE https://demo.kicadprism.com/api/projects/<some-id>
curl -X POST https://demo.kicadprism.com/api/projects/import
curl -X POST https://demo.kicadprism.com/api/settings/ssh-key/generate \
     -H 'Content-Type: application/json' -d '{"email":"x@y.z"}'
curl https://demo.kicadprism.com/api/settings/access/users
curl -X POST https://demo.kicadprism.com/api/projects/<id>/workflows

# This MUST fail to connect (backend not publicly exposed)
curl --max-time 5 http://<SERVER_IP>:8000/api/projects
```

Also confirm: `GITHUB_TOKEN` is empty in the deployed `.env`; `data/ssh/` contains
no private key you care about; `docker compose logs backend | head -40` shows the
guest-mode warning with role `viewer`, not `admin`.

---

## 5. Ongoing cost and effort

| Item | Cost |
|---|---|
| Hetzner CPX21 (3 vCPU, 4 GB, 80 GB) | ~€8/mo |
| Hetzner backups | +20% (~€1.60/mo) |
| Domain (.com via Cloudflare Registrar) | ~$10/yr |
| Cloudflare (DNS, CDN, WAF, Web Analytics) | Free |
| TLS (Let's Encrypt via Caddy) | Free |
| **Total** | **~€10/mo + $10/yr** |

Verify Hetzner's current pricing at checkout — there were adjustments during 2026.

Maintenance: `unattended-upgrades` handles OS patches. Refreshing the corpus is a
manual `git pull` + regenerate + re-ship cycle (Step 9); quarterly is plenty. If
that becomes tedious, script it as a GitHub Action that rebuilds the data bundle
and rsyncs it — you already have a self-hosted runner checked out in
`../actions-runner/`.

---

## 6. Suggested order of work

1. §4.1 — keep `DEV_GUEST_ROLE=viewer` and verify the open-deployment guard
2. §4.3 — neutralise or rate-limit the anonymous design-compare and debug-log endpoints
3. §4.4 — write `docker-compose.demo.yml` (drop workers, unpublish port 8000)
4. Test the whole thing **locally** with `DEV_GUEST_ROLE=viewer` and confirm the
   demo is still compelling with everything a viewer can't do removed
5. §4.5 — frontend banner, hidden admin nav, attributions
6. Buy the domain, create the server, deploy (§3)
7. Import Tier 1 locally, pre-bake artifacts, ship the bundle
8. §4.6 — run the pre-launch checklist against the public URL
9. Announce

Step 4 is the one people skip. Do it before you spend money on a server: it's
where you find out whether a read-only Prism is a good demo, and if it isn't,
you'll want to know that before provisioning anything.
