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

interface TreeStripData {
  rowPatternIndex: number; // Index in the pattern (1, 2, etc.)
  instanceNumber: number; // Which instance of the pattern (1st, 2nd, etc.)
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
  const [filterType, setFilterType] = createSignal<FilterType>("trees");

  const treeStrips = createMemo(() => {
    if (!props.systemLayout?.treeRowLines || !props.systemDesign?.rows) {
      return [];
    }

    const strips: TreeStripData[] = [];

    // First, generate strip polygons for ALL rows (not just ground cover)
    // This mimics what makeGroundCoverAreas does but for all strips
    const rowPatterns = props.systemDesign.rows;
    // Track instance numbers as we iterate through the generated row lines
    let lastSeenPatternIdx = -1; // 0-based
    let currentInstance = 1;

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

      // Determine instance number and pattern index
      const currentPatternIdx0 = rowLine.systemDesignRowIndex; // 0-based
      if (currentPatternIdx0 < lastSeenPatternIdx) {
        currentInstance++;
      }
      lastSeenPatternIdx = currentPatternIdx0;
      const patternIndex = currentPatternIdx0 + 1; // 1-based row index for display

      const stripData: TreeStripData = {
        rowPatternIndex: patternIndex,
        instanceNumber: currentInstance,
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

    // Sort strips by instance first, then by row within each instance
    strips.sort((a, b) => {
      if (a.instanceNumber !== b.instanceNumber) {
        return a.instanceNumber - b.instanceNumber;
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
      <h3 class="font-semibold mb-3">Strips Export</h3>

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
        <div class="mb-4 flex gap-2">
          <button
            type="button"
            class={`rounded-sm px-3 py-1 text-sm ${
              filterType() === "trees"
                ? "bg-blue-600 dark:bg-blue-500 !text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setFilterType("trees")}
          >
            Strips with trees
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
            Strips without trees
          </button>
          <button
            type="button"
            class={`rounded-sm px-3 py-1 text-sm ${
              filterType() === "both"
                ? "bg-blue-600 dark:bg-blue-500 !text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setFilterType("both")}
          >
            All strips
          </button>
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

          <div class="space-y-3">
            <For each={treeStrips()}>
              {(strip) => (
                <div class="border border-gray-200 dark:border-gray-700 rounded p-3">
                  <div class="font-medium mb-2">
                    Instance {strip.instanceNumber} - Row{" "}
                    {strip.rowPatternIndex}
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

          <div class="mt-4">
            <button
              type="button"
              class="rounded-sm p-2 btn-default text-sm"
              onClick={() => {
                // Export as CSV
                let csv =
                  "Instance,Row,Area (ha),Area (m²),Total Trees,Ground Cover,Tree Species Details\n";
                treeStrips().forEach((strip) => {
                  const speciesDetails = strip.species
                    .map((sp) => `${sp.name}: ${sp.count}`)
                    .join("; ");
                  const groundCover = strip.groundCoverSpecies || "";
                  csv += `${strip.instanceNumber},${strip.rowPatternIndex},${(
                    strip.stripArea / 10000
                  ).toFixed(3)},${strip.stripArea.toFixed(0)},${
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
                link.download = "tree_strips_export.csv";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              <i class="fas fa-download mr-2" />
              Export as CSV
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export { TreeStripsExport };
