#!/usr/bin/env node
/**
 * Patch the stock Electron.app bundle for dev mode so it shows
 * "RegenWorks" in the menu bar / dock and uses our icon.
 *
 * Runs automatically via the "postinstall" npm script.
 * Only affects the local node_modules copy — no effect on packaged builds.
 */
const path = require("path");
const fs = require("fs");

const electronPkgDir = path.resolve(require.resolve("electron"), "..");
const distDir = path.join(electronPkgDir, "dist");

// Find the .app bundle (may already be renamed from a previous run)
let appDir = path.join(distDir, "Electron.app");
if (!fs.existsSync(appDir)) {
  appDir = path.join(distDir, "RegenWorks.app");
}
const electronDir = path.join(appDir, "Contents");

if (!fs.existsSync(electronDir)) {
  // Not on macOS or Electron not installed yet — skip silently
  process.exit(0);
}

// --- 1. Patch Info.plist (menu bar name, About dialog title, dock tooltip) ---
const plistPath = path.join(electronDir, "Info.plist");
if (fs.existsSync(plistPath)) {
  let plist = fs.readFileSync(plistPath, "utf8");
  const replacements = [
    ["CFBundleName", "RegenWorks"],
    ["CFBundleDisplayName", "RegenWorks"],
  ];
  for (const [key, value] of replacements) {
    plist = plist.replace(
      new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`),
      `$1${value}$2`,
    );
  }
  fs.writeFileSync(plistPath, plist);
  console.log("  ✔ Patched Info.plist → RegenWorks");
}

// --- 2. Replace app icon ---
const icnsSource = path.join(__dirname, "..", "icons", "icon.icns");
const icnsDest = path.join(electronDir, "Resources", "electron.icns");
if (fs.existsSync(icnsSource) && fs.existsSync(icnsDest)) {
  fs.copyFileSync(icnsSource, icnsDest);
  console.log("  ✔ Replaced electron.icns → RegenWorks icon");
}

// --- 3. Rename Electron.app → RegenWorks.app (dock tooltip uses folder name) ---
const oldApp = path.join(distDir, "Electron.app");
const newApp = path.join(distDir, "RegenWorks.app");
if (fs.existsSync(oldApp)) {
  fs.renameSync(oldApp, newApp);
  const pathTxt = path.join(electronPkgDir, "path.txt");
  fs.writeFileSync(pathTxt, "RegenWorks.app/Contents/MacOS/Electron");
  console.log("  ✔ Renamed Electron.app → RegenWorks.app");
}
