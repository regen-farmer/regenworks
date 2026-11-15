// migration: dry-run-by-default
// One-off: move old cultivar fields into the plant catalogue (Nov 2026).
//
// Before, a cultivar (Variety) stored its rootstock as a name + species and a
// hybrid as a single extra species. Now rootstocks have their own entries and
// hybrids are hybrid groups (species entries with parents).
//
// What this does:
//  - For each distinct (owner, rootstock name) on old cultivars, creates a
//    private Rootstock for that owner, unless one with the same name exists.
//  - Lists cultivars with the old `hybrid` field so the Grove team can put
//    them in the right hybrid group by hand (the old field can't say which).
//  - Changes nothing else. Old fields stay for reference.
//
// Dry run by default. To write:
//   DATABASEURL=... node packages/db/migrations/plant-catalogue-2026-11.ts --apply
import mongoose from "mongoose";
import Variety from "../schemas/variety.ts";
import Rootstock from "../schemas/rootstock.ts";
import "../schemas/species.ts";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASEURL;
if (!url) {
	console.error("Set DATABASEURL");
	process.exit(1);
}

await mongoose.connect(url);
try {
	const varieties = await Variety.find({}).populate("species hybrid").lean();
	console.log(`${varieties.length} cultivars`);

	const wanted = new Map<string, { owner: any; name: string; species: any }>();
	for (const v of varieties as any[]) {
		const name = v.rootstock?.name?.trim();
		if (!name || !v.owner?.id) continue;
		const key = `${v.owner.id}|${name.toLowerCase()}`;
		if (!wanted.has(key)) wanted.set(key, { owner: v.owner.id, name, species: v.rootstock.species });
	}

	let created = 0;
	for (const r of wanted.values()) {
		const exists = await Rootstock.exists({
			"owner.id": r.owner,
			name: new RegExp(`^${r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
		});
		if (exists) continue;
		console.log(`${apply ? "create" : "would create"} rootstock "${r.name}" for owner ${r.owner}`);
		if (apply) {
			await Rootstock.create({ name: r.name, species: r.species ?? undefined, shared: false, owner: { id: r.owner } });
		}
		created++;
	}
	console.log(`${created} rootstocks ${apply ? "created" : "to create"}`);

	const hybrids = (varieties as any[]).filter((v) => v.hybrid);
	if (hybrids.length) {
		console.log("\nCultivars with the old hybrid field (assign a hybrid group by hand):");
		for (const v of hybrids) {
			console.log(
				`  ${v.name}: ${v.species?.genus ?? "?"} ${v.species?.species ?? "?"} × ${v.hybrid?.genus ?? "?"} ${v.hybrid?.species ?? "?"}`,
			);
		}
	}
	if (!apply) console.log("\nDry run. Add --apply to write.");
} finally {
	await mongoose.disconnect();
}
