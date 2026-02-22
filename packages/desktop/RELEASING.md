# RegenWorks Desktop Release & Updater Guide

This document explains how the Tauri auto-update system works internally and the exact steps required to publish new desktop releases.

## How the Auto-Updater Works

Tauri handles cross-platform auto-updating securely through a dual-architecture proxy. 

### 1. The Proxy API Endpoint (`[target]/[arch]/[current_version]`)
Unlike Electron, Tauri cannot natively digest massive generic JSON payloads directly from the GitHub API. It strictly requires a highly-formatted, tiny JSON schema to understand update availability. 

When the RegenWorks app boots:
1. It queries our internal SolidStart web server at `/api/updater/...`
2. The server seamlessly asks GitHub internally for the newest release bundle.
3. The server translates the GitHub structure down into the strict JSON object Tauri expects, pulling the external download links and validating the `.sig` cryptography keys.
4. It serves the translated JSON natively back to Tauri.
5. If the version numbers are different, Tauri prompts the user and begins silently downloading from GitHub. 

### 2. Environment Targeting
The Desktop app binds to completely different APIs and API versions based on its built-in environment strings:

- **Production Builds (`pnpm build`)**:
  - Automatically compiles using `tauri.conf.json`.
  - Statically maps its internal updater queries strictly to `https://app.regenfarmer.com/api/updater/...`.
  - Is explicitly designed to read versions tracked on the `main` GitHub branch safely.
  
- **Staging Builds (`pnpm build:staging`)**:
  - Automatically overrides configurations using `tauri.staging.conf.json`.
  - Statically maps its internal updater queries specifically to `https://staging.regenfarmer.com/api/updater/...`.
  - Is explicitly designed to read unpolished prerelease distributions safely.

---

## How to Release a New Version

We use an automated GitHub Actions deployment pipeline (`packages/publish-desktop.yml`) to automatically compile MacOS, Windows, and Linux bundles entirely in the cloud. You no longer need to manually compile or sign `.dmg`, `.exe`, or `.AppImage` files on your local machine.

### 1. Releasing a Staging Prerelease (Targeting `dev`)
If you want to release an unstable update (like an `alpha` or `beta`) for internal testing on the `staging.regenfarmer.com` bounds:

1. Ensure you are currently checked out on the `dev` branch.
2. Open `packages/desktop/package.json` and bump the `"version"` field (e.g., `"2026.1.0-alpha.5"`).
3. Open `packages/desktop/src-tauri/tauri.conf.json` and cleanly bump the exact identical `"version"` field there too.
4. Commit your files (`git commit -am "chore: bump version to alpha.5"`).
5. Push to GitHub (`git push`).

**What happens next?**
Because the version contains `alpha`, `beta`, `rc`, or `pre`, and because you pushed natively to `dev`, GitHub Actions automatically:
- Starts building all OS bundles securely inserting the staging URLs.
- Drops the bundles into the `regenworks-distribution` repository natively tagged as a **Pre-release**.

### 2. Releasing a Production Stable Update (Targeting `main`)
If you are ready to formally drop a finished software release globally across your `app.regenfarmer.com` bounds:

1. Follow the same exact steps on the `dev` branch to strip away the prerelease string. Set both configuration files strictly to standard semantic integers (e.g., `"2026.1.0"`).
2. Commit your version bumps locally to `dev`.
3. Open a Pull Request or directly merge your `dev` branch smoothly into `main`.
4. Push `main` natively up to GitHub.

**What happens next?**
Because the version string does **not** contain any prerelease tags, and because you natively pushed a merge event cleanly onto `main`, GitHub Actions intelligently:
- Builds all final OS bundles statically bounding the code specifically to your stable production URLs.
- Safely deploys the final bundles natively to `regenworks-distribution` identically tagged as **Latest** stable.

### Failsafes 🛡️
The pipeline physically prevents mistakes:
- If you accidentally push a "stable" string onto the `dev` branch, the pipeline cleanly cancels itself without publishing.
- If you accidentally merge an `alpha` tag into the `main` branch, the pipeline firmly aborts the build identically to contain broken deployment spills.
