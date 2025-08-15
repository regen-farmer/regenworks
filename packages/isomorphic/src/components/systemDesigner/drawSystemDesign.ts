import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { featureCollection, point as turfPoint, helpers as turf, centroid, midpoint } from "@turf/turf";
import type { Map as MLMap } from "maplibre-gl";

function drawSystemDesign(map: MLMap, systemLayout: ISystemBasedLayout, show3D?: boolean) {
	console.log("Draw layers! show3D:", show3D);

	// In 3D mode, hide all 2D layers for photorealistic view
	if (show3D) {
		console.log("3D mode active - hiding all 2D layers for photorealistic view");
		
		// List of all 2D layers to hide
		const layersToHide = [
			"strips", "strips-border", "strips-points",
			"headland-sides", "margin-polygon", "headland-polygon",
			"bearing-sides", "headland-intersection-points",
			"treeRowLines", "trees", "row-labels"
		];
		
		// Remove all 2D layers
		for (const layerId of layersToHide) {
			if (map.getLayer(layerId)) {
				map.removeLayer(layerId);
			}
			if (map.getSource(layerId)) {
				map.removeSource(layerId);
			}
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

	const treeRowLines = featureCollection(
		systemLayout.treeRowLines?.map((tree) => tree.line),
	);
	const groundCoverAreas = turf.featureCollection(
		systemLayout.groundCoverAreas,
	);
	const headlandSides = turf.featureCollection(systemLayout.headlandSides);
	const headlandPolygon = systemLayout.headlandPolygon;
	const marginPolygon = systemLayout.marginPolygon;
	const sidesCloseToBearing = turf.featureCollection(
		systemLayout.sidesCloseToBearing,
	);
	const intersectionPoints = turf.featureCollection(
		systemLayout.intersectionPoints,
	);

	const treeMarkerArray = systemLayout.treeMarkerArray;

	const treeCircles = featureCollection(
		treeMarkerArray?.map((tree) => tree.circle),
	);

	console.log("speciesCountArray", systemLayout.speciesCountArray);

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
		if (map.getSource("strips")) {
			map.removeLayer("strips");
			map.removeSource("strips");
		}

		map.addLayer({
			id: "strips",
			type: "fill",
			//@ts-ignore
			source: {
				type: "geojson",
				data: groundCoverAreas,
			},
			layout: {},
			paint: {
				"fill-color": "#002eff",
				"fill-opacity": 0.5,
			},
		});

		if (map.getSource("strips-border")) {
			map.removeLayer("strips-border");
			map.removeSource("strips-border");
		}

		map.addLayer({
			id: "strips-border",
			type: "line",
			//@ts-ignore
			source: {
				type: "geojson",
				data: groundCoverAreas,
			},
			layout: {},
			paint: {
				"line-color": "rgba(255,255,255,1)",
				"line-width": 1,
			},
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

		console.log(intersectionPoints);
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
		if (map.getSource("trees")) {
			map.removeLayer("trees");
			map.removeSource("trees");
		}

		map.addLayer({
			id: "trees",
			type: "fill",
			//@ts-ignore
			source: {
				type: "geojson",
				data: treeCircles,
			},
			layout: {},
			paint: {
				"fill-color": "#7eff36",
				"fill-opacity": 0.8,
				"fill-outline-color": "#F0F8FF",
			},
		});
	}

	// Add row labels in 2D mode
	console.log("Adding row labels - show3D:", show3D, "treeRowsVisible:", treeRowsVisible, "treeRowLines:", systemLayout.treeRowLines);
	
	if (treeRowsVisible && systemLayout.treeRowLines && systemLayout.treeRowLines.length > 0) {
		// Create label features for each row line
		const rowLabels: any[] = [];
		const instanceCountByPattern = new Map<number, number>();
		let lastSeenPatternIndex = -1;
		let currentInstance = 1;

		console.log("Processing", systemLayout.treeRowLines.length, "tree row lines");

		systemLayout.treeRowLines.forEach((rowLine: any, index: number) => {
			const patternIndex = rowLine.systemDesignRowIndex;
			
			// Track instance numbers
			if (patternIndex < lastSeenPatternIndex) {
				currentInstance++;
			}
			lastSeenPatternIndex = patternIndex;

			console.log("Row line", index, "- Pattern:", patternIndex, "Instance:", currentInstance, "Line:", rowLine.line);

			// Get the midpoint of the line for label placement
			if (rowLine.line && rowLine.line.geometry && rowLine.line.geometry.coordinates && rowLine.line.geometry.coordinates.length > 0) {
				const coords = rowLine.line.geometry.coordinates;
				const midIndex = Math.floor(coords.length / 2);
				const labelPoint = turfPoint(coords[midIndex], {
					label: `${currentInstance}-${patternIndex + 1}`, // Instance-Row format
					instance: currentInstance,
					row: patternIndex + 1
				});
				rowLabels.push(labelPoint);
				console.log("Added label at:", coords[midIndex], "Label:", `${currentInstance}-${patternIndex + 1}`);
			} else {
				console.log("No valid coordinates for row line", index);
			}
		});

		console.log("Total labels created:", rowLabels.length);

		const labelCollection = featureCollection(rowLabels);
		console.log("Label collection:", labelCollection);

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
			data: labelCollection
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
				"text-allow-overlap": true,  // Changed to true to ensure labels show
				"symbol-placement": "point"
			},
			paint: {
				"text-color": "#FFFFFF",  // White text
				"text-halo-color": "#000000",
				"text-halo-width": 2,
				"text-halo-blur": 0.5
			}
		});
		
		console.log("Row labels layer added successfully");
	}
}

export { drawSystemDesign };
