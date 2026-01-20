/**
 * Visual comparison of TypeScript vs Rust layout implementations
 *
 * Generates SVG images for both implementations in each fixture folder.
 *
 * Run with: pnpm tsx packages/modelling/gis-rs/tests/visual-compare.ts [fixture-name]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { systemBasedLayout } from "../../gis/system_based_layout.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Rust server URL
const RUST_SERVER_URL = "http://localhost:3002";

interface LayoutResult {
	headlandPolygon: any;
	marginPolygon: any;
	treeRowLines: any[];
	groundCoverAreas: any[];
	treeMarkerArray: any[];
	stripPolygons?: any[];
}

// Color palette for visualization
const COLORS = {
	field: "#e8f5e9",
	fieldStroke: "#2e7d32",
	margin: "#fff3e0",
	marginStroke: "#ef6c00",
	headland: "#e3f2fd",
	headlandStroke: "#1565c0",
	treeRow: "#4caf50",
	groundCover: "#81c784",
	tree: "#1b5e20",
	strip: ["#ffcdd2", "#f8bbd9", "#e1bee7", "#d1c4e9", "#c5cae9", "#bbdefb"],
};

/**
 * Convert GeoJSON coordinates to SVG path
 */
function coordsToPath(
	coords: number[][],
	transform: (p: number[]) => number[],
): string {
	if (!coords || coords.length === 0) return "";
	const points = coords.map(transform);
	return `M ${points.map((p) => `${p[0]},${p[1]}`).join(" L ")} Z`;
}

function lineToPath(
	coords: number[][],
	transform: (p: number[]) => number[],
): string {
	if (!coords || coords.length < 2) return "";
	const points = coords.map(transform);
	return `M ${points.map((p) => `${p[0]},${p[1]}`).join(" L ")}`;
}

/**
 * Create SVG from layout result
 */
