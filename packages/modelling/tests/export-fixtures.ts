/**
 * Export test fixtures from the database
 *
 * Run from repo root: pnpm tsx packages/modelling/tests/export-fixtures.ts
 */

import * as fs from "fs";
import mongoose from "mongoose";
import * as path from "path";
import { fileURLToPath } from "url";

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read env file manually
const envPath = path.join(__dirname, "../../backend/.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envLines = envContent.split("\n");
const env: Record<string, string> = {};
for (const line of envLines) {
	const match = line.match(/^([^=]+)=(.*)$/);
	if (match) {
		env[match[1].trim()] = match[2].trim();
	}
}

const FIXTURES_DIR = path.join(__dirname, "fixtures");

interface Fixture {
	name: string;
	projectId: string;
	fieldGeometry: string;
	systemDesign: {
		rows: any[];
		bearing: number;
		margin: number;
		headland: number;
	};
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 50);
}

async function exportFixtures() {
	// Connect to database
	const dbUrl = env.DATABASEURL;
	if (!dbUrl) {
		console.error("DATABASEURL not found in .env");
		process.exit(1);
	}

	console.log("Connecting to database...");
	await mongoose.connect(dbUrl);
	console.log("Connected!");

	// Get the raw collections
	const db = mongoose.connection.db;
	if (!db) {
		console.error("Database not connected");
		process.exit(1);
	}

	// Find projects with both layer and systemdesign
	const projects = await db
		.collection("projects")
		.aggregate([
			{
				$lookup: {
					from: "layers",
					localField: "layer",
					foreignField: "_id",
					as: "layerData",
				},
			},
			{
				$lookup: {
					from: "systemdesigns",
					localField: "systemdesign",
					foreignField: "_id",
					as: "systemdesignData",
				},
			},
			{ $unwind: "$layerData" },
			{
				$unwind: {
					path: "$systemdesignData",
					preserveNullAndEmptyArrays: false,
				},
			},
			{
				$match: {
					"systemdesignData.rows.0": { $exists: true }, // Has at least one row
				},
			},
			// Sort to prioritize diversity: non-zero headland, different bearings, non-zero margin
			{
				$addFields: {
					_diversityScore: {
						$add: [
							{ $cond: [{ $gt: ["$systemdesignData.headland", 0] }, 100, 0] },
							{ $cond: [{ $gt: ["$systemdesignData.margin", 0] }, 10, 0] },
							{ $cond: [{ $ne: ["$systemdesignData.bearing", 0] }, 5, 0] },
							{
								$cond: [
									{ $gt: [{ $size: "$systemdesignData.rows" }, 2] },
									2,
									0,
								],
							},
						],
					},
				},
			},
			{ $sort: { _diversityScore: -1, _id: 1 } },
			{
				$lookup: {
					from: "species",
					localField: "systemdesignData.rows.sequence.species",
					foreignField: "_id",
					as: "speciesData",
				},
			},
			{
				$lookup: {
					from: "species",
					localField: "systemdesignData.rows.groundcover",
					foreignField: "_id",
					as: "groundcoverData",
				},
			},
			{ $limit: 50 }, // Get up to 50 fixtures for diverse coverage
		])
		.toArray();

	console.log(`Found ${projects.length} projects with layer and systemdesign`);

	// Track used slugs to avoid duplicates
	const usedSlugs = new Set<string>();

	for (const project of projects) {
		try {
			// Parse geometry
			let geometry = project.layerData.geometry;
			if (typeof geometry === "string") {
				geometry = geometry.replace(/&#34;/g, '"');
			}

			// Validate geometry
			let parsed;
			try {
				parsed = typeof geometry === "string" ? JSON.parse(geometry) : geometry;
				if (!parsed?.geometry?.coordinates && !parsed?.coordinates) {
					console.log(
						`  - Skipping ${project.name}: invalid geometry structure`,
					);
					continue;
				}
			} catch {
				console.log(`  - Skipping ${project.name}: failed to parse geometry`);
				continue;
			}

			// Build species lookup
			const speciesMap = new Map();
			for (const species of project.speciesData || []) {
				speciesMap.set(species._id.toString(), {
					_id: species._id.toString(),
					nameCommon: species.nameCommon || species.name_common || "Unknown",
					genus: species.genus,
					species: species.species,
				});
			}
			for (const species of project.groundcoverData || []) {
				speciesMap.set(species._id.toString(), {
					_id: species._id.toString(),
					nameCommon: species.nameCommon || species.name_common || "Unknown",
					genus: species.genus,
					species: species.species,
				});
			}

			// Process rows with species data
			const rows = (project.systemdesignData.rows || []).map((row: any) => ({
				sequence: (row.sequence || []).map((seq: any) => ({
					species: speciesMap.get(seq.species?.toString()) || {
						_id: seq.species?.toString() || "unknown",
					},
					spacingAfter: seq.spacingAfter || 0,
				})),
				groundcover: row.groundcover
					? speciesMap.get(row.groundcover.toString())
					: undefined,
				width: row.width || 0,
				offset: row.offset,
			}));

			// Skip if no valid rows with spacing
			const hasValidRows = rows.some(
				(r: any) =>
					r.sequence.some((s: any) => s.spacingAfter > 0) && r.width > 0,
			);
			if (!hasValidRows) {
				console.log(`  - Skipping ${project.name}: no valid rows with spacing`);
				continue;
			}

			const fixture: Fixture = {
				name: project.name || `project-${project._id}`,
				projectId: project._id.toString(),
				fieldGeometry:
					typeof geometry === "string" ? geometry : JSON.stringify(geometry),
				systemDesign: {
					rows,
					bearing: project.systemdesignData.bearing || 0,
					margin: project.systemdesignData.margin || 0,
					headland: project.systemdesignData.headland || 0,
				},
			};

			// Create unique slug
			let slug = slugify(fixture.name);
			let counter = 1;
			while (usedSlugs.has(slug)) {
				slug = `${slugify(fixture.name)}-${counter}`;
				counter++;
			}
			usedSlugs.add(slug);

			// Create fixture directory
			const fixtureDir = path.join(FIXTURES_DIR, slug);
			if (!fs.existsSync(fixtureDir)) {
				fs.mkdirSync(fixtureDir, { recursive: true });
			}

			// Write input.json
			const inputPath = path.join(fixtureDir, "input.json");
			fs.writeFileSync(inputPath, JSON.stringify(fixture, null, 2));

			console.log(
				`  + ${slug}/ (${rows.length} rows, bearing=${fixture.systemDesign.bearing})`,
			);
		} catch (err) {
			console.error(`  - Error processing project ${project._id}:`, err);
		}
	}

	await mongoose.disconnect();
	console.log("\nDone!");
}

exportFixtures().catch(console.error);
