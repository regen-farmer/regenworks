import { type Component, For, createMemo, createSignal } from "solid-js";
import { 
  area as turfArea, 
  length as turfLength,
  buffer,
  mask,
  intersect,
  helpers as turf
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

type FilterType = 'trees' | 'groundcover' | 'both';

const TreeStripsExport: Component<{
  systemLayout: ISystemBasedLayout;
  systemDesign: any;
  species: any;
}> = (props) => {
  const [filterType, setFilterType] = createSignal<FilterType>('trees');
  
  const treeStrips = createMemo(() => {
    if (!props.systemLayout?.treeRowLines || !props.systemDesign?.rows) {
      return [];
    }

    const strips: TreeStripData[] = [];
    
    // First, generate strip polygons for ALL rows (not just ground cover)
    // This mimics what makeGroundCoverAreas does but for all strips
    const allStripPolygons: any[] = [];
    let accumulatingWidth = 0;
    const rowPatterns = props.systemDesign.rows;
    let currentRowIdx = 0;
    
    // Generate polygons for each strip based on the row pattern
    for (let i = 0; i < props.systemLayout.treeRowLines.length; i++) {
      const rowLine = props.systemLayout.treeRowLines[i];
      const rowDesign = rowPatterns[rowLine.systemDesignRowIndex];
      
      if (rowDesign && rowDesign.width > 0) {
        // Create the strip polygon using the same logic as makeGroundCoverAreas
        let stripPolygon = null;
        
        try {
          // Buffer the line to create the strip polygon
          const bufferPolygon = buffer(rowLine.line, rowDesign.width / 2, { units: "meters" });
          
          // Intersect with headland polygon if it exists
          if (props.systemLayout.headlandPolygon && bufferPolygon) {
            const intersected = intersect({
              type: "FeatureCollection",
              features: [props.systemLayout.headlandPolygon, bufferPolygon]
            });
            stripPolygon = intersected;
          } else {
            stripPolygon = bufferPolygon;
          }
        } catch (error) {
          console.warn("Failed to generate strip polygon:", error);
        }
        
        allStripPolygons[i] = stripPolygon;
      } else {
        allStripPolygons[i] = null;
      }
    }
    
    // Track the current pattern instance (which repetition of the full pattern we're in)
    let currentPatternInstance = 1;
    let lastSeenPatternIndex = -1;
    let sequentialIndex = 0;
    
    // Process each tree row line individually in the order they appear
    props.systemLayout.treeRowLines.forEach((rowLine: any, index: number) => {
      const rowPatternIndex = rowLine.systemDesignRowIndex;
      const rowDesign = props.systemDesign.rows[rowPatternIndex];
      if (!rowDesign || !rowLine.line) return;
      
      // Check what type of row this is
      const hasTreeSequence = rowDesign.sequence && rowDesign.sequence.length > 0 && 
        rowDesign.sequence.some((seq: any) => seq.species && seq.spacingAfter > 0);
      const hasGroundCover = rowDesign.groundcover;
      
      // Apply filter based on user selection
      if (filterType() === 'trees' && !hasTreeSequence) {
        return;
      }
      if (filterType() === 'groundcover' && hasTreeSequence) {
        // "Strips without trees" should exclude any strip that has trees
        return;
      }
      // 'both' shows everything

      // Check if we've cycled back to a lower pattern index (new instance of the pattern)
      if (rowPatternIndex < lastSeenPatternIndex) {
        currentPatternInstance++;
      }
      lastSeenPatternIndex = rowPatternIndex;
      
      sequentialIndex++;

      // Calculate strip length for this specific row line
      const stripLength = turfLength(rowLine.line, { units: "meters" });
      
      // Calculate the actual area using the pre-generated polygon
      let stripArea = 0;
      const stripWidth = rowDesign.width || 0;
      
      // Use the pre-generated polygon for this strip
      const stripPolygon = allStripPolygons[index];
      if (stripPolygon) {
        try {
          stripArea = turfArea(stripPolygon);
        } catch (error) {
          console.error("Failed to calculate area from polygon:", error);
          // Skip this strip if we can't calculate its area properly
          return;
        }
      } else if (stripWidth === 0) {
        // Zero-width strips have zero area
        stripArea = 0;
      } else {
        // If we couldn't generate a polygon for a strip with width > 0, 
        // something is wrong - skip this strip
        console.error(`Failed to generate polygon for strip at index ${index}`);
        return;
      }

      // Count trees for this specific row line
      const speciesCounts = new Map<string, number>();
      let totalTreeCount = 0;

      // Calculate trees based on the row sequence and spacing
      if (rowDesign.sequence && rowDesign.sequence.length > 0 && stripLength > 0) {
        // Apply offsets if they exist
        let effectiveLength = stripLength;
        if (rowDesign.offset) {
          effectiveLength -= (rowDesign.offset.before || 0) + (rowDesign.offset.after || 0);
        }
        
        if (effectiveLength > 0) {
          // Calculate trees for this segment based on the sequence pattern
          let distance = 0;
          let seqIndex = 0;
          
          while (distance < effectiveLength) {
            const seq = rowDesign.sequence[seqIndex];
            const speciesId = seq.species?.id || seq.species;
            
            if (speciesId) {
              speciesCounts.set(speciesId, (speciesCounts.get(speciesId) || 0) + 1);
              totalTreeCount++;
            }
            
            distance += seq.spacingAfter;
            seqIndex = (seqIndex + 1) % rowDesign.sequence.length;
          }
        }
      }

      // Convert species counts to array with names
      const speciesArray: { name: string; count: number }[] = [];
      speciesCounts.forEach((count, speciesId) => {
        const species = props.species?.speciesById?.get(speciesId);
        if (species) {
          speciesArray.push({
            name: species.nameCommon || species.nameScientific || "Unknown",
            count: count
          });
        }
      });
      
      // Get ground cover species name if exists
      let groundCoverSpeciesName = undefined;
      if (hasGroundCover) {
        const groundCoverId = rowDesign.groundcover?._id || rowDesign.groundcover;
        const groundCoverSpecies = props.species?.speciesById?.get(groundCoverId);
        if (groundCoverSpecies) {
          groundCoverSpeciesName = groundCoverSpecies.nameCommon || groundCoverSpecies.nameScientific || "Unknown";
        }
      }

      strips.push({
        rowPatternIndex: rowPatternIndex + 1, // 1-indexed for display
        instanceNumber: currentPatternInstance,
        sequentialIndex: sequentialIndex,
        treeCount: totalTreeCount,
        stripArea: stripArea,
        species: speciesArray,
        hasGroundCover: hasGroundCover,
        groundCoverSpecies: groundCoverSpeciesName
      });
    });

    // Already in geographic order from the treeRowLines array
    // No need to sort since we want to preserve the field order
    return strips;
  });

  const totalArea = createMemo(() => {
    const strips = treeStrips() || [];
    return strips.reduce((sum, strip) => sum + strip.stripArea, 0);
  });

  const totalTrees = createMemo(() => {
    const strips = treeStrips() || [];
    return strips.reduce((sum, strip) => sum + strip.treeCount, 0);
  });
  
  return (
    <div class="tree-strips-export">
      <h3 class="font-semibold mb-3">Strips Export</h3>
      
      {/* Filter controls */}
      <div class="mb-4 flex gap-2">
        <button
          type="button"
          class={`rounded-sm px-3 py-1 text-sm ${
            filterType() === 'trees' 
              ? 'bg-blue-600 dark:bg-blue-500 !text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
          onClick={() => setFilterType('trees')}
        >
          Strips with trees
        </button>
        <button
          type="button"
          class={`rounded-sm px-3 py-1 text-sm ${
            filterType() === 'groundcover' 
              ? 'bg-blue-600 dark:bg-blue-500 !text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
          onClick={() => setFilterType('groundcover')}
        >
          Strips without trees
        </button>
        <button
          type="button"
          class={`rounded-sm px-3 py-1 text-sm ${
            filterType() === 'both' 
              ? 'bg-blue-600 dark:bg-blue-500 !text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
          onClick={() => setFilterType('both')}
        >
          All strips
        </button>
      </div>
      
      {treeStrips().length > 0 ? (
        <>
          <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <div>Total strips: {treeStrips().length}</div>
              <div>Total area: {(totalArea() / 10000).toFixed(2)} ha</div>
              {filterType() !== 'groundcover' && <div>Total trees: {totalTrees()}</div>}
            </div>
          </div>

          <div class="space-y-3">
            <For each={treeStrips()}>
              {(strip) => (
                <div class="border border-gray-200 dark:border-gray-700 rounded p-3">
                  <div class="font-medium mb-2">
                    Instance {strip.instanceNumber} - Row {strip.rowPatternIndex}
                  </div>
                  <div class="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                    <div>Area: {(strip.stripArea / 10000).toFixed(3)} ha ({strip.stripArea.toFixed(0)} m²)</div>
                    {strip.treeCount > 0 && <div>Trees: {strip.treeCount}</div>}
                    {strip.groundCoverSpecies && (
                      <div>Ground cover: {strip.groundCoverSpecies}</div>
                    )}
                    {strip.species.length > 0 && (
                      <div class="mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
                        <For each={strip.species}>
                          {(sp) => (
                            <div class="text-xs">{sp.name}: {sp.count} trees</div>
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
                let csv = "Instance,Row,Area (ha),Area (m²),Total Trees,Ground Cover,Tree Species Details\n";
                treeStrips().forEach(strip => {
                  const speciesDetails = strip.species.map(sp => `${sp.name}: ${sp.count}`).join("; ");
                  const groundCover = strip.groundCoverSpecies || "";
                  csv += `${strip.instanceNumber},${strip.rowPatternIndex},${(strip.stripArea / 10000).toFixed(3)},${strip.stripArea.toFixed(0)},${strip.treeCount},"${groundCover}","${speciesDetails}"\n`;
                });
                
                // Add summary row
                csv += `\nTotal,,${(totalArea() / 10000).toFixed(2)},${totalArea().toFixed(0)},${totalTrees()},,\n`;
                
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "strips_export.csv";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export as CSV
            </button>
          </div>
        </>
      ) : (
        <div class="text-gray-500 dark:text-gray-400 text-sm">
          No strips data available for the selected filter. Please ensure your design includes {filterType() === 'trees' ? 'tree rows' : filterType() === 'groundcover' ? 'ground cover' : 'rows'}.
        </div>
      )}
    </div>
  );
};

export { TreeStripsExport };