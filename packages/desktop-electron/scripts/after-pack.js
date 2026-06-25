/**
 * electron-builder afterPack hook.
 *
 * After packaging, the app.asar.unpacked directory contains native .node files.
 * On macOS, these .node files link to dylibs via absolute build paths.
 * This script:
 *  1. Finds all non-system dylib dependencies of .node files
 *  2. Copies them alongside the .node file (if not already there)
 *  3. Rewrites load paths with install_name_tool to use @loader_path
 *  4. Re-signs all modified binaries (macOS invalidates signatures on modification)
 *
 * On Linux, it uses patchelf to set rpath to $ORIGIN.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.packager.platform.name;

  // Find the app.asar.unpacked directory
  let unpackedDir;
  if (platform === "mac") {
    const appName = context.packager.appInfo.productFilename;
    unpackedDir = path.join(
      appOutDir,
      `${appName}.app`,
      "Contents",
      "Resources",
      "app.asar.unpacked",
    );
  } else {
    unpackedDir = path.join(appOutDir, "resources", "app.asar.unpacked");
  }

  if (!fs.existsSync(unpackedDir)) {
    console.log("  afterPack: no app.asar.unpacked directory, skipping");
    return;
  }

  // Find all .node files recursively
  const nodeFiles = findFiles(unpackedDir, ".node");
  if (nodeFiles.length === 0) return;

  if (platform === "mac") {
    for (const nodeFile of nodeFiles) {
      bundleDylibsMac(path.dirname(nodeFile));
    }
  } else if (platform === "linux") {
    for (const nodeFile of nodeFiles) {
      patchElfLinux(nodeFile);
    }
  }
  // Windows: DLLs are found automatically if in the same directory — no patching needed
};

/**
 * macOS: bundle dylibs alongside .node files and rewrite load paths.
 */
function bundleDylibsMac(dir) {
  const nodeFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".node"))
    .map((f) => path.join(dir, f));

  // Collect all non-system dylib dependencies (recursively)
  const dylibsToCopy = new Map(); // originalPath → basename

  function collectDeps(binary) {
    for (const dep of getNonSystemDeps(binary)) {
      const basename = path.basename(dep);
      if (!dylibsToCopy.has(basename)) {
        dylibsToCopy.set(basename, dep);
        // If the dylib exists at the source, check its deps too
        if (fs.existsSync(dep)) {
          collectDeps(dep);
        }
      }
    }
  }

  for (const nodeFile of nodeFiles) {
    collectDeps(nodeFile);
  }

  // Copy dylibs that aren't already in the directory
  for (const [basename, srcPath] of dylibsToCopy) {
    const dest = path.join(dir, basename);
    if (!fs.existsSync(dest) && fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dest);
      // Ensure the copied dylib is writable (some system dylibs are read-only)
      fs.chmodSync(dest, 0o755);
      console.log(`  afterPack: bundled dylib ${basename}`);
    }
  }

  // Rewrite load paths in all .node and .dylib files
  const allBinaries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".node") || f.endsWith(".dylib"))
    .map((f) => path.join(dir, f));

  for (const binary of allBinaries) {
    const deps = getOtoolDeps(binary);
    for (const dep of deps) {
      const basename = path.basename(dep);
      // Rewrite non-system deps that exist in our dir and aren't already @loader_path
      if (
        fs.existsSync(path.join(dir, basename)) &&
        !dep.startsWith("@loader_path") &&
        !dep.startsWith("/usr/lib/") &&
        !dep.startsWith("/System/")
      ) {
        execFileSync("install_name_tool", [
          "-change",
          dep,
          `@loader_path/${basename}`,
          binary,
        ]);
        console.log(
          `  afterPack: rewrite ${path.basename(binary)}: ${basename} → @loader_path`,
        );
      }
    }

    // Fix install names for shared libraries (.dylib and .node are both Mach-O dylibs)
    const bn = path.basename(binary);
    execFileSync("install_name_tool", ["-id", `@loader_path/${bn}`, binary]);
  }

  // Re-sign all modified binaries (install_name_tool invalidates signatures)
  for (const binary of allBinaries) {
    execFileSync("codesign", ["--force", "--sign", "-", binary]);
    console.log(`  afterPack: re-signed ${path.basename(binary)}`);
  }
}

/**
 * Linux: set rpath to $ORIGIN so .node files find .so deps in the same dir.
 */
function patchElfLinux(nodeFile) {
  try {
    execFileSync("patchelf", ["--set-rpath", "$ORIGIN", nodeFile]);
    console.log(`  afterPack: set rpath for ${path.basename(nodeFile)}`);
  } catch (e) {
    console.log(`  afterPack: patchelf not available or failed for ${path.basename(nodeFile)}`);
  }
}

/**
 * Get non-system dylib dependencies from a binary, resolving @rpath entries.
 * Returns absolute paths to dylibs that need bundling.
 */
function getNonSystemDeps(binaryPath) {
  const rpathDirs = getRpaths(binaryPath);
  const binaryDir = path.dirname(binaryPath);

  return getOtoolDeps(binaryPath)
    .filter(
      (dep) =>
        !dep.startsWith("/usr/lib/") &&
        !dep.startsWith("/System/") &&
        !dep.startsWith("@loader_path"),
    )
    .map((dep) => {
      if (dep.startsWith("@rpath/")) {
        const libName = dep.slice("@rpath/".length);
        // Search rpath directories for the library
        for (const rpathDir of rpathDirs) {
          let resolvedDir = rpathDir;
          if (rpathDir.startsWith("@loader_path")) {
            resolvedDir = rpathDir.replace("@loader_path", binaryDir);
          }
          const candidate = path.join(resolvedDir, libName);
          if (fs.existsSync(candidate)) return candidate;
        }
        // Fallback: check common homebrew paths
        for (const prefix of ["/opt/homebrew/lib", "/usr/local/lib"]) {
          const candidate = path.join(prefix, libName);
          if (fs.existsSync(candidate)) return candidate;
        }
        console.log(`  afterPack: WARNING — could not resolve @rpath dep: ${dep}`);
        return null;
      }
      return dep;
    })
    .filter((dep) => dep !== null);
}

/**
 * Get rpath entries from a binary using otool -l.
 */
function getRpaths(binaryPath) {
  try {
    const output = execFileSync("otool", ["-l", binaryPath], { encoding: "utf-8" });
    const rpaths = [];
    const lines = output.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("cmd LC_RPATH")) {
        // The path is typically 2 lines after the cmd line
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const match = lines[j].match(/path\s+(.+?)\s*\(/);
          if (match) {
            rpaths.push(match[1]);
            break;
          }
        }
      }
    }
    return rpaths;
  } catch {
    return [];
  }
}

/**
 * Parse otool -L output to get all dependency paths.
 */
function getOtoolDeps(binaryPath) {
  try {
    const output = execFileSync("otool", ["-L", binaryPath], { encoding: "utf-8" });
    return output
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(" ")[0])
      .filter((dep) => dep && dep.length > 0);
  } catch {
    return [];
  }
}

/**
 * Recursively find files with a given extension.
 */
function findFiles(dir, ext) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}
