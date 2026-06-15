import type { ISystemBasedLayout } from "@rw/modelling/layout-turf-js/types/system-based-layout.ts";
import {
  featureCollection,
  point as turfPoint,
  helpers as turf,
  centroid,
  midpoint,
} from "@turf/turf";
import { toRepetitionLetter } from "~/util/repetition";
import type { Map as MLMap } from "maplibre-gl";
import { getSpeciesColor, getSpeciesColorWithAlpha } from "~/util/speciesColors";

function drawSystemDesign(map: MLMap, systemLayout: ISystemBasedLayout, show3D?: boolean) {
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
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(layerId)) {
        map.removeSource(layerId);
      }
    }

    // Remove all dynamic species-based layers
    // Get all layers and filter for our dynamic ones
    const style = map.getStyle();
    if (style && style.layers) {
      style.layers.forEach((layer: any) => {
        if (
          layer.id.startsWith("trees-") ||
          layer.id.startsWith("strips-") ||
          layer.id.startsWith("strips-border-")
        ) {
          if (map.getLayer(layer.id)) {
            map.removeLayer(layer.id);
          }
          if (map.getSource(layer.id)) {
            map.removeSource(layer.id);
          }
        }
      });
    }

    return; // Exit early - only 3D models should be visible
  }

  // 2D mode - draw all the layers
  const debug = true;

  const stripsVisible = true;
  // const fieldPolygonVisible = true;

  const headlandBuffersVisible = false;
  const headlandIntersectionPointsVisible = false;
  const bearingSidesVisible = false;
  const treesVisible = true;
  const showHeadlandPolygonPoints = false;
  const treeRowsVisible = true;

  const treeRowLines = featureCollection(systemLayout.treeRowLines?.map((tree: any) => tree.line));
  const groundCoverAreas = turf.featureCollection(systemLayout.groundCoverAreas);
  const headlandSides = turf.featureCollection(systemLayout.headlandSides);
  const headlandPolygon = systemLayout.headlandPolygon;
  const marginPolygon = systemLayout.marginPolygon;
  const sidesCloseToBearing = turf.featureCollection(systemLayout.sidesCloseToBearing);
  const intersectionPoints = turf.featureCollection(systemLayout.intersectionPoints);

  const treeMarkerArray = systemLayout.treeMarkerArray;

  // Group trees by species for color coding
  // Only include trees that have a species selected
  const treesBySpecies = new Map<string, any[]>();
  treeMarkerArray?.forEach((tree: any) => {
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

  // console.log("treeMarkerArray", treeMarkerArray);

  // var treeRowArray = layoutData()?.treeRowArray

  // if (map.getSource('alleys')) {
  //   map.removeLayer('alleys')
  //   map.removeSource('alleys')
  // }

  // map.addLayer({
  //   id: 'alleys',
  //   type: 'fill',
  //   //@ts-ignore
  //   source: {
  //     type: 'geojson',
  //     data: alleys,
  //   },
  //   layout: {},
  //   paint: {
  //     'fill-color': '#1EBEC8',
  //     'fill-opacity': 0.6,
  //     'fill-outline-color': '#F0F8FF',
  //   },
  // })

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
    if (map.getSource("strips")) {
      map.removeLayer("strips");
      map.removeSource("strips");
    }
    if (map.getSource("strips-border")) {
      map.removeLayer("strips-border");
      map.removeSource("strips-border");
    }

    // Remove all existing ground cover layers
    groundCoverBySpecies.forEach((areas, speciesId) => {
      const layerId = `strips-${speciesId}`;
      const borderLayerId = `strips-border-${speciesId}`;
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(layerId)) {
        map.removeSource(layerId);
      }
      if (map.getLayer(borderLayerId)) {
        map.removeLayer(borderLayerId);
      }
      if (map.getSource(borderLayerId)) {
        map.removeSource(borderLayerId);
      }
    });

    // Create layers for each ground cover species with unique colors
    groundCoverBySpecies.forEach((areas, speciesId) => {
      const groundCoverCollection = turf.featureCollection(areas);
      const layerId = `strips-${speciesId}`;
      const borderLayerId = `strips-border-${speciesId}`;
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
      if (map.getSource("strips-points")) {
        map.removeLayer("strips-points");
        map.removeSource("strips-points");
      }

      map.addLayer({
        id: "strips-points",
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
    if (map.getSource("headland-sides")) {
      map.removeLayer("headland-sides");
      map.removeSource("headland-sides");
    }
    map.addLayer({
      id: "headland-sides",
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
    if (map.getSource("margin-polygon")) {
      map.removeLayer("margin-polygon");
      map.removeSource("margin-polygon");
    }
    map.addLayer({
      id: "margin-polygon",
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

  if (map.getSource("headland-polygon")) {
    map.removeLayer("headland-polygon");
    map.removeSource("headland-polygon");
  }
  map.addLayer({
    id: "headland-polygon",
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
    if (map.getSource("bearing-sides")) {
      map.removeLayer("bearing-sides");
      map.removeSource("bearing-sides");
    }
    map.addLayer({
      id: "bearing-sides",
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
    if (map.getSource("headland-intersection-points")) {
      map.removeLayer("headland-intersection-points");
      map.removeSource("headland-intersection-points");
    }

    map.addLayer({
      id: "headland-intersection-points",
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
    if (map.getSource("treeRowLines")) {
      map.removeLayer("treeRowLines");
      map.removeSource("treeRowLines");
    }

    map.addLayer({
      id: "treeRowLines",
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
    // Remove all existing tree layers (per-species and generic)
    const style = map.getStyle();
    if (style?.layers) {
      style.layers.forEach((layer: any) => {
        if (layer.id.startsWith("trees-")) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
          if (map.getSource(layer.id)) map.removeSource(layer.id);
        }
      });
    }
    if (map.getLayer("trees")) map.removeLayer("trees");
    if (map.getSource("trees")) map.removeSource("trees");

    // Collect all tree center points with speciesId as a property.
    // Using a single source + circle layer instead of per-species fill polygon layers:
    // - Much smaller GeoJSON (points vs 12-vertex polygon circles)
    // - MapLibre GPU-native circle rendering is significantly faster
    const allTreePoints =
      treeMarkerArray
        ?.filter((tree: any) => tree.species?._id || tree.species)
        .map((tree: any) => ({
          ...tree.point,
          properties: {
            ...tree.point?.properties,
            speciesId: tree.species?._id || tree.species,
          },
        })) ?? [];

    // Build a data-driven color match expression
    const colorExpr: any[] = ["match", ["get", "speciesId"]];
    treesBySpecies.forEach((_, speciesId) => {
      colorExpr.push(speciesId, getSpeciesColor(speciesId));
    });
    colorExpr.push("#888888"); // fallback

    map.addSource("trees", {
      type: "geojson",
      //@ts-ignore
      data: featureCollection(allTreePoints),
    });

    map.addLayer({
      id: "trees",
      type: "circle",
      source: "trees",
      paint: {
        //@ts-ignore
        "circle-color": colorExpr,
        "circle-opacity": 0.8,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 1,
        // 1.4m canopy radius in world space.
        // Calibrated for ~45° lat: 0.5px at zoom 14 ≈ 1.7m, doubles every zoom level.
        // circle-pitch-alignment:"map" keeps circles flush with the ground plane.
        "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 14, 0.5, 20, 32],
        "circle-pitch-alignment": "map",
      },
    });
  }

  // Add row labels in 2D mode

  if (treeRowsVisible && systemLayout.treeRowLines && systemLayout.treeRowLines.length > 0) {
    // Create label features for each row line
    const rowLabels: any[] = [];
    let lastSeenPatternIndex = -1;
    let currentRepetition = 1; // 1-based; will convert to letters using toRepetitionLetter

    systemLayout.treeRowLines.forEach((rowLine: any, index: number) => {
      const patternIndex = rowLine.systemDesignRowIndex;

      // Track repetition transitions (pattern index wraps around to 0, or stays the same if there's only 1 row)
      if (patternIndex <= lastSeenPatternIndex && lastSeenPatternIndex !== -1) {
        currentRepetition++;
      }
      lastSeenPatternIndex = patternIndex;

      const repLetter = toRepetitionLetter(currentRepetition);

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
    if (map.getLayer("row-labels")) {
      map.removeLayer("row-labels");
    }
    if (map.getSource("row-labels")) {
      map.removeSource("row-labels");
    }

    // Add the label layer
    map.addSource("row-labels", {
      type: "geojson",
      data: labelCollection,
    });

    // Use simpler text settings for better compatibility
    map.addLayer({
      id: "row-labels",
      type: "symbol",
      source: "row-labels",
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": 14,
        "text-anchor": "center",
        "text-allow-overlap": true, // Changed to true to ensure labels show
        "symbol-placement": "point",
      },
      paint: {
        "text-color": "#FFFFFF", // White text
        "text-halo-color": "#000000",
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    });
  }
}

export { drawSystemDesign };
