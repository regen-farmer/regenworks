import type { APIEvent } from "@solidjs/start/server";

export async function GET({ params }: APIEvent) {
	const { target, arch, current_version } = params;

	// TODO: Look up the latest version from your database or storage
	// based on the target (e.g., windows, darwin, linux) and arch (e.g., x86_64, aarch64)
	
	console.log(`Checking for update: ${target}-${arch} v${current_version}`);



	// To use a public GitHub repository (like regenworks-distribution) for hosting updates:
	// 1. Fetch the latest release from the GitHub API
	// const githubRes = await fetch('https://api.github.com/repos/regen-farmer/regenworks-distribution/releases/latest');
	// const release = await githubRes.json();
	// const latestVersion = release.tag_name.replace('v', '');
	
	// 2. Compare latestVersion with current_version. If it's the same or older, return 204.
	// if (latestVersion === current_version) {
	//    return new Response(null, { status: 204 });
	// }
	
	// 3. Find the asset and signature for the specific target and arch
	// const assetName = `RegenWorks_${latestVersion}_${target}_${arch}.zip`; // or .tar.gz based on platform
	// const assetUrl = release.assets.find(a => a.name === assetName)?.browser_download_url;
	// const sigUrl = release.assets.find(a => a.name === `${assetName}.sig`)?.browser_download_url;
	// const signature = await (await fetch(sigUrl)).text();

	// If an update IS available, return a 200 OK JSON response with the update semantics:
	return new Response(JSON.stringify({
		version: "0.2.0", // Change this to latestVersion when wiring it up
		notes: "Bug fixes and performance improvements", // Can use release.body
		pub_date: new Date().toISOString(), // Can use release.published_at
		platforms: {
			[`${target}-${arch}`]: {
				signature: "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDAzMUE4NjQxRjAzMkJBQzIKUldUQ3VqTHdRWVlhQTJzQWIzKzE4bnFabXFheGpQMzdKSTdFZjJEWE5KaDdWbG9yUkwxY3VwMmkK", // Provide the fetched signature content here
				url: `http://localhost:3088/RegenWorks_0.2.0.zip` // Provide the actual assetUrl here
			}
		}
	}), {
		headers: { "Content-Type": "application/json" }
	});
}
