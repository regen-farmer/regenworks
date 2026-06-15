import initGeosJs from "geos-wasm";
import {
	bbox,
	bboxPolygon,
	bearing,
	buffer,
	centroid,
	length,
	lineIntersect,
	lineString,
	polygon,
	transformRotate,
} from "@turf/turf";

const geos = await initGeosJs();

function polygonToWkt(rings) {
	const ringText = rings
		.map((ring) => `(${ring.map(([x, y]) => `${x} ${y}`).join(", ")})`)
		.join(", ");
	return `POLYGON (${ringText})`;
}

function lineToWkt(coords) {
	return `LINESTRING (${coords.map(([x, y]) => `${x} ${y}`).join(", ")})`;
}

function wktToPolygonCoords(wkt) {
	if (wkt.startsWith("MULTIPOLYGON")) {
		const polygons = [];
		let depth = 0;
		let start = -1;
		for (let i = 0; i < wkt.length; i++) {
			if (wkt[i] === "(") {
				if (depth === 1) {
					start = i;
				}
				depth++;
			} else if (wkt[i] === ")") {
				depth--;
				if (depth === 1 && start >= 0) {
					polygons.push(wktToPolygonCoords(`POLYGON ${wkt.slice(start, i + 1)}`));
					start = -1;
				}
			}
		}
		return polygons.reduce((largest, polygon) => {
			const largestSize = largest[0]?.length ?? 0;
			const polygonSize = polygon[0]?.length ?? 0;
			return polygonSize > largestSize ? polygon : largest;
		}, []);
	}

	if (!wkt.startsWith("POLYGON")) {
		return [];
	}

	const rings = [];
	const content = wkt.slice("POLYGON".length).trim();
	let depth = 0;
	let start = -1;

	for (let i = 0; i < content.length; i++) {
		if (content[i] === "(") {
			depth++;
			if (depth === 2) {
				start = i + 1;
			}
		} else if (content[i] === ")") {
			if (depth === 2 && start >= 0) {
				rings.push(
					content
						.slice(start, i)
						.split(",")
						.map((coord) => coord.trim().split(/\s+/).map(Number)),
				);
				start = -1;
			}
			depth--;
		}
	}

	return rings;
}

function readWkt(wkt) {
	const reader = geos.GEOSWKTReader_create();
	const size = wkt.length + 1;
	const wktPtr = geos.Module._malloc(size);

	try {
		geos.Module.stringToUTF8(wkt, wktPtr, size);
		return geos.GEOSWKTReader_read(reader, wktPtr);
	} finally {
		geos.Module._free(wktPtr);
		geos.GEOSWKTReader_destroy(reader);
	}
}

function writeWkt(geomPtr) {
	const writer = geos.GEOSWKTWriter_create();
	let resultWktPtr = 0;

	try {
		resultWktPtr = geos.GEOSWKTWriter_write(writer, geomPtr);
		return geos.Module.UTF8ToString(resultWktPtr);
	} finally {
		if (resultWktPtr) {
			geos.GEOSFree(resultWktPtr);
		}
		geos.GEOSWKTWriter_destroy(writer);
	}
}

export function bufferPolygonJson(ringsJson, distance, quadSegs = 32) {
	if (!geos) {
		return null;
	}

	const reader = geos.GEOSWKTReader_create();
	let geomPtr = 0;
	let bufferedPtr = 0;
	let writer = 0;
	let resultWktPtr = 0;

	try {
		const wkt = polygonToWkt(JSON.parse(ringsJson));
		const size = wkt.length + 1;
		const wktPtr = geos.Module._malloc(size);
		geos.Module.stringToUTF8(wkt, wktPtr, size);
		geomPtr = geos.GEOSWKTReader_read(reader, wktPtr);
		geos.Module._free(wktPtr);
		if (!geomPtr) {
			return null;
		}

		bufferedPtr = geos.GEOSBuffer(geomPtr, distance, quadSegs);
		if (!bufferedPtr) {
			return null;
		}

		writer = geos.GEOSWKTWriter_create();
		resultWktPtr = geos.GEOSWKTWriter_write(writer, bufferedPtr);
		const resultWkt = geos.Module.UTF8ToString(resultWktPtr);
		const rings = wktToPolygonCoords(resultWkt);
		return rings.length > 0 ? JSON.stringify(rings) : null;
	} finally {
		if (resultWktPtr) {
			geos.GEOSFree(resultWktPtr);
		}
		if (writer) {
			geos.GEOSWKTWriter_destroy(writer);
		}
		if (bufferedPtr) {
			geos.GEOSGeom_destroy(bufferedPtr);
		}
		if (geomPtr) {
			geos.GEOSGeom_destroy(geomPtr);
		}
		geos.GEOSWKTReader_destroy(reader);
	}
}

