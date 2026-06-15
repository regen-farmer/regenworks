#!/usr/bin/env bash
set -euo pipefail

PNPM_VERSION="${PNPM_VERSION:-11.3.0}"

npm install --global "pnpm@${PNPM_VERSION}"
pnpm install --frozen-lockfile
pnpm --filter isomorphic build
