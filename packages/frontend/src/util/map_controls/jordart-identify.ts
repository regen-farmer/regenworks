import type maplibregl from "maplibre-gl";
import { getEtrs89BboxFromLngLatBounds, getEtrs89PointFromLngLat } from "./danish-projections";
import {
  JORDART_ETRS89_EXTENT,
  JORDART_TILE_INFO,
  JORDART_TILE_SIZE_PIXELS,
  JORDART_TILE_URL,
} from "./jordart-protocol";
import { withinDKBBox } from "./within-dk-bbox";

const JORDART_IDENTIFY_URL =
  "https://data.geus.dk/arcgis/rest/services/Denmark/Jordartskort_25000/MapServer/identify";
const JORDART_LEGEND_URL =
  "https://data.geus.dk/arcgis/rest/services/Denmark/Jordartskort_25000/MapServer/legend?f=pjson";

type RGB = [number, number, number];

export type JordartIdentifyResult = {
  code?: string;
  label: string;
  source: "identify" | "tile-color";
  details?: {
    jordart?: string;
    tidsalder?: string;
    sedimentType?: string;
  };
  color?: RGB;
  confidence?: number;
};

type ArcgisIdentifyResponse = {
  results?: {
    layerId?: number;
    layerName?: string;
    attributes?: Record<string, string | number | null | undefined>;
  }[];
};

type LegendItem = {
  label: string;
  imageData: string;
  contentType: string;
  color: RGB;
};

let legendItemsPromise: Promise<LegendItem[]> | undefined;

function pointWithinJordartExtent(point: number[]) {
  return (
    point[0] >= JORDART_ETRS89_EXTENT.xmin &&
    point[0] <= JORDART_ETRS89_EXTENT.xmax &&
    point[1] >= JORDART_ETRS89_EXTENT.ymin &&
    point[1] <= JORDART_ETRS89_EXTENT.ymax
  );
}

const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });

function getDominantColor(img: HTMLImageElement): RGB {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return [0, 0, 0];
  }

  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, { count: number; rgb: RGB }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < 64) {
      continue;
    }

    const rgb: RGB = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = rgb.map((value) => Math.round(value / 8)).join(",");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      buckets.set(key, { count: 1, rgb });
    }
  }

  return [...buckets.values()].sort((a, b) => b.count - a.count)[0]?.rgb ?? [0, 0, 0];
}

async function getLegendItems() {
  if (!legendItemsPromise) {
    legendItemsPromise = fetch(JORDART_LEGEND_URL)
      .then((response) => response.json())
      .then(async (data) => {
        const layer = data.layers?.find(
          (legendLayer: { layerName?: string }) => legendLayer.layerName === "Jordartskort",
        );
        const entries =
          (layer?.legend as { label: string; imageData: string; contentType: string }[]) ?? [];

        return await Promise.all(
          entries.map(async (entry) => {
            const img = await loadImg(`data:${entry.contentType};base64,${entry.imageData}`);
            return {
              label: entry.label,
              imageData: entry.imageData,
              contentType: entry.contentType,
              color: getDominantColor(img),
            };
          }),
        );
      });
  }

  return legendItemsPromise;
}

function colorDistance(a: RGB, b: RGB) {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
}

