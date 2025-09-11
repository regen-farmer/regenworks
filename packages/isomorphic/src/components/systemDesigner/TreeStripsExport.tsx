import { type Component, For, createMemo, createSignal, Show } from "solid-js";
import {
  area as turfArea,
  length as turfLength,
  buffer,
  mask,
  intersect,
  helpers as turf,
} from "@turf/turf";
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { toRepetitionLetter } from "~/util/repetition";

interface TreeStripData {
  rowPatternIndex: number; // Index in the pattern (1, 2, etc.)
  repetitionNumber: number; // Which repetition of the full row set (A, B, C ...)
  sequentialIndex: number; // The order this strip appears on the field
  treeCount: number;
  stripArea: number; // in m²
  species: Array<{ name: string; count: number }>;
  hasGroundCover: boolean;
  groundCoverSpecies?: string;
}

type FilterType = "trees" | "groundcover" | "both";

const TreeStripsExport: Component<{
  systemLayout: ISystemBasedLayout;
  systemDesign: any;
  species: any;
  onGeneratePreview?: () => void;
}> = (props) => {
  const [filterType, setFilterType] = createSignal<FilterType>("both");
  // Controls visibility of the (potentially long) detailed rows list
  const [showRowsList, setShowRowsList] = createSignal(false);

  const treeStrips = createMemo(() => {
    if (!props.systemLayout?.treeRowLines || !props.systemDesign?.rows) {
      return [];
    }

    const strips: TreeStripData[] = [];

    // First, generate strip polygons for ALL rows (not just ground cover)
    // This mimics what makeGroundCoverAreas does but for all strips
    const rowPatterns = props.systemDesign.rows;
    // Track repetition numbers as we iterate through the generated row lines
    let lastSeenPatternIdx = -1; // 0-based
    let currentRepetition = 1;

    // Generate polygons for each strip based on the row pattern
    for (let i = 0; i < props.systemLayout.treeRowLines.length; i++) {
      const rowLine = props.systemLayout.treeRowLines[i];
      const rowDesign = rowPatterns[rowLine.systemDesignRowIndex];

      // Calculate strip area - prefer actual polygon if available
      let stripArea = 0;

      // Check if we have strip polygons from makeAllStripPolygons
      const stripPolys = (props.systemLayout as any)?.stripPolygons as
        | any[]
        | undefined;
      if (stripPolys && stripPolys[i]) {
        const polygon = stripPolys[i];
        if (polygon) {
          stripArea = turfArea(polygon);
        }
      }

      // If no polygon available, calculate from dimensions
      if (stripArea === 0 && rowDesign.width) {
        const lineLength = turfLength(rowLine.line, { units: "meters" });
        stripArea = rowDesign.width * lineLength;
      }

      // Don't create strip data if area is 0
      if (stripArea === 0) continue;

      // Calculate tree data for this strip
      const treeSpeciesCount: { [key: string]: number } = {};
      let treesInStrip = 0;

      // Estimate tree counts using row design (reliable and consistent)
      if (rowDesign.sequence && rowDesign.sequence.length > 0) {
        // Calculate based on row design and length
        const lineLength = turfLength(rowLine.line, { units: "meters" });
        let totalSpacing = rowDesign.sequence.reduce(
          (sum: number, item: any) => sum + (item.spacingAfter || 0),
          0
        );

        if (totalSpacing > 0) {
          const estimatedTrees =
            Math.floor(lineLength / totalSpacing) * rowDesign.sequence.length;
          treesInStrip = estimatedTrees;

          // Distribute trees among species in the sequence
          rowDesign.sequence.forEach((item: any) => {
            if (item.species) {
              const speciesId = item.species._id || item.species;
              const species = props.species?.speciesById?.get(speciesId);
              if (species) {
                const speciesName =
                  species.nameCommon || species.species || "Unknown";
                const treesOfThisSpecies = Math.floor(
                  estimatedTrees / rowDesign.sequence.length
                );
                treeSpeciesCount[speciesName] =
                  (treeSpeciesCount[speciesName] || 0) + treesOfThisSpecies;
              }
            }
          });
        }
      }

      // Get ground cover info
      let groundCoverName: string | undefined;
      if (rowDesign.groundcover) {
        const gcId = rowDesign.groundcover._id || rowDesign.groundcover;
        const gcSpecies = props.species?.speciesById?.get(gcId);
        groundCoverName =
          gcSpecies?.nameCommon || gcSpecies?.species || "Unknown ground cover";
      }

      // Determine repetition number and pattern index
      const currentPatternIdx0 = rowLine.systemDesignRowIndex; // 0-based
      if (currentPatternIdx0 < lastSeenPatternIdx) {
        currentRepetition++;
      }
      lastSeenPatternIdx = currentPatternIdx0;
      const patternIndex = currentPatternIdx0 + 1; // 1-based row index for display

      const stripData: TreeStripData = {
        rowPatternIndex: patternIndex,
        repetitionNumber: currentRepetition,
        sequentialIndex: i + 1,
        treeCount: treesInStrip,
        stripArea: stripArea,
        species: Object.entries(treeSpeciesCount).map(([name, count]) => ({
          name,
          count,
        })),
        hasGroundCover: !!groundCoverName,
        groundCoverSpecies: groundCoverName,
      };

      strips.push(stripData);
    }

    // Sort strips by repetition first, then by row within each repetition
    strips.sort((a, b) => {
      if (a.repetitionNumber !== b.repetitionNumber) {
        return a.repetitionNumber - b.repetitionNumber;
      }
      return a.rowPatternIndex - b.rowPatternIndex;
    });

    // Apply filter
    if (filterType() === "trees") {
      return strips.filter((strip) => strip.treeCount > 0);
    } else if (filterType() === "groundcover") {
      return strips.filter((strip) => strip.treeCount === 0);
    }

    return strips; // 'both' - return all strips
  });

  const totalArea = createMemo(() => {
    const strips = treeStrips() || [];
    return strips.reduce((sum, strip) => sum + strip.stripArea, 0);
  });

  const totalTrees = createMemo(() => {
    const strips = treeStrips() || [];
    return strips.reduce((sum, strip) => sum + strip.treeCount, 0);
  });

  // Create a reactive check for whether we have the necessary data
  const hasData = createMemo(() => {
    const hasLayout = !!props.systemLayout;
    const hasDesign = !!props.systemDesign;
    return hasLayout && hasDesign;
  });

  return (
    <div class="tree-strips-export">
      <h3 class="font-semibold mb-3">Export tree strips and cropping areas</h3>

      <Show
        when={hasData()}
        fallback={
          <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded">
            <button
              type="button"
              class="rounded-sm p-2 btn-default w-full"
              onClick={() => props.onGeneratePreview?.()}
              disabled={!props.onGeneratePreview}
            >
              <i class="fas fa-sync-alt mr-2" />
              Generate preview
            </button>
          </div>
        }
      >
        {/* Filter controls */}
        

        <div class="mt-4">
          <button
            type="button"
            class="rounded-sm p-2 mb-4 btn-default text-sm"
            onClick={() => {
              // Export as CSV
              const baseName =
                filterType() === "both"
                  ? "tree_strips_and_cropping_areas"
                  : filterType() === "trees"
                  ? "tree_strips"
                  : "cropping_areas";
              let csv =
                "Repetition,Row,Area (ha),Area (m²),Total Trees,Ground Cover,Tree Species Details\n";
              treeStrips().forEach((strip) => {
                const speciesDetails = strip.species
                  .map((sp) => `${sp.name}: ${sp.count}`)
                  .join("; ");
                const groundCover = strip.groundCoverSpecies || "";
                csv += `${toRepetitionLetter(strip.repetitionNumber)},${
                  strip.rowPatternIndex
                },${(strip.stripArea / 10000).toFixed(
                  3
                )},${strip.stripArea.toFixed(0)},${
                  strip.treeCount
                },"${groundCover}","${speciesDetails}"\n`;
              });

              // Add summary row
              csv += `\nTotal,,${(totalArea() / 10000).toFixed(
                2
              )},${totalArea().toFixed(0)},${totalTrees()},,\n`;

              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${baseName}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <i class="fas fa-download mr-2" />
            Export as CSV
          </button>
          <button
            type="button"
            class="rounded-sm p-2 mb-4 btn-default text-sm ml-2"
            onClick={() => {
              // Build GeoJSON FeatureCollection including strip polygons and tree circles
              const features: any[] = [];
              const layout: any = props.systemLayout as any;
              const stripPolys: any[] | undefined = layout?.stripPolygons;
              const rows: any[] = props.systemDesign?.rows || [];
              const mode = filterType();
              const baseName =
                mode === "both"
                  ? "tree_strips_and_cropping_areas"
                  : mode === "trees"
                  ? "tree_strips"
                  : "cropping_areas";
              // Compute instance numbering from rowIndex sequence if available
              if (stripPolys && stripPolys.length > 0) {
                let lastRowIdx = -1;
                let repetitionNo = 1;
                stripPolys.forEach((poly, idx) => {
                  if (!poly) return;
                  const rowIdx = poly.properties?.rowIndex ?? 0;
                  // Determine whether this strip is a tree strip or groundcover-only
                  const rowDesign = rows[rowIdx];
                  const totalSpacing = Array.isArray(rowDesign?.sequence)
                    ? rowDesign.sequence.reduce(
                        (s: number, it: any) => s + (it?.spacingAfter || 0),
                        0
                      )
                    : 0;
                  const isTreeStrip = totalSpacing > 0;
                  const includeStrip =
                    mode === "both" ||
                    (mode === "trees" && isTreeStrip) ||
                    (mode === "groundcover" && !isTreeStrip);
                  if (!includeStrip) return;
                  if (rowIdx < lastRowIdx) {
                    repetitionNo++;
                  }
                  lastRowIdx = rowIdx;
                  const repetition = toRepetitionLetter(repetitionNo);
                  const fc = {
                    type: "Feature",
                    geometry: poly.geometry,
                    properties: {
                      type: "strip",
                      name: poly.properties?.name ?? `strip_${idx}`,
                      rowIndex: rowIdx,
                      row: rowIdx + 1,
                      repetition,
                    },
                  };
                  features.push(fc);
                });
              }

              // Add tree circles
              if (mode !== "groundcover") {
                const trees: any[] = layout?.treeMarkerArray || [];
                trees.forEach((tree, i) => {
                  if (!tree?.circle) return;
                  features.push({
                    type: "Feature",
                    geometry: tree.circle.geometry,
                    properties: {
                      type: "tree",
                      species: tree.species?._id || tree.species || undefined,
                      name:
                        tree.species?.nameCommon ||
                        tree.species?.species ||
                        undefined,
                    },
                  });
                });
              }

              const geojson = {
                type: "FeatureCollection",
                features,
              };

              const blob = new Blob([JSON.stringify(geojson)], {
                type: "application/geo+json",
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${baseName}.geojson`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <i class="fas fa-download mr-2" />
            Export as GeoJSON
          </button>

          <button
            type="button"
            class="rounded-sm p-2 mb-4 btn-default text-sm ml-2"
            onClick={() => {
              // Build KML from the same data
              const layout: any = props.systemLayout as any;
              const stripPolys: any[] | undefined = layout?.stripPolygons;
              const trees: any[] = layout?.treeMarkerArray || [];
              const rows: any[] = props.systemDesign?.rows || [];
              const mode = filterType();
              const baseName =
                mode === "both"
                  ? "tree_strips_and_cropping_areas"
                  : mode === "trees"
                  ? "tree_strips"
                  : "cropping_areas";

              let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n`;

              // Helper to serialize coordinates
              const serializeCoords = (coords: any) =>
                coords.map((c: any) => c.join(",")).join(" ");

              // Strips
              if (stripPolys && stripPolys.length > 0) {
                let lastRowIdx = -1;
                let repetitionNo = 1;
                stripPolys.forEach((poly, idx) => {
                  if (!poly) return;
                  const rowIdx = poly.properties?.rowIndex ?? 0;
                  const rowDesign = rows[rowIdx];
                  const totalSpacing = Array.isArray(rowDesign?.sequence)
                    ? rowDesign.sequence.reduce(
                        (s: number, it: any) => s + (it?.spacingAfter || 0),
                        0
                      )
                    : 0;
                  const isTreeStrip = totalSpacing > 0;
                  const includeStrip =
                    mode === "both" ||
                    (mode === "trees" && isTreeStrip) ||
                    (mode === "groundcover" && !isTreeStrip);
                  if (!includeStrip) return;
                  if (rowIdx < lastRowIdx) repetitionNo++;
                  lastRowIdx = rowIdx;
                  const name = `Repetition ${toRepetitionLetter(
                    repetitionNo
                  )} - Row ${rowIdx + 1}`;
                  if (poly.geometry.type === "Polygon") {
                    const rings = poly.geometry.coordinates as any[];
                    kml += `<Placemark><name>${name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${serializeCoords(
                      rings[0]
                    )}</coordinates></LinearRing></outerBoundaryIs>`;
                    for (let r = 1; r < rings.length; r++) {
                      kml += `<innerBoundaryIs><LinearRing><coordinates>${serializeCoords(
                        rings[r]
                      )}</coordinates></LinearRing></innerBoundaryIs>`;
                    }
                    kml += `</Polygon></Placemark>\n`;
                  } else if (poly.geometry.type === "MultiPolygon") {
                    const mps = poly.geometry.coordinates as any[][][];
                    mps.forEach((rings) => {
                      kml += `<Placemark><name>${name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${serializeCoords(
                        rings[0]
                      )}</coordinates></LinearRing></outerBoundaryIs>`;
                      for (let r = 1; r < rings.length; r++) {
                        kml += `<innerBoundaryIs><LinearRing><coordinates>${serializeCoords(
                          rings[r]
                        )}</coordinates></LinearRing></innerBoundaryIs>`;
                      }
                      kml += `</Polygon></Placemark>\n`;
                    });
                  }
                });
              }

              // Trees (circles as polygons) only when exporting trees or both
              if (mode !== "groundcover") {
                trees.forEach((tree) => {
                  const poly = tree?.circle?.geometry;
                  if (!poly || poly.type !== "Polygon") return;
                  const rings = poly.coordinates as any[];
                  const name =
                    tree.species?.nameCommon || tree.species?.species || "Tree";
                  kml += `<Placemark><name>${name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${serializeCoords(
                    rings[0]
                  )}</coordinates></LinearRing></outerBoundaryIs>`;
                  for (let r = 1; r < rings.length; r++) {
                    kml += `<innerBoundaryIs><LinearRing><coordinates>${serializeCoords(
                      rings[r]
                    )}</coordinates></LinearRing></innerBoundaryIs>`;
                  }
                  kml += `</Polygon></Placemark>\n`;
                });
              }

              kml += `</Document>\n</kml>`;

              const blob = new Blob([kml], {
                type: "application/vnd.google-earth.kml+xml",
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${baseName}.kml`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <i class="fas fa-download mr-2" />
            Export as KML
          </button>

          <div class="mb-2 flex items-center justify-between">
          <div class="text-sm font-medium text-gray-800 dark:text-gray-100">
            Filter:
          </div>
        </div>
        <div class="mb-4 flex gap-2">
          <button
            type="button"
            class={`rounded-sm px-3 py-1 text-sm ${
              filterType() === "both"
                ? "bg-blue-600 dark:bg-blue-500 !text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setFilterType("both")}
          >
            Select all tree strips and cropping areas.
          </button>
          <button
            type="button"
            class={`rounded-sm px-3 py-1 text-sm ${
              filterType() === "trees"
                ? "bg-blue-600 dark:bg-blue-500 !text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setFilterType("trees")}
          >
            Select tree strips
          </button>
          <button
            type="button"
            class={`rounded-sm px-3 py-1 text-sm ${
              filterType() === "groundcover"
                ? "bg-blue-600 dark:bg-blue-500 !text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setFilterType("groundcover")}
          >
            Select cropping areas
          </button>
        </div>

          
        </div>

        <Show
          when={treeStrips().length > 0}
          fallback={
            <div class="text-gray-500 dark:text-gray-400 text-sm">
              No strips data available for the selected filter. Please ensure
              your design includes{" "}
              {filterType() === "trees"
                ? "tree rows"
                : filterType() === "groundcover"
                ? "ground cover"
                : "rows"}
              .
            </div>
          }
        >
          <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <div>Total strips: {treeStrips().length}</div>
              <div>Total area: {(totalArea() / 10000).toFixed(2)} ha</div>
              {filterType() !== "groundcover" && (
                <div>Total trees: {totalTrees()}</div>
              )}
            </div>
          </div>
          <div class="mb-2">
            <button
              type="button"
              class="rounded-sm px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              onClick={() => setShowRowsList((v) => !v)}
            >
              <i
                class={`fas mr-2 ${showRowsList() ? "fa-minus" : "fa-plus"}`}
              />
              {`Detailed row list (${treeStrips().length})`}
            </button>
          </div>
          <Show when={showRowsList()}>
            <div class="space-y-3">
              <For each={treeStrips()}>
                {(strip) => (
                  <div class="border border-gray-200 dark:border-gray-700 rounded p-3">
                    <div class="font-medium mb-2">
                      <span class="font-mono">Row {toRepetitionLetter(strip.repetitionNumber)}-{strip.rowPatternIndex}</span>
                    </div>
                    <div class="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                      <div>
                        Area: {(strip.stripArea / 10000).toFixed(3)} ha (
                        {strip.stripArea.toFixed(0)} m²)
                      </div>
                      {strip.treeCount > 0 && <div>Trees: {strip.treeCount}</div>}
                      {strip.groundCoverSpecies && (
                        <div>Ground cover: {strip.groundCoverSpecies}</div>
                      )}
                      {strip.species.length > 0 && (
                        <div class="mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
                          <For each={strip.species}>
                            {(sp) => (
                              <div class="text-xs">
                                {sp.name}: {sp.count} trees
                              </div>
                            )}
                          </For>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

export { TreeStripsExport };
