/**
 * electron-builder beforePack hook.
 *
 * pnpm workspace packages are symlinked into node_modules.
 * electron-builder's asar packer follows symlinks to real paths and then
 * rejects files that resolve outside the package directory.
 *
 * This script replaces workspace symlinks with real copies of only the
 * files needed at runtime (JS + native .node binaries).
 */
const fs = require("fs");
const path = require("path");

module.exports = async function beforePack(context) {
  const appDir = context.packager.projectDir;
  const nmDir = path.join(appDir, "node_modules");

  // Find all @rw/* symlinks in node_modules and replace with real copies
  const rwDir = path.join(nmDir, "@rw");
  if (!fs.existsSync(rwDir)) return;

  for (const entry of fs.readdirSync(rwDir)) {
    const linkPath = path.join(rwDir, entry);
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) continue;

    const realPath = fs.realpathSync(linkPath);
    console.log(`  beforePack: replacing symlink ${entry} → real copy`);

    // Remove symlink
    fs.unlinkSync(linkPath);

    // Create directory and copy only runtime files
    fs.mkdirSync(linkPath, { recursive: true });

    // Copy package.json
    const pkgJson = path.join(realPath, "package.json");
    if (fs.existsSync(pkgJson)) {
      fs.copyFileSync(pkgJson, path.join(linkPath, "package.json"));
    }

    // Copy JS files in root
    for (const file of fs.readdirSync(realPath)) {
      const src = path.join(realPath, file);
      if (fs.statSync(src).isFile() && (file.endsWith(".js") || file.endsWith(".node"))) {
        fs.copyFileSync(src, path.join(linkPath, file));
      }
    }
  }
};
