import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { featureCollection, point as turfPoint, helpers as turf, centroid, midpoint } from "@turf/turf";
import { toRepetitionLetter } from "~/util/repetition";
import type { Map as MLMap } from "maplibre-gl";
import { getSpeciesColor, getSpeciesColorWithAlpha } from "~/util/speciesColors";

function drawSystemDesign(map: MLMap, systemLayout: ISystemBasedLayout, show3D?: boolean) {
	console.log("Draw layers! show3D:", show3D);

	// In 3D mode, hide all 2D layers for photorealistic view
	if (show3D) {
		console.log("3D mode active - hiding all 2D layers for photorealistic view");
		
		// List of static layers to hide
		const staticLayersToHide = [
			"strips-points",
			"headland-sides", "margin-polygon", "headland-polygon",
			"bearing-sides", "headland-intersection-points",
			"treeRowLines", "row-labels"
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
				if (layer.id.startsWith('trees-') || 
				    layer.id.startsWith('strips-') || 
				    layer.id.startsWith('strips-border-')) {
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

	const treeRowLines = featureCollection(
		systemLayout.treeRowLines?.map((tree: any) => tree.line),
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

	// Group trees by species for color coding
	const treesBySpecies = new Map<string, any[]>();
	treeMarkerArray?.forEach((tree: any) => {
		const speciesId = tree.species?._id || tree.species || 'unknown';
		if (!treesBySpecies.has(speciesId)) {
			treesBySpecies.set(speciesId, []);
		}
		treesBySpecies.get(speciesId)!.push(tree);
	});

	console.log("speciesCountArray", systemLayout.speciesCountArray);
	console.log("treesBySpecies", treesBySpecies);

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
			const speciesId = area.properties?.speciesId || 'unknown';
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
		// Remove all existing tree layers
		treesBySpecies.forEach((trees, speciesId) => {
			const layerId = `trees-${speciesId}`;
			if (map.getLayer(layerId)) {
				map.removeLayer(layerId);
			}
			if (map.getSource(layerId)) {
				map.removeSource(layerId);
			}
		});
		
		// Also remove the old generic trees layer if it exists
		if (map.getSource("trees")) {
			map.removeLayer("trees");
			map.removeSource("trees");
		}

		// Create a layer for each species with unique color
		treesBySpecies.forEach((trees, speciesId) => {
			const treeCircles = featureCollection(
				trees.map((tree) => tree.circle)
			);
			
			const layerId = `trees-${speciesId}`;
			const color = getSpeciesColor(speciesId);
			
			map.addLayer({
				id: layerId,
				type: "fill",
				//@ts-ignore
				source: {
					type: "geojson",
					data: treeCircles,
				},
				layout: {},
				paint: {
					"fill-color": color,
					"fill-opacity": 0.8,
					"fill-outline-color": "#FFFFFF",
				},
			});
		});
	}

	// Add row labels in 2D mode
	console.log("Adding row labels - show3D:", show3D, "treeRowsVisible:", treeRowsVisible, "treeRowLines:", systemLayout.treeRowLines);
	
	if (treeRowsVisible && systemLayout.treeRowLines && systemLayout.treeRowLines.length > 0) {
		// Create label features for each row line
		const rowLabels: any[] = [];
		let lastSeenPatternIndex = -1;
		let currentRepetition = 1; // 1-based; will convert to letters using toRepetitionLetter

		console.log("Processing", systemLayout.treeRowLines.length, "tree row lines");

		systemLayout.treeRowLines.forEach((rowLine: any, index: number) => {
			const patternIndex = rowLine.systemDesignRowIndex;
			
			// Track repetition transitions (pattern index wraps)
			if (patternIndex < lastSeenPatternIndex) {
				currentRepetition++;
			}
			lastSeenPatternIndex = patternIndex;

			const repLetter = toRepetitionLetter(currentRepetition);
			console.log("Row line", index, "- Pattern:", patternIndex, "Repetition:", repLetter, "Line:", rowLine.line);

			// Get the midpoint of the line for label placement
			if (rowLine.line && rowLine.line.geometry && rowLine.line.geometry.coordinates && rowLine.line.geometry.coordinates.length > 0) {
				const coords = rowLine.line.geometry.coordinates;
				const midIndex = Math.floor(coords.length / 2);
				const labelPoint = turfPoint(coords[midIndex], {
					label: `${repLetter}-${patternIndex + 1}`, // RepetitionLetter-RowNumber
					repetition: repLetter,
					row: patternIndex + 1
				});
				rowLabels.push(labelPoint);
				console.log("Added label at:", coords[midIndex], "Label:", `${repLetter}-${patternIndex + 1}`);
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
