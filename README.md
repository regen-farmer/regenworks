# RegenWorks

RegenWorks is an agroforestry design and management platform. This repository contains the web app, backend API, shared database models, modelling code, and desktop packaging.

## Repository Layout

- `packages/isomorphic` - SolidStart web app.
- `packages/frontend` - shared frontend components and client code.
- `packages/backend` - Express backend API.
- `packages/db` - shared Mongoose schemas.
- `packages/modelling` - agroforestry layout and geometry modelling.
- `packages/gis-napi` - native geometry addon.
- `packages/desktop-electron` - Electron desktop package.
- `packages/desktop-tauri` - Tauri desktop package.

## Requirements

- Node.js 24. See `.nvmrc`.
- pnpm 11. See `packageManager` in `package.json`.
- Rust and `wasm-pack` for geometry/WebAssembly builds.
- MongoDB for backend development.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Create local environment files from examples where available:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Run the web app:

```bash
pnpm --filter isomorphic dev
```

Run the backend:

```bash
pnpm --filter backend dev
```

## Useful Checks

```bash
pnpm --filter isomorphic lint
pnpm --filter backend lint
pnpm --filter isomorphic build
pnpm --filter backend build
```

## Security And Secrets

Do not commit `.env` files, private certificates, signing keys, API keys, database dumps, or generated build output. Before publishing this repository publicly, scan both the working tree and the full Git history with a history-aware scanner such as `gitleaks` or `trufflehog`, then rotate any credential that was ever committed.