export function bufferLineJson(coordsJson, distance, quadSegs = 20) {
	if (!geos) {
		return null;
	}

	let geomPtr = 0;
	let bufferedPtr = 0;

	try {
		geomPtr = readWkt(lineToWkt(JSON.parse(coordsJson)));
		if (!geomPtr) {
			return null;
		}

		bufferedPtr = geos.GEOSBuffer(geomPtr, distance, quadSegs);
		if (!bufferedPtr) {
			return null;
		}

		const rings = wktToPolygonCoords(writeWkt(bufferedPtr));
		return rings.length > 0 ? JSON.stringify(rings) : null;
	} finally {
		if (bufferedPtr) {
			geos.GEOSGeom_destroy(bufferedPtr);
		}
		if (geomPtr) {
			geos.GEOSGeom_destroy(geomPtr);
		}
	}
}

export function lineBufferPolygonIntersectionPointsJson(lineJson, distance, polygonJson) {
	const bufferLine = buffer(lineString(JSON.parse(lineJson)), distance, {
		units: "meters",
	});
	const intersections = lineIntersect(bufferLine, polygon(JSON.parse(polygonJson)));
	return JSON.stringify(intersections.features.map((feature) => feature.geometry.coordinates));
}

export function makeInitialLineJson(layoutBearing, polygonJson) {
	const inputBearing = Number.isFinite(layoutBearing) ? layoutBearing : 0;
	const polygonFeature = polygon(JSON.parse(polygonJson));
	const pivotPoint = centroid(polygonFeature);
	const rotatedPolygon = transformRotate(polygonFeature, -inputBearing, {
		pivot: pivotPoint,
	});
	const box = bboxPolygon(bbox(rotatedPolygon));
	const boxCoords = box.geometry.coordinates[0];
	const lengthLine = lineString([boxCoords[2], boxCoords[3]], { name: "line-0" });
	const rotatedLine = lineString([boxCoords[3], boxCoords[4]], { name: "line-1" });
	let lineIntersectingPolygon = transformRotate(rotatedLine, inputBearing, {
		pivot: pivotPoint,
	});

	let lineBearing = bearing(
		lineIntersectingPolygon.geometry.coordinates[0],
		lineIntersectingPolygon.geometry.coordinates[1],
	);
	if (lineBearing < 0) {
		lineBearing += 360;
	}

	if (Math.abs(lineBearing - inputBearing) > 1) {
		lineIntersectingPolygon = transformRotate(lineIntersectingPolygon, 180);
	}

	return JSON.stringify({
		line: lineIntersectingPolygon.geometry.coordinates,
		width: length(lengthLine, { units: "meters" }),
	});
}

export function differenceJson(poly1Json, poly2Json) {
	if (!geos) {
		return null;
	}

	let poly1Ptr = 0;
	let poly2Ptr = 0;
	let differencePtr = 0;

	try {
		poly1Ptr = readWkt(polygonToWkt(JSON.parse(poly1Json)));
		poly2Ptr = readWkt(polygonToWkt(JSON.parse(poly2Json)));

		if (!poly1Ptr || !poly2Ptr) {
			return null;
		}

		differencePtr = geos.GEOSDifference(poly1Ptr, poly2Ptr);
		if (!differencePtr) {
			return null;
		}

		const rings = wktToPolygonCoords(writeWkt(differencePtr));
		return rings.length > 0 ? JSON.stringify(rings) : null;
	} finally {
		if (differencePtr) {
			geos.GEOSGeom_destroy(differencePtr);
		}
		if (poly2Ptr) {
			geos.GEOSGeom_destroy(poly2Ptr);
		}
		if (poly1Ptr) {
			geos.GEOSGeom_destroy(poly1Ptr);
		}
	}
}

export function polygonAreaJson(ringsJson) {
	if (!geos) {
		return null;
	}

	let geomPtr = 0;
	let areaPtr = 0;

	try {
		geomPtr = readWkt(polygonToWkt(JSON.parse(ringsJson)));
		if (!geomPtr) {
			return null;
		}

		areaPtr = geos.Module._malloc(8);
		const ok = geos.GEOSArea(geomPtr, areaPtr);
		if (!ok) {
			return null;
		}

		return geos.Module.getValue(areaPtr, "double");
	} finally {
		if (areaPtr) {
			geos.Module._free(areaPtr);
		}
		if (geomPtr) {
			geos.GEOSGeom_destroy(geomPtr);
		}
	}
}