function findClosestLegendItem(color: RGB, legendItems: LegendItem[]) {
  return legendItems
    .map((item) => ({ item, distance: colorDistance(color, item.color) }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function getSampleColor(ctx: CanvasRenderingContext2D, x: number, y: number): RGB {
  const sampleRadius = 2;
  const imageData = ctx.getImageData(
    Math.max(0, x - sampleRadius),
    Math.max(0, y - sampleRadius),
    Math.min(JORDART_TILE_SIZE_PIXELS - x + sampleRadius, sampleRadius * 2 + 1),
    Math.min(JORDART_TILE_SIZE_PIXELS - y + sampleRadius, sampleRadius * 2 + 1),
  ).data;
  const colors = new Map<string, { count: number; rgb: RGB }>();

  for (let i = 0; i < imageData.length; i += 4) {
    const alpha = imageData[i + 3];
    if (alpha < 64) {
      continue;
    }

    const rgb: RGB = [imageData[i], imageData[i + 1], imageData[i + 2]];
    const key = rgb.map((value) => Math.round(value / 8)).join(",");
    const color = colors.get(key);
    if (color) {
      color.count += 1;
    } else {
      colors.set(key, { count: 1, rgb });
    }
  }

  return [...colors.values()].sort((a, b) => b.count - a.count)[0]?.rgb ?? [0, 0, 0];
}

async function identifyFromArcgis(lng: number, lat: number, map: maplibregl.Map) {
  const point = getEtrs89PointFromLngLat(lng, lat);
  if (!pointWithinJordartExtent(point)) {
    return undefined;
  }

  const bounds = map.getBounds();
  const mapExtent = getEtrs89BboxFromLngLatBounds(
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  );
  const searchParams = new URLSearchParams({
    f: "json",
    geometry: point.join(","),
    geometryType: "esriGeometryPoint",
    sr: "25832",
    mapExtent: mapExtent.join(","),
    imageDisplay: `${Math.round(map.getCanvas().clientWidth)},${Math.round(
      map.getCanvas().clientHeight,
    )},96`,
    tolerance: "3",
    layers: "visible:1",
    returnGeometry: "false",
    geometryPrecision: "0",
    maxAllowableOffset: "5",
  });

  const response = await fetch(`${JORDART_IDENTIFY_URL}?${searchParams}`);
  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as ArcgisIdentifyResponse;
  const result = data.results?.find(
    (entry) => entry.layerId === 1 || entry.layerName === "Jordartskort",
  );
  const attributes = result?.attributes;
  if (!attributes) {
    return undefined;
  }

  const code = attributes.jsym1?.toString();
  const jordart = attributes.Jordart?.toString();
  const tidsalder = attributes.Tidsalder?.toString();
  const sedimentType = attributes.Sediment_type?.toString();

  return {
    code,
    label: [code, jordart].filter(Boolean).join(" - "),
    source: "identify" as const,
    details: {
      jordart,
      tidsalder,
      sedimentType,
    },
  };
}

async function identifyFromTileColor(lng: number, lat: number) {
  const point = getEtrs89PointFromLngLat(lng, lat);
  if (!pointWithinJordartExtent(point)) {
    return undefined;
  }

  const lod = JORDART_TILE_INFO.lods[JORDART_TILE_INFO.lods.length - 1];
  const cachedTileSize = lod.resolution * JORDART_TILE_SIZE_PIXELS;
  const col = Math.floor((point[0] - JORDART_TILE_INFO.origin.x) / cachedTileSize);
  const row = Math.floor((JORDART_TILE_INFO.origin.y - point[1]) / cachedTileSize);
  const tileLeft = col * cachedTileSize + JORDART_TILE_INFO.origin.x;
  const tileTop = JORDART_TILE_INFO.origin.y - row * cachedTileSize;
  const pixelX = Math.max(
    0,
    Math.min(
      JORDART_TILE_SIZE_PIXELS - 1,
      Math.floor(((point[0] - tileLeft) / cachedTileSize) * JORDART_TILE_SIZE_PIXELS),
    ),
  );
  const pixelY = Math.max(
    0,
    Math.min(
      JORDART_TILE_SIZE_PIXELS - 1,
      Math.floor(((tileTop - point[1]) / cachedTileSize) * JORDART_TILE_SIZE_PIXELS),
    ),
  );

  const img = await loadImg(`${JORDART_TILE_URL}/${lod.level}/${row}/${col}`);
  const canvas = document.createElement("canvas");
  canvas.width = JORDART_TILE_SIZE_PIXELS;
  canvas.height = JORDART_TILE_SIZE_PIXELS;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return undefined;
  }

  ctx.drawImage(img, 0, 0, JORDART_TILE_SIZE_PIXELS, JORDART_TILE_SIZE_PIXELS);
  const color = getSampleColor(ctx, pixelX, pixelY);
  const closest = findClosestLegendItem(color, await getLegendItems());

  if (!closest || closest.distance > 80) {
    return undefined;
  }

  const [code, ...labelParts] = closest.item.label.split(" - ");
  return {
    code,
    label: closest.item.label,
    source: "tile-color" as const,
    details: {
      jordart: labelParts.join(" - ") || undefined,
    },
    color,
    confidence: Math.max(0, Math.round(100 - closest.distance)),
  };
}

export async function identifyJordartAtPoint(
  lng: number,
  lat: number,
  map: maplibregl.Map,
): Promise<JordartIdentifyResult | undefined> {
  if (!withinDKBBox(lng, lat)) {
    return undefined;
  }

  return (await identifyFromArcgis(lng, lat, map)) ?? (await identifyFromTileColor(lng, lat));
}
