# Forge host configuration

Release publishing always recognizes the hosted defaults `github.com` and
`gitlab.com`. Hostnames are matched exactly; a hostname containing the word
`gitlab` is not enabled automatically.

The legacy form remains supported for self-hosted GitLab instances:

```env
PRISM_FORGE_HOSTS=git.acme.test=gitlab,git.other.example=gitlab
```

Use the structured JSON form when hosts need separate credentials or an API
root with a path prefix:

```env
PRISM_FORGE_HOSTS='[{"host":"git-a.acme.test","kind":"gitlab","api_root":"https://git-a.acme.test/api/v4","token_name":"ACME_GITLAB_A_TOKEN"},{"host":"git-b.acme.test","kind":"gitlab","api_root":"https://gateway.acme.test/gitlab-b/api/v4","token_name":"ACME_GITLAB_B_TOKEN"}]'
ACME_GITLAB_A_TOKEN=<token with api scope>
ACME_GITLAB_B_TOKEN=<token with api scope>
```

Each extra entry must use `kind: "gitlab"`, a bare validated `host`, an HTTPS
`api_root` without embedded credentials, query parameters, or fragments, and a
valid environment variable name in `token_name`. The API root may deliberately
use a different host when that endpoint is configured for the deployment. Its
path is preserved for GitLab API requests. Prism does not probe or infer
additional hosts and does not follow API redirects while sending credentials.

`token_name` names the environment variable that supplies the token; it is not
the token itself. Keep token values in a deployment secret store or a local
untracked environment file. The token needs GitLab `api` scope. The hosted
defaults continue to use `GITHUB_TOKEN` and `GITLAB_TOKEN`.

The release Compose bundle already passes every variable from the file named by
`PRISM_ENV_FILE` to the backend. Put structured host token variables in that
file. The source `docker-compose.yml` explicitly forwards the two hosted token
variables and cannot dynamically forward arbitrary names referenced by
`token_name`. For a self-hosted source deployment, add a local Compose override
with an untracked secret file:

```yaml
services:
  backend:
    env_file:
      - ./forge-host-secrets.env
```

Then place only the named variables in `forge-host-secrets.env`, or add each
named variable explicitly under the backend service's `environment` section.
