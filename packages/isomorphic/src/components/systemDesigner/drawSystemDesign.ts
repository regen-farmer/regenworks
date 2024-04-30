import { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout";
import { featureCollection } from "@turf/turf";
import {Map as MLMap} from 'maplibre-gl';
import { helpers as turf } from "@turf/turf";

function drawSystemDesign(map: MLMap, systemLayout: ISystemBasedLayout) {
		
	console.log("Draw layers!");

	// const layerNames = ['correctgeometry', 'alleys', 'strips', 'col', 'trees']
	// layerNames.forEach((layerName) => {
	//   map.removeLayer(layerName)
	// })

	// var trees = layoutData()?.trees

	// var alleys = layoutData()?.alleys

	// var strips = layoutData()?.strips

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
	const groundCoverAreas = turf.featureCollection(systemLayout.groundCoverAreas);
	const headlandSides = turf.featureCollection(systemLayout.headlandSides);
	const headlandPolygon = systemLayout.headlandPolygon;
	const marginPolygon = systemLayout.marginPolygon;
	const sidesCloseToBearing = turf.featureCollection(systemLayout.sidesCloseToBearing);
	const intersectionPoints = turf.featureCollection(systemLayout.intersectionPoints);

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
	
}

export {drawSystemDesign}