function layoutToSvg(
	layout: LayoutResult,
	fieldGeometry: any,
	title: string,
	width = 800,
	height = 600,
): string {
	// Parse field geometry
	let fieldCoords: number[][];
	if (typeof fieldGeometry === "string") {
		const parsed = JSON.parse(fieldGeometry);
		fieldCoords = parsed.geometry?.coordinates?.[0] || parsed.coordinates?.[0];
	} else {
		fieldCoords =
			fieldGeometry.geometry?.coordinates?.[0] ||
			fieldGeometry.coordinates?.[0];
	}

	if (!fieldCoords) {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="50%" y="50%" text-anchor="middle">Invalid geometry</text>
    </svg>`;
	}

	// Calculate bounding box
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const coord of fieldCoords) {
		minX = Math.min(minX, coord[0]);
		minY = Math.min(minY, coord[1]);
		maxX = Math.max(maxX, coord[0]);
		maxY = Math.max(maxY, coord[1]);
	}

	// Add padding
	const padding = 40;
	const geoWidth = maxX - minX;
	const geoHeight = maxY - minY;
	const scale = Math.min(
		(width - 2 * padding) / geoWidth,
		(height - 2 * padding) / geoHeight,
	);

	// Transform function: geo coords to SVG coords
	const transform = (p: number[]): number[] => [
		padding + (p[0] - minX) * scale,
		height - padding - (p[1] - minY) * scale, // Flip Y
	];

	// Start SVG
	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background: white;">
  <title>${title}</title>
  <style>
    .label { font-family: sans-serif; font-size: 12px; }
    .title { font-family: sans-serif; font-size: 16px; font-weight: bold; }
  </style>
  <text x="${width / 2}" y="20" class="title" text-anchor="middle">${title}</text>
`;

	// Draw field outline
	svg += `  <path d="${coordsToPath(fieldCoords, transform)}" fill="${COLORS.field}" stroke="${COLORS.fieldStroke}" stroke-width="2"/>\n`;

	// Draw margin polygon
	if (layout.marginPolygon?.geometry?.coordinates?.[0]) {
		const marginCoords = layout.marginPolygon.geometry.coordinates[0];
		svg += `  <path d="${coordsToPath(marginCoords, transform)}" fill="none" stroke="${COLORS.marginStroke}" stroke-width="1.5" stroke-dasharray="5,3"/>\n`;
	}

	// Draw headland polygon
	if (layout.headlandPolygon?.geometry?.coordinates?.[0]) {
		const headlandCoords = layout.headlandPolygon.geometry.coordinates[0];
		svg += `  <path d="${coordsToPath(headlandCoords, transform)}" fill="${COLORS.headland}" fill-opacity="0.3" stroke="${COLORS.headlandStroke}" stroke-width="1"/>\n`;
	}

	// Draw strip polygons
	if (layout.stripPolygons) {
		layout.stripPolygons.forEach((strip, i) => {
			const coords = strip?.geometry?.coordinates?.[0];
			if (coords) {
				const color = COLORS.strip[i % COLORS.strip.length];
				svg += `  <path d="${coordsToPath(coords, transform)}" fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="0.5"/>\n`;
			}
		});
	}

	// Draw ground cover areas
	if (layout.groundCoverAreas) {
		for (const area of layout.groundCoverAreas) {
			const coords = area?.geometry?.coordinates?.[0];
			if (coords) {
				svg += `  <path d="${coordsToPath(coords, transform)}" fill="${COLORS.groundCover}" fill-opacity="0.5" stroke="${COLORS.groundCover}" stroke-width="0.5"/>\n`;
			}
		}
	}

	// Draw tree row lines
	if (layout.treeRowLines) {
		for (const row of layout.treeRowLines) {
			const coords = row?.line?.geometry?.coordinates;
			if (coords) {
				svg += `  <path d="${lineToPath(coords, transform)}" fill="none" stroke="${COLORS.treeRow}" stroke-width="1.5"/>\n`;
			}
		}
	}

	// Draw tree markers (as small circles)
	if (layout.treeMarkerArray) {
		for (const marker of layout.treeMarkerArray) {
			const coords = marker?.point?.geometry?.coordinates;
			if (coords) {
				const [x, y] = transform(coords);
				svg += `  <circle cx="${x}" cy="${y}" r="2" fill="${COLORS.tree}"/>\n`;
			}
		}
	}

	// Add legend
	svg += `
  <g transform="translate(10, ${height - 100})">
    <rect x="0" y="0" width="150" height="90" fill="white" fill-opacity="0.9" stroke="#ccc"/>
    <text x="5" y="15" class="label">Legend:</text>
    <rect x="5" y="22" width="12" height="12" fill="${COLORS.headland}" stroke="${COLORS.headlandStroke}"/>
    <text x="22" y="32" class="label">Headland</text>
    <line x1="5" y1="45" x2="17" y2="45" stroke="${COLORS.treeRow}" stroke-width="2"/>
    <text x="22" y="48" class="label">Tree rows</text>
    <circle cx="11" cy="60" r="3" fill="${COLORS.tree}"/>
    <text x="22" y="64" class="label">Trees (${layout.treeMarkerArray?.length || 0})</text>
    <rect x="5" y="72" width="12" height="12" fill="${COLORS.groundCover}" fill-opacity="0.5"/>
    <text x="22" y="82" class="label">Ground cover</text>
  </g>
`;

	svg += "</svg>";
	return svg;
}

/**
 * Call Rust server for layout
 */
async function callRustLayout(fixture: any): Promise<LayoutResult | null> {
	try {
		const response = await fetch(`${RUST_SERVER_URL}/layout`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				systemdesign: fixture.systemDesign,
				fieldGeometry: fixture.fieldGeometry,
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			console.error(
				`Rust server error: ${response.status} - ${text.substring(0, 200)}`,
			);
			return null;
		}

		const result = await response.json();
		if (!result.success) {
			console.error(`Rust layout error: ${result.error}`);
			return null;
		}

		return result.data;
	} catch (err) {
		console.error("Failed to call Rust server:", err);
		return null;
	}
}

/**
 * Run TypeScript layout
 */
function runTypeScriptLayout(fixture: any): LayoutResult | null {
	try {
		// Need to transform the systemDesign to match expected format
		const systemDesign = {
			...fixture.systemDesign,
			rows: fixture.systemDesign.rows.map((row: any) => ({
				...row,
				sequence: row.sequence.map((seq: any) => ({
					species: seq.species,
					spacingAfter: seq.spacingAfter,
				})),
			})),
		};

		const result = systemBasedLayout(
			systemDesign as any,
			fixture.fieldGeometry,
		);
		return result as LayoutResult;
	} catch (err) {
		console.error("TypeScript layout error:", err);
		return null;
	}
}

/**
 * Get all fixture directories
 */
function getFixtureDirs(): string[] {
	if (!fs.existsSync(FIXTURES_DIR)) {
		return [];
	}

	return fs
		.readdirSync(FIXTURES_DIR)
		.filter((name) => {
			const dir = path.join(FIXTURES_DIR, name);
			return (
				fs.statSync(dir).isDirectory() &&
				fs.existsSync(path.join(dir, "input.json"))
			);
		})
		.map((name) => path.join(FIXTURES_DIR, name));
}

async function main() {
	// Get fixture name filter from args
	const filterName = process.argv[2];

	// Get all fixture directories
	let fixtureDirs = getFixtureDirs();

	if (fixtureDirs.length === 0) {
		console.error("No fixtures found. Run export-fixtures.ts first.");
		process.exit(1);
	}

	// Filter if name provided
	if (filterName) {
		fixtureDirs = fixtureDirs.filter((dir) =>
			path.basename(dir).toLowerCase().includes(filterName.toLowerCase()),
		);
		if (fixtureDirs.length === 0) {
			console.error(`No fixtures matching "${filterName}"`);
			process.exit(1);
		}
	}

	console.log(`Processing ${fixtureDirs.length} fixture(s)...\n`);

	const results: {
		name: string;
		tsTrees: number;
		rustTrees: number;
		tsTime: number;
		rustTime: number;
	}[] = [];

	for (const fixtureDir of fixtureDirs) {
		const fixtureName = path.basename(fixtureDir);
		console.log(`\n=== ${fixtureName} ===`);

		// Load fixture
		const inputPath = path.join(fixtureDir, "input.json");
		const fixture = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

		// Run TypeScript implementation
		console.log("Running TypeScript layout...");
		const tsStart = Date.now();
		const tsResult = runTypeScriptLayout(fixture);
		const tsTime = Date.now() - tsStart;

		if (tsResult) {
			console.log(
				`  TypeScript: ${tsTime}ms, ${tsResult.treeMarkerArray?.length || 0} trees`,
			);
			const tsSvg = layoutToSvg(
				tsResult,
				fixture.fieldGeometry,
				`${fixture.name} - TypeScript`,
			);
			const tsPath = path.join(fixtureDir, "output-ts.svg");
			fs.writeFileSync(tsPath, tsSvg);
			console.log(`  Saved: ${tsPath}`);
		}

		// Run Rust implementation
		console.log("Running Rust layout...");
		const rustStart = Date.now();
		const rustResult = await callRustLayout(fixture);
		const rustTime = Date.now() - rustStart;

		if (rustResult) {
			console.log(
				`  Rust: ${rustTime}ms, ${rustResult.treeMarkerArray?.length || 0} trees`,
			);
			const rustSvg = layoutToSvg(
				rustResult,
				fixture.fieldGeometry,
				`${fixture.name} - Rust`,
			);
			const rustPath = path.join(fixtureDir, "output-rs.svg");
			fs.writeFileSync(rustPath, rustSvg);
			console.log(`  Saved: ${rustPath}`);
		}

		// Record results
		if (tsResult && rustResult) {
			const tsTrees = tsResult.treeMarkerArray?.length || 0;
			const rustTrees = rustResult.treeMarkerArray?.length || 0;
			results.push({ name: fixtureName, tsTrees, rustTrees, tsTime, rustTime });

			console.log(`\n  Comparison:`);
			console.log(
				`    Trees: TS=${tsTrees}, Rust=${rustTrees}, diff=${Math.abs(tsTrees - rustTrees)}`,
			);
			console.log(
				`    Time: TS=${tsTime}ms, Rust=${rustTime}ms, speedup=${(tsTime / rustTime).toFixed(1)}x`,
			);
		}
	}

	// Print summary
	console.log("\n\n=== SUMMARY ===");
	console.log(
		"Fixture                                          | TS Trees | RS Trees | TS Time | RS Time | Speedup",
	);
	console.log("-".repeat(105));
	for (const r of results) {
		const name = r.name.padEnd(48).substring(0, 48);
		const diff = r.tsTrees === r.rustTrees ? "  " : " *";
		console.log(
			`${name} | ${String(r.tsTrees).padStart(8)} | ${String(r.rustTrees).padStart(8)}${diff}| ${String(r.tsTime + "ms").padStart(7)} | ${String(r.rustTime + "ms").padStart(7)} | ${(r.tsTime / r.rustTime).toFixed(1)}x`,
		);
	}
	console.log("\n* = tree count mismatch");
}

main().catch(console.error);
