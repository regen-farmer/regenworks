import type { APIEvent } from "@solidjs/start/server";

// Helper to reliably check if a 'latest' version string is newer than a 'current' one.
// Simplistic semver check. Ignores complex pre-release tag comparisons to let Tauri decide deeply if close.
function isNewer(latest: string, current: string): boolean {
  if (latest === current) return false;
  const l = latest.split(/[.-]/).map((x) => parseInt(x) || 0);
  const c = current.split(/[.-]/).map((x) => parseInt(x) || 0);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return latest !== current;
}

export async function GET({ request, params }: APIEvent) {
  const { target, arch, current_version } = params;
  const url = new URL(request.url);

  // Determine if the client app is reaching us from the Staging server vs Prod
  const isStaging = url.hostname.includes("staging") || url.hostname.includes("localhost");

  console.log(
    `[Updater] Checking for ${isStaging ? "STAGING" : "PROD"} update: ${target}-${arch} v${current_version}`,
  );

  try {
    const GITHUB_REPO = "regen-farmer/regenworks-distribution";
    let release;

    if (isStaging) {
      // In Staging, fetch all releases and pull the very first pre-release
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
        headers: { "User-Agent": "RegenWorks-Updater" },
      });
      if (!res.ok) throw new Error("Failed to fetch staging releases");
      const releases = await res.json();
      const preReleases = releases.filter((r: any) => r.prerelease === true);
      if (preReleases.length === 0) return new Response(null, { status: 204 });
      release = preReleases[0];
    } else {
      // In Production, strict fetch only the latest non-prerelease stable channel
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { "User-Agent": "RegenWorks-Updater" },
      });
      if (!res.ok) throw new Error("Failed to fetch stable release");
      release = await res.json();
    }

    // Strip any preceding 'v' typically seen in github tags
    const latestVersion = release.tag_name.replace(/^v/, "");

    // If strictly up to date or we somehow reverted, signal 204 No Content to Tauri
    if (!isNewer(latestVersion, current_version)) {
      console.log(`[Updater] Up to date (Current: ${current_version} | Remote: ${latestVersion})`);
      return new Response(null, { status: 204 });
    }

    // Identify the right asset file extension for matching Tauri OS build targets
    // darwin -> .app.tar.gz, windows -> .nsis.zip or .msi.zip, linux -> .AppImage.tar.gz
    const targetExts =
      target === "darwin"
        ? [".app.tar.gz", ".tar.gz"]
        : target === "windows"
          ? [".msi.zip", ".nsis.zip", ".zip"]
          : [".AppImage.tar.gz", ".tar.gz"];

    // Map Tauri arch strings to common github compiler action naming
    const archPattern = arch === "x86_64" ? /(x86_64|x64)/ : new RegExp(arch);

    const asset = release.assets.find(
      (a: any) =>
        targetExts.some((ext) => a.name.endsWith(ext)) &&
        archPattern.test(a.name) &&
        !a.name.endsWith(".sig"),
    );

    if (!asset) {
      console.log(
        `[Updater] No compatible asset binary found for ${target}-${arch} on ${latestVersion}`,
      );
      return new Response(null, { status: 204 });
    }

    // Tauri securely generates detached signatures, verify it exists
    const sigAsset = release.assets.find((a: any) => a.name === `${asset.name}.sig`);
    if (!sigAsset) {
      console.log(`[Updater] No signature file found for asset ${asset.name}`);
      return new Response(null, { status: 204 });
    }

    // Fetch the raw signature text key
    const sigRes = await fetch(sigAsset.browser_download_url);
    if (!sigRes.ok) throw new Error("Failed to fetch signature");
    const signature = await sigRes.text();

    console.log(`[Updater] Dispatching update payload for v${latestVersion} to client!`);

    // Kick down the expected response mapping
    return new Response(
      JSON.stringify({
        version: latestVersion,
        notes: release.body || "A new update is available.",
        pub_date: release.published_at,
        platforms: {
          [`${target}-${arch}`]: {
            signature: signature.trim(),
            url: asset.browser_download_url,
          },
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[Updater] Github API fetch failed:", error);
    // Signal clean fallback
    return new Response(null, { status: 204 });
  }
}
