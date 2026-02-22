import type { APIEvent } from "@solidjs/start/server";

export async function GET({ params }: APIEvent) {
	const { target, arch, current_version } = params;

	// TODO: Look up the latest version from your database or storage
	// based on the target (e.g., windows, darwin, linux) and arch (e.g., x86_64, aarch64)
	
	console.log(`Checking for update: ${target}-${arch} v${current_version}`);



	// If an update IS available, return a 200 OK JSON response with the update semantics:
	return new Response(JSON.stringify({
		version: "0.2.0",
		notes: "Bug fixes and performance improvements",
		pub_date: new Date().toISOString(),
		platforms: {
			[`${target}-${arch}`]: {
				signature: "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDAzMUE4NjQxRjAzMkJBQzIKUldUQ3VqTHdRWVlhQTJzQWIzKzE4bnFabXFheGpQMzdKSTdFZjJEWE5KaDdWbG9yUkwxY3VwMmkK",
				url: `http://localhost:3088/RegenWorks_0.2.0.zip`
			}
		}
	}), {
		headers: { "Content-Type": "application/json" }
	});
}
