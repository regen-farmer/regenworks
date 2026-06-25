import proj4 from "proj4";

proj4.defs(
  "EPSG:3857",
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs",
);
proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

export function getEtrs89PointFromLngLat(lng: number, lat: number) {
  return proj4("EPSG:4326", "EPSG:25832", [lng, lat]);
}

export function getEtrs89BboxFromLngLatBounds(
  west: number,
  south: number,
  east: number,
  north: number,
) {
  const southWest = getEtrs89PointFromLngLat(west, south);
  const northEast = getEtrs89PointFromLngLat(east, north);
  const northWest = getEtrs89PointFromLngLat(west, north);
  const southEast = getEtrs89PointFromLngLat(east, south);

  return [
    Math.min(southWest[0], northEast[0], northWest[0], southEast[0]),
    Math.min(southWest[1], northEast[1], northWest[1], southEast[1]),
    Math.max(southWest[0], northEast[0], northWest[0], southEast[0]),
    Math.max(southWest[1], northEast[1], northWest[1], southEast[1]),
  ];
}

export function getEtrs89BboxFromWebMercatorBbox(bboxString: string) {
  const tileBboxWebMercator = bboxString.split(",").map(Number);

  if (tileBboxWebMercator.length !== 4 || tileBboxWebMercator.some(Number.isNaN)) {
    throw new Error(`Invalid Web Mercator bbox: ${bboxString}`);
  }

  const leftBottom = proj4("EPSG:3857", "EPSG:25832", [
    tileBboxWebMercator[0],
    tileBboxWebMercator[1],
  ]);
  const rightTop = proj4("EPSG:3857", "EPSG:25832", [
    tileBboxWebMercator[2],
    tileBboxWebMercator[3],
  ]);
  const leftTop = proj4("EPSG:3857", "EPSG:25832", [
    tileBboxWebMercator[0],
    tileBboxWebMercator[3],
  ]);
  const rightBottom = proj4("EPSG:3857", "EPSG:25832", [
    tileBboxWebMercator[2],
    tileBboxWebMercator[1],
  ]);

  return [
    (leftBottom[0] + leftTop[0]) / 2,
    (leftBottom[1] + rightBottom[1]) / 2,
    (rightBottom[0] + rightTop[0]) / 2,
    (rightTop[1] + leftTop[1]) / 2,
  ];
}
