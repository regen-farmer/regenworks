import { getEtrs89BboxFromWebMercatorBbox } from "./danish-projections";

export const JORDART_TILE_URL =
  "https://data.geus.dk/arcgis/rest/services/Denmark/Jordartskort_25000/MapServer/tile";

export const JORDART_TILE_SIZE_PIXELS = 256;

export const JORDART_ETRS89_EXTENT = {
  xmin: 441432.9932000004,
  ymin: 6049752.780200001,
  xmax: 892765.2950999998,
  ymax: 6402142.694599999,
};

export const JORDART_TILE_INFO = {
  origin: {
    x: -5120900,
    y: 9998100,
  },
  lods: [
    { level: 0, resolution: 16933.367200067736 },
    { level: 1, resolution: 8466.683600033868 },
    { level: 2, resolution: 4233.341800016934 },
    { level: 3, resolution: 2116.670900008467 },
    { level: 4, resolution: 1058.3354500042335 },
    { level: 5, resolution: 529.1677250021168 },
    { level: 6, resolution: 264.5838625010584 },
    { level: 7, resolution: 132.2919312505292 },
    { level: 8, resolution: 66.1459656252646 },
    { level: 9, resolution: 33.0729828126323 },
    { level: 10, resolution: 16.53649140631615 },
    { level: 11, resolution: 8.268245703158074 },
    { level: 12, resolution: 4.134122851579037 },
    { level: 13, resolution: 2.0670614257895186 },
    { level: 14, resolution: 1.0335307128947593 },
    { level: 15, resolution: 0.5167653564473796 },
    { level: 16, resolution: 0.2583826782236898 },
  ],
};

const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });

function bboxIntersectsJordartExtent(bbox: number[]) {
  return !(
    bbox[2] < JORDART_ETRS89_EXTENT.xmin ||
    bbox[0] > JORDART_ETRS89_EXTENT.xmax ||
    bbox[3] < JORDART_ETRS89_EXTENT.ymin ||
    bbox[1] > JORDART_ETRS89_EXTENT.ymax
  );
}

async function getTransparentTile() {
  const canvas = document.createElement("canvas");
  canvas.width = JORDART_TILE_SIZE_PIXELS;
  canvas.height = JORDART_TILE_SIZE_PIXELS;

  return await new Promise<ArrayBuffer>((resolve) => {
    canvas.toBlob((blob) => {
      blob!.arrayBuffer().then(resolve);
    }, "image/png");
  });
}

