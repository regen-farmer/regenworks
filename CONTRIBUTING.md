# Contributing

Thank you for contributing to RegenWorks.

## Development Flow

Create feature branches from `dev` and open pull requests back into `dev`.

```bash
git fetch upstream dev
git switch -c your-branch-name upstream/dev
pnpm install
```

## Before Opening A Pull Request

Run the checks that match the code you changed:

```bash
pnpm --filter isomorphic lint
pnpm --filter backend lint
pnpm --filter isomorphic build
pnpm --filter backend build
```

For frontend or end-to-end changes, run the relevant Playwright tests:

```bash
pnpm --filter isomorphic test:e2e
```

## Secrets

Never commit local `.env` files, certificates, signing keys, API keys, personal access tokens, database dumps, or production data. Use `.env.example` files for placeholders only.

If a secret is committed by mistake, rotate it immediately. Removing it in a later commit is not enough because it remains in Git history.
