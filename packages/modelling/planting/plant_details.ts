// Attach the plant (cultivar, rootstock, organic) to every tree in a layout.
//
// Layout engines only need species and spacing, so they don't carry plant
// details. Each tree does record where it came from (systemDesignRowIndex +
// sequenceIndex), and this looks the plant up in the design. Works the same
// for every engine (turf-js, geometry-kernel, geos).

type Id = string;

export type PlantKey = {
  species: Id;
  variety?: Id;
  rootstock?: Id;
  ownRoots?: boolean;
  organic?: boolean;
};

export type PlantCount = PlantKey & { count: number };

const idOf = (v: unknown): Id | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "object") {
    const o = v as { _id?: unknown; id?: unknown };
    if (o._id !== undefined) return String(o._id);
    if (o.id !== undefined) return String(o.id);
  }
  return String(v);
};

/** One stable text key per distinct plant, for grouping and matching to prices. */
export function plantKeyString(p: PlantKey): string {
  return [
    p.species,
    p.variety ?? "-",
    p.rootstock ?? (p.ownRoots ? "own" : "-"),
    p.organic === true ? "org" : p.organic === false ? "conv" : "-",
  ].join("|");
}

/**
 * Adds `variety`, `rootstock`, `ownRoots` and `organic` (ids/flags) to each
 * tree, and `plantCountArray` to the layout. Mutates and returns `layout`.
 *
 * Safety: a tree only gets plant details when its species matches the
 * design entry it points at, so a mismatch (an engine that renumbered the
 * sequence) never labels a tree with the wrong cultivar.
 */
export function attachPlantDetails<L extends { treeMarkerArray?: any[] }>(
  layout: L,
  systemDesign: { rows?: any[] } | null | undefined,
): L & { plantCountArray: PlantCount[] } {
  const rows = systemDesign?.rows ?? [];
  const counts = new Map<string, PlantCount>();

  for (const tree of layout?.treeMarkerArray ?? []) {
    const species = idOf(tree?.species);
    if (!species) continue;
    const entry = rows[tree.systemDesignRowIndex]?.sequence?.[tree.sequenceIndex];
    const key: PlantKey = { species };

    if (entry && idOf(entry.species) === species) {
      const variety = idOf(entry.variety);
      const rootstock = idOf(entry.rootstock);
      if (variety) key.variety = variety;
      if (rootstock) key.rootstock = rootstock;
      else if (entry.ownRoots === true) key.ownRoots = true;
      if (entry.organic === true || entry.organic === false) key.organic = entry.organic;
    }

    tree.variety = key.variety;
    tree.rootstock = key.rootstock;
    tree.ownRoots = key.ownRoots;
    tree.organic = key.organic;

    const k = plantKeyString(key);
    const c = counts.get(k);
    if (c) c.count++;
    else counts.set(k, { ...key, count: 1 });
  }

  const result = layout as L & { plantCountArray: PlantCount[] };
  result.plantCountArray = [...counts.values()];
  return result;
}

/** Cultivar and rootstock names used in a populated design, for exports and the tree register. */
export function plantNamesOf(systemdesign: any) {
  const varieties: Record<string, string> = {};
  const rootstocks: Record<string, string> = {};
  for (const row of systemdesign?.rows ?? []) {
    for (const entry of row?.sequence ?? []) {
      if (entry?.variety?._id) varieties[String(entry.variety._id)] = entry.variety.name;
      if (entry?.rootstock?._id) rootstocks[String(entry.rootstock._id)] = entry.rootstock.name;
    }
  }
  return { varieties, rootstocks };
}