export const jordartProtocol = async (params: { url: string }) => {
  const bboxString = params.url.replace("jordart://", "");
  const tileBboxEtrs89 = getEtrs89BboxFromWebMercatorBbox(bboxString);

  if (!bboxIntersectsJordartExtent(tileBboxEtrs89)) {
    return { data: await getTransparentTile() };
  }

  const tileSizeEtrs89 = {
    width: tileBboxEtrs89[2] - tileBboxEtrs89[0],
    height: tileBboxEtrs89[3] - tileBboxEtrs89[1],
  };

  const lodIndex = JORDART_TILE_INFO.lods.findIndex((lod, index) => {
    const cachedTileSize = lod.resolution * JORDART_TILE_SIZE_PIXELS;
    return (
      Math.max(tileSizeEtrs89.width, tileSizeEtrs89.height) > cachedTileSize / 2 ||
      index === JORDART_TILE_INFO.lods.length - 1
    );
  });
  const lod = JORDART_TILE_INFO.lods[lodIndex];
  const cachedTileSize = lod.resolution * JORDART_TILE_SIZE_PIXELS;

  const xLowerIdx = Math.floor((tileBboxEtrs89[0] - JORDART_TILE_INFO.origin.x) / cachedTileSize);
  const xUpperIdx = Math.floor((tileBboxEtrs89[2] - JORDART_TILE_INFO.origin.x) / cachedTileSize);
  const yLowerIdx = Math.floor((JORDART_TILE_INFO.origin.y - tileBboxEtrs89[3]) / cachedTileSize);
  const yUpperIdx = Math.floor((JORDART_TILE_INFO.origin.y - tileBboxEtrs89[1]) / cachedTileSize);

  const tileIds: { row: number; col: number; z: number }[] = [];
  for (let row = yLowerIdx; row <= yUpperIdx; row++) {
    for (let col = xLowerIdx; col <= xUpperIdx; col++) {
      tileIds.push({ row, col, z: lod.level });
    }
  }

  const tiles = await Promise.all(
    tileIds.map(async ({ row, col, z }) => {
      const tileUrl = `${JORDART_TILE_URL}/${z}/${row}/${col}`;

      try {
        const img = await loadImg(tileUrl);
        return { row, col, z, img };
      } catch {
        return { row, col, z, img: null };
      }
    }),
  );

  const stitchedBboxEtrs89 = [
    xLowerIdx * cachedTileSize + JORDART_TILE_INFO.origin.x,
    JORDART_TILE_INFO.origin.y - (yUpperIdx + 1) * cachedTileSize,
    (xUpperIdx + 1) * cachedTileSize + JORDART_TILE_INFO.origin.x,
    JORDART_TILE_INFO.origin.y - yLowerIdx * cachedTileSize,
  ];

  const stitchedSizeEtrs89 = {
    width: stitchedBboxEtrs89[2] - stitchedBboxEtrs89[0],
    height: stitchedBboxEtrs89[3] - stitchedBboxEtrs89[1],
  };

  const cols = xUpperIdx - xLowerIdx + 1;
  const rows = yUpperIdx - yLowerIdx + 1;

  const stitchedWidthPx = cols * JORDART_TILE_SIZE_PIXELS;
  const stitchedHeightPx = rows * JORDART_TILE_SIZE_PIXELS;

  const canvas = document.createElement("canvas");
  canvas.width = stitchedWidthPx;
  canvas.height = stitchedHeightPx;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    for (const t of tiles) {
      if (t.img) {
        const px = (t.col - xLowerIdx) * JORDART_TILE_SIZE_PIXELS;
        const py = (t.row - yLowerIdx) * JORDART_TILE_SIZE_PIXELS;
        ctx.drawImage(t.img, px, py, JORDART_TILE_SIZE_PIXELS, JORDART_TILE_SIZE_PIXELS);
      }
    }
  }

  const stitchedEdgeToTileEtrs89 = {
    left: tileBboxEtrs89[0] - stitchedBboxEtrs89[0],
    top: stitchedBboxEtrs89[3] - tileBboxEtrs89[3],
  };

  const stitchedEdgeToTilePixels = {
    left: (stitchedEdgeToTileEtrs89.left / stitchedSizeEtrs89.width) * stitchedWidthPx,
    top: (stitchedEdgeToTileEtrs89.top / stitchedSizeEtrs89.height) * stitchedHeightPx,
  };

  const finalTileSizePixels = {
    width: (tileSizeEtrs89.width / stitchedSizeEtrs89.width) * stitchedWidthPx,
    height: (tileSizeEtrs89.height / stitchedSizeEtrs89.height) * stitchedHeightPx,
  };

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = JORDART_TILE_SIZE_PIXELS;
  finalCanvas.height = JORDART_TILE_SIZE_PIXELS;
  const fCtx = finalCanvas.getContext("2d");

  if (fCtx) {
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = "high";

    fCtx.drawImage(
      canvas,
      stitchedEdgeToTilePixels.left,
      stitchedEdgeToTilePixels.top,
      finalTileSizePixels.width,
      finalTileSizePixels.height,
      0,
      0,
      JORDART_TILE_SIZE_PIXELS,
      JORDART_TILE_SIZE_PIXELS,
    );
  }

  const arrayBuffer = await new Promise<ArrayBuffer>((resolve) => {
    finalCanvas.toBlob((blob) => {
      blob!.arrayBuffer().then(resolve);
    }, "image/png");
  });

  return { data: arrayBuffer };
};
