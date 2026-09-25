# React Doctor contract

React Doctor is a frontend regression gate, not an active findings backlog.
The repository-owned command is:

```bash
cd frontend
npm run scan:gate
```

`frontend/react-doctor-baseline.json` permits zero errors and zero warnings.
The gate fails if either count increases. Use `npm run scan` for an interactive
diagnostic report; do not install or invoke an unpinned copy with `npx`.

`frontend/doctor.config.ts` contains the maintained exclusions and rule
overrides. Intentional exceptions live beside the affected code as
`react-doctor-disable-next-line <rule> - <reason>` comments so the invariant is
reviewed with the implementation.

## Historical remediation

The initial 2026-08-22 audit found 303 findings. A correctness and accessibility
pass reduced the live report to 217 warnings, and the comparison/state cleanup
then brought the enforced report to zero. Those intermediate counts are
historical and must not be cited as current repository state.

The detailed finding inventory and remediation discussion remain available in
the Git history through these commits:

- `8e3f7c7` — establish scanning and the verified baseline;
- `8005e8d` — harden security findings;
- `03200cb` — correct correctness and accessibility findings;
- `7c4f706` — document and baseline the final dispositions.

Future temporary inventories belong in the pull request or issue that owns the
remediation. Keep this document limited to the supported command, enforced
baseline, and durable exception policy.
