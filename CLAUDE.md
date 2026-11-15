# GroveWorks: notes for Claude

GroveWorks is Grove's agroforestry design and operations app (formerly RegenWorks). The code is **public**; Grove's prices, clients and offers are not. See `MAINTENANCE.md` for how the system fits together.

## Working rules
- Branch from `dev`, open PRs into `dev`. `main` is production and only moves via the "Promote dev to main" workflow.
- Before opening a PR run what applies: `pnpm --filter isomorphic lint`, `pnpm --filter backend lint`, `pnpm --filter backend test`, `pnpm --filter @rw/modelling test`.
- **Review:** for risky changes (access/roles, prices/offers/client data, schema or migrations, layout maths, auth), get a review from the `reviewer` agent (`.claude/agents/reviewer.md`) before merging, and fix blockers. Dependency bumps and docs don't need it.
- Grove-internal data goes under `/internal` (backend) or behind `requireRole` (web app server); roles are defined in `packages/db/access.ts`.
- Never commit prices, client data or secrets. Prices live in the private `regen-farmer/grove-data` repo.
- Screens say farm / field / scenario; code still says parcel / layer / project. Don't rename internals piecemeal.
