import {
	lineIntersect,
	bearing,
	lineString,
	helpers as turf,
	lineOffset,
} from "@turf/turf";

function sortCoordsAlongSide(
	side: turf.Feature<turf.LineString, turf.Properties>,
	coords: number[][],
) {
	const [start, end] = side.geometry.coordinates;
	const [startX, startY] = start;
	const [endX, endY] = end;
	const [dx, dy] = [endX - startX, endY - startY];
	const coordsWithDistances = coords.map((coord) => {
		const [x, y] = coord;
		const distance = (x - startX) * dy - (y - startY) * dx;
		return { coord, distance };
	});
	const sortedCoords = coordsWithDistances
		.sort((a, b) => a.distance - b.distance)
		.map((item) => item.coord);
	return sortedCoords;
}

function extendSideToIntersectOuterPolygon(
	side: turf.Feature<turf.LineString, turf.Properties>,
	outerPolygonSides: turf.Feature<turf.LineString, turf.Properties>[],
) {
	const extendedSide = lineOffset(side, 1000, { units: "meters" });
	const intersectionPoints = outerPolygonSides
		.map((outerSide) => lineIntersect(extendedSide, outerSide))
		.filter((result) => result.features.length > 0);
	if (intersectionPoints.length > 0) {
		const intersectionCoords = intersectionPoints.map(
			(result) => result.features[0].geometry.coordinates,
		);
		const sortedCoords = sortCoordsAlongSide(side, intersectionCoords);
		const extendedSideCoords = [
			sortedCoords[0],
			sortedCoords[sortedCoords.length - 1],
		];
		const extendedSideFeature = turf.lineString(
			extendedSideCoords,
			side.properties,
		);
		return extendedSideFeature;
	}
	return side;
}

export function extendInnerPolygonToOuterPolygon(
	innerPolygon: turf.Feature<turf.Polygon, turf.Properties>,
	outerPolygon: turf.Feature<turf.Polygon, turf.Properties>,
	lineBearing: number,
	_bearingThreshold = 2,
) {
	const innerPolygonCoords = innerPolygon.geometry.coordinates[0];
	const innerPolygonSides = innerPolygonCoords.map((coord, i) =>
		lineString([
			coord,
			innerPolygonCoords[(i + 1) % innerPolygonCoords.length],
		]),
	);
	const outerPolygonCoords = outerPolygon.geometry.coordinates[0];
	const outerPolygonSides = outerPolygonCoords.map((coord, i) =>
		lineString([
			coord,
			outerPolygonCoords[(i + 1) % outerPolygonCoords.length],
		]),
	);
	const extendedInnerPolygonSides = innerPolygonSides.map((side) => {
		const sideBearing = bearing(
			side.geometry.coordinates[0],
			side.geometry.coordinates[1],
		);
		if (Math.abs(sideBearing - lineBearing) > _bearingThreshold) {
			const extendedSide = extendSideToIntersectOuterPolygon(
				side,
				outerPolygonSides,
			);
			return extendedSide;
		}
		return side;
	});
	const extendedInnerPolygonCoords = extendedInnerPolygonSides
		.flatMap((side) => side.geometry.coordinates)
	const extendedInnerPolygon = turf.polygon(
		[extendedInnerPolygonCoords],
		innerPolygon.properties,
	);
	return extendedInnerPolygon;
}
