import type { ISystemBasedLayout } from "@rw/modelling/gis-ts/types/system-based-layout.ts";
import { featureCollection, point as turfPoint, helpers as turf } from "@turf/turf";
import type { Map as MLMap } from "maplibre-gl";
import { getSpeciesColor, getSpeciesColorWithAlpha } from "~/util/speciesColors";
import { toRepetitionLetter } from "~/util/repetition";

/**
 * Draw system design with a unique prefix for layer IDs to support multiple fields
 * @param map MapLibre GL map instance
 * @param systemLayout System layout data
 * @param show3D Whether to show in 3D mode
 * @param layerPrefix Unique prefix for all layer IDs (e.g., "field-123-")
 */
function drawSystemDesignWithPrefix(
  map: MLMap,
  systemLayout: ISystemBasedLayout,
  show3D: boolean = false,
  layerPrefix: string = "",
) {
  // Helper function to add prefix to layer ID
  const prefixId = (id: string) => `${layerPrefix}${id}`;

  // Helper function to remove layers with prefix
  const removeLayerWithPrefix = (id: string) => {
    const layerId = prefixId(id);
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
    if (map.getSource(layerId)) {
      map.removeSource(layerId);
    }
  };

  // In 3D mode, hide all 2D layers for photorealistic view
  if (show3D) {
    // List of static layers to hide
    const staticLayersToHide = [
      "strips-points",
      "headland-sides",
      "margin-polygon",
      "headland-polygon",
      "bearing-sides",
      "headland-intersection-points",
      "treeRowLines",
      "row-labels",
    ];

    // Remove all static 2D layers
    for (const layerId of staticLayersToHide) {
      removeLayerWithPrefix(layerId);
    }

    // Remove all dynamic species-based layers
    const style = map.getStyle();
    if (style && style.layers) {
      style.layers.forEach((layer: any) => {
        if (layer.id.startsWith(layerPrefix)) {
          if (
            layer.id.includes("trees-") ||
            layer.id.includes("strips-") ||
            layer.id.includes("strips-border-")
          ) {
            if (map.getLayer(layer.id)) {
              map.removeLayer(layer.id);
            }
            if (map.getSource(layer.id)) {
              map.removeSource(layer.id);
            }
          }
        }
      });
    }

    return; // Exit early - only 3D models should be visible
  }

  // 2D mode - draw all the layers
  const debug = false;
  const stripsVisible = true;
  const headlandBuffersVisible = false;
  const headlandIntersectionPointsVisible = false;
  const bearingSidesVisible = false;
  const treesVisible = true;
  const showHeadlandPolygonPoints = false;
  const treeRowsVisible = true;

  const treeRowLines = featureCollection(systemLayout.treeRowLines?.map((tree) => tree.line) || []);
  const groundCoverAreas = turf.featureCollection(systemLayout.groundCoverAreas || []);
  const headlandSides = turf.featureCollection(systemLayout.headlandSides || []);
  const headlandPolygon = systemLayout.headlandPolygon;
  const marginPolygon = systemLayout.marginPolygon;
  const sidesCloseToBearing = turf.featureCollection(systemLayout.sidesCloseToBearing || []);
  const intersectionPoints = turf.featureCollection(systemLayout.intersectionPoints || []);

  const treeMarkerArray = systemLayout.treeMarkerArray;

  // Group trees by species for color coding
  // Only include trees that have a species selected
  const treesBySpecies = new Map<string, any[]>();
  treeMarkerArray?.forEach((tree) => {
    const speciesId = tree.species?._id || tree.species;
    // Skip trees without a species
    if (!speciesId) {
      return;
    }
    if (!treesBySpecies.has(speciesId)) {
      treesBySpecies.set(speciesId, []);
    }
    treesBySpecies.get(speciesId)!.push(tree);
  });

  if (stripsVisible) {
    // Group ground cover areas by species
    const groundCoverBySpecies = new Map<string, any[]>();
    systemLayout.groundCoverAreas?.forEach((area: any) => {
      const speciesId = area.properties?.speciesId || "unknown";
      if (!groundCoverBySpecies.has(speciesId)) {
        groundCoverBySpecies.set(speciesId, []);
      }
      groundCoverBySpecies.get(speciesId)!.push(area);
    });

    // Remove old generic strips layers
    removeLayerWithPrefix("strips");
    removeLayerWithPrefix("strips-border");

    // Remove all existing ground cover layers
    groundCoverBySpecies.forEach((areas, speciesId) => {
      removeLayerWithPrefix(`strips-${speciesId}`);
      removeLayerWithPrefix(`strips-border-${speciesId}`);
    });

    // Create layers for each ground cover species with unique colors
    groundCoverBySpecies.forEach((areas, speciesId) => {
      const groundCoverCollection = turf.featureCollection(areas);
      const layerId = prefixId(`strips-${speciesId}`);
      const borderLayerId = prefixId(`strips-border-${speciesId}`);
      const color = getSpeciesColorWithAlpha(speciesId, 0.5);

      map.addLayer({
        id: layerId,
        type: "fill",
        //@ts-ignore
        source: {
          type: "geojson",
          data: groundCoverCollection,
        },
        layout: {},
        paint: {
          "fill-color": color,
          "fill-opacity": 1, // Alpha is already in the color
        },
      });

      map.addLayer({
        id: borderLayerId,
        type: "line",
        //@ts-ignore
        source: {
          type: "geojson",
          data: groundCoverCollection,
        },
        layout: {},
        paint: {
          "line-color": "rgba(255,255,255,0.8)",
          "line-width": 1,
        },
      });
    });

    if (showHeadlandPolygonPoints) {
      removeLayerWithPrefix("strips-points");

      map.addLayer({
        id: prefixId("strips-points"),
        type: "circle",
        //@ts-ignore
        source: {
          type: "geojson",
          data: headlandPolygon,
        },
        layout: {},
        paint: {
          "circle-color": "rgba(255,255,255,1)",
          "circle-stroke-width": 1,
        },
      });
    }
  }

  if (headlandBuffersVisible) {
    removeLayerWithPrefix("headland-sides");
    map.addLayer({
      id: prefixId("headland-sides"),
      type: "line",
      //@ts-ignore
      source: {
        type: "geojson",
        data: headlandSides,
      },
      layout: {},
      paint: {
        "line-color": "rgba(255,0,0,1)",
        "line-width": 2,
      },
    });
  }

  if (debug) {
    removeLayerWithPrefix("margin-polygon");
    map.addLayer({
      id: prefixId("margin-polygon"),
      type: "line",
      //@ts-ignore
      source: {
        type: "geojson",
        data: marginPolygon,
      },
      layout: {},
      paint: {
        "line-color": "rgba(255,255,255,1)",
        "line-width": 2,
      },
    });
  }

  removeLayerWithPrefix("headland-polygon");
  map.addLayer({
    id: prefixId("headland-polygon"),
    type: "line",
    //@ts-ignore
    source: {
      type: "geojson",
      data: headlandPolygon,
    },
    layout: {},
    paint: {
      "line-color": "rgba(255,255,0,1)",
      "line-width": 2,
    },
  });

  if (bearingSidesVisible) {
    removeLayerWithPrefix("bearing-sides");
    map.addLayer({
      id: prefixId("bearing-sides"),
      type: "line",
      //@ts-ignore
      source: {
        type: "geojson",
        data: sidesCloseToBearing,
      },
      layout: {},
      paint: {
        "line-color": "rgba(255,0,255,1)",
        "line-width": 2,
      },
    });
  }

  if (headlandIntersectionPointsVisible) {
    removeLayerWithPrefix("headland-intersection-points");
    map.addLayer({
      id: prefixId("headland-intersection-points"),
      type: "circle",
      //@ts-ignore
      source: {
        type: "geojson",
        data: intersectionPoints,
      },
      layout: {},
      paint: {
        "circle-color": "rgba(255,255,255,1)",
        "circle-radius": 3,
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(0,0,0,1)",
      },
    });
  }

  if (treeRowsVisible) {
    removeLayerWithPrefix("treeRowLines");

    map.addLayer({
      id: prefixId("treeRowLines"),
      type: "line",
      //@ts-ignore
      source: {
        type: "geojson",
        data: treeRowLines,
      },
      layout: {},
      paint: {
        "line-color": "rgba(255,255,255,0.6)",
        "line-dasharray": [2, 4],
        "line-width": 1,
      },
    });
  }

  if (treesVisible) {
    // Remove all existing tree layers (old per-species fill layers + new unified circle layer)
    const style = map.getStyle();
    if (style?.layers) {
      style.layers.forEach((layer: any) => {
        if (layer.id.startsWith(layerPrefix) && layer.id.includes("trees")) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
          if (map.getSource(layer.id)) map.removeSource(layer.id);
        }
      });
    }
    removeLayerWithPrefix("trees");

    // Collect all tree points with species ID for color coding
    const allTreePoints =
      treeMarkerArray
        ?.filter((tree: any) => tree.species?._id || tree.species)
        .map((tree: any) => ({
          ...tree.point,
          properties: { ...tree.point?.properties, speciesId: tree.species?._id || tree.species },
        })) ?? [];

    // Build a match expression for per-species colors
    const colorExpr: any[] = ["match", ["get", "speciesId"]];
    treesBySpecies.forEach((_, speciesId) => {
      colorExpr.push(speciesId, getSpeciesColor(speciesId));
    });
    colorExpr.push("#888888"); // fallback

    const treesLayerId = prefixId("trees");
    map.addSource(treesLayerId, {
      type: "geojson",
      data: featureCollection(allTreePoints),
    });
    map.addLayer({
      id: treesLayerId,
      type: "circle",
      source: treesLayerId,
      paint: {
        "circle-color": colorExpr as any,
        "circle-opacity": 0.8,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1,
        "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 0.5, 20, 32],
        "circle-pitch-alignment": "map",
      },
    });
  }

  // Add row labels in 2D mode
  if (treeRowsVisible && systemLayout.treeRowLines && systemLayout.treeRowLines.length > 0) {
    // Create label features for each row line
    const rowLabels: any[] = [];
    const instanceCountByPattern = new Map<number, number>();
    let lastSeenPatternIndex = -1;
    let currentInstance = 1;

    systemLayout.treeRowLines.forEach((rowLine: any, index: number) => {
      const patternIndex = rowLine.systemDesignRowIndex;

      // Track instance numbers
      if (patternIndex <= lastSeenPatternIndex && lastSeenPatternIndex !== -1) {
        currentInstance++;
      }
      lastSeenPatternIndex = patternIndex;

      const repLetter = toRepetitionLetter(currentInstance);

      // Get the midpoint of the line for label placement
      if (
        rowLine.line &&
        rowLine.line.geometry &&
        rowLine.line.geometry.coordinates &&
        rowLine.line.geometry.coordinates.length > 0
      ) {
        const coords = rowLine.line.geometry.coordinates;
        const midIndex = Math.floor(coords.length / 2);
        const labelPoint = turfPoint(coords[midIndex], {
          label: `${repLetter}-${patternIndex + 1}`, // RepetitionLetter-RowNumber
          repetition: repLetter,
          row: patternIndex + 1,
        });
        rowLabels.push(labelPoint);
      }
    });

    const labelCollection = featureCollection(rowLabels);

    // Remove existing label layer if it exists
    removeLayerWithPrefix("row-labels");

    // Add the label layer
    map.addSource(prefixId("row-labels"), {
      type: "geojson",
      data: labelCollection,
    });

    // Use simpler text settings for better compatibility
    map.addLayer({
      id: prefixId("row-labels"),
      type: "symbol",
      source: prefixId("row-labels"),
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": 14,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "symbol-placement": "point",
      },
      paint: {
        "text-color": "#FFFFFF",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    });
  }
}

export { drawSystemDesignWithPrefix };
