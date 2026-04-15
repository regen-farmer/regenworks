import type { IControl } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
// @ts-ignore
import geojsonArea from "@mapbox/geojson-area";

// Custom styles for MapLibre GL compatibility
// Fixes line-dasharray literal array issues
const maplibreCompatibleStyles = [
  // Polygon fill styles
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-color": "#3bb2d0",
      "fill-outline-color": "#3bb2d0",
      "fill-opacity": 0.1,
    },
  },
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#fbb03b",
      "fill-outline-color": "#fbb03b",
      "fill-opacity": 0.1,
    },
  },
  // Polygon outline styles
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#3bb2d0",
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 2,
    },
  },
  // Line styles (for drawing mid-progress)
  {
    id: "gl-draw-line-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#3bb2d0",
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-active",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["==", "active", "true"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-width": 2,
    },
  },
  // Point styles (vertices)
  {
    id: "gl-draw-polygon-and-line-vertex-stroke-inactive",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-inactive",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  // Midpoint styles
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  // Active points
  {
    id: "gl-draw-point-point-stroke-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 5,
      "circle-opacity": 1,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-point-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 3,
      "circle-color": "#3bb2d0",
    },
  },
  {
    id: "gl-draw-point-stroke-active",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "active", "true"], ["!=", "meta", "midpoint"]],
    paint: {
      "circle-radius": 7,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-point-active",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["!=", "meta", "midpoint"], ["==", "active", "true"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fbb03b",
    },
  },
];

export function useDrawControl(map: maplibregl.Map) {
  const Draw = new MapboxDraw({
    controls: {
      point: false,
      line_string: false,
      polygon: false,
      trash: false,
      combine_features: false,
      uncombine_features: false,
    },
    displayControlsDefault: false,
    defaultMode: "draw_polygon",
    // @ts-ignore - Use custom styles compatible with MapLibre
    styles: maplibreCompatibleStyles,
  });

  document.addEventListener("keyup", (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return; // Skip if the event target is an input or textarea
    }

    if ((event.key === "Delete" || event.key === "Backspace") && Draw) {
      try {
        //@ts-ignore
        const selectedFeatures = Draw.getSelectedIds();

        console.log("HERE", selectedFeatures?.length, selectedFeatures);
        if (selectedFeatures?.length > 0) {
          //@ts-ignore
          Draw.trash();
          //@ts-ignore
          if (Draw.getMode() === "simple_select") {
            //@ts-ignore
            Draw.changeMode("draw_polygon");
          }
        }
      } catch (error) {
        console.error("Error accessing selected features:", error);
      }
    } else {
      ("Oh...");
    }
  });

  map.addControl(Draw as unknown as IControl, "top-right");
  const mapboxglControlGroup = document.getElementsByClassName("mapboxgl-ctrl-group");

  for (let i = 0; i < mapboxglControlGroup.length; i++) {
    const element = mapboxglControlGroup[i];
    element.className = "maplibregl-ctrl maplibregl-ctrl-group";
  }
  map.on("draw.create", updateAreaEvent);
  map.on("draw.delete", updateAreaEvent);
  map.on("draw.update", updateAreaEvent);
  return Draw;
}

function updateAreaEvent(e: any) {
  updateArea(e.features[0]);
}

export function updateArea(shape: any) {
  console.log("UpdateArea");
  const shape_for_db = JSON.stringify(shape);
  console.log("ML shape", shape);

  const shapeArea = geojsonArea.geometry(shape.geometry);
  console.log("ML area", shapeArea);

  // // document.getElementById("coordinates").innerHTML = "A layer geometry has successfully been created and you may click the button below to create the new layer";
  // @ts-ignore
  document.getElementById("geometry").value = shape_for_db;

  // // Send area to document input
  // @ts-ignore
  document.getElementById("layersize").value = shapeArea;
}
