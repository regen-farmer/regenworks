import proj4 from "proj4";

proj4.defs(
  "EPSG:3857",
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs"
);
proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

export const bluespotProtocol = async (params: { url: string }) => {
  const bboxString = params.url.replace("bluespot://", "");
  const tile_bbox_wgs84 = bboxString.split(",").map(Number);

  // Translate bounds from Web Mercator to ETRS89
  const left_bottom = proj4("EPSG:3857", "EPSG:25832", [
    tile_bbox_wgs84[0],
    tile_bbox_wgs84[1],
  ]);
  const right_top = proj4("EPSG:3857", "EPSG:25832", [
    tile_bbox_wgs84[2],
    tile_bbox_wgs84[3],
  ]);
  const left_top = proj4("EPSG:3857", "EPSG:25832", [
    tile_bbox_wgs84[0],
    tile_bbox_wgs84[3],
  ]);
  const right_bottom = proj4("EPSG:3857", "EPSG:25832", [
    tile_bbox_wgs84[2],
    tile_bbox_wgs84[1],
  ]);

  const tile_bbox_etrs89 = [
    (left_bottom[0] + left_top[0]) / 2,
    (left_bottom[1] + right_bottom[1]) / 2,
    (right_bottom[0] + right_top[0]) / 2,
    (right_top[1] + left_top[1]) / 2,
  ];

  const tile_size_etrs89 = {
    width: tile_bbox_etrs89[2] - tile_bbox_etrs89[0],
    height: tile_bbox_etrs89[3] - tile_bbox_etrs89[1],
  };

  const meters_per_tile_at_z = [419430.4];
  for (let i = 0; i < 13; i++) {
    meters_per_tile_at_z.push(meters_per_tile_at_z[i] / 2);
  }

  const zoom_level = meters_per_tile_at_z.findIndex((meters, index) => {
    return (
      Math.max(tile_size_etrs89.width, tile_size_etrs89.height) > meters / 2 ||
      index === 9
    );
  });

  const tile_size_to_download = meters_per_tile_at_z[zoom_level];

  // TileMatrix Origin
  const origin_left = 120000;
  const origin_top = 6500000;

  const origin_to_bbox_left = tile_bbox_etrs89[0] - origin_left;
  const origin_to_bbox_right = tile_bbox_etrs89[2] - origin_left;

  const x_lower_idx = Math.floor(origin_to_bbox_left / tile_size_to_download);
  const x_upper_idx = Math.floor(origin_to_bbox_right / tile_size_to_download);

  const origin_to_bbox_top = origin_top - tile_bbox_etrs89[3];
  const origin_to_bbox_bottom = origin_top - tile_bbox_etrs89[1];

  const y_lower_idx = Math.floor(origin_to_bbox_top / tile_size_to_download);
  const y_upper_idx = Math.floor(origin_to_bbox_bottom / tile_size_to_download);

  const tile_ids: { row: number; col: number; z: number }[] = [];
  for (let y = y_lower_idx; y <= y_upper_idx; y++) {
    for (let x = x_lower_idx; x <= x_upper_idx; x++) {
      tile_ids.push({ row: y, col: x, z: zoom_level });
    }
  }

  const loadImg = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });

  const tiles = await Promise.all(
    tile_ids.map(async ({ row, col, z }) => {
      const z_string = `L${z.toString().padStart(2, "0")}`;
      const tile_url = `https://api.dataforsyningen.dk/wmts/dhm_bluespot_ekstremregn?token=f3ecb52320902f733a433aa9945d8dc8&layer=bluespot_ekstremregn_0_120&tilematrixset=View1&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix=${z_string}&TileCol=${col}&TileRow=${row}`;

      try {
        const img = await loadImg(tile_url);
        return { row, col, z, img };
      } catch (err) {
        return { row, col, z, img: null };
      }
    })
  );

  const stitched_bbox_etrs89 = [
    x_lower_idx * tile_size_to_download + origin_left,
    origin_top - (y_upper_idx + 1) * tile_size_to_download,
    (x_upper_idx + 1) * tile_size_to_download + origin_left,
    origin_top - y_lower_idx * tile_size_to_download,
  ];

  const stitched_size_etrs89 = {
    width: stitched_bbox_etrs89[2] - stitched_bbox_etrs89[0],
    height: stitched_bbox_etrs89[3] - stitched_bbox_etrs89[1],
  };

  const cols = x_upper_idx - x_lower_idx + 1;
  const rows = y_upper_idx - y_lower_idx + 1;

  const TILE_SIZE_PIXELS = 256;

  const stitched_width_px = cols * TILE_SIZE_PIXELS;
  const stitched_height_px = rows * TILE_SIZE_PIXELS;

  const canvas = document.createElement("canvas");
  canvas.width = stitched_width_px;
  canvas.height = stitched_height_px;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    for (const t of tiles) {
      if (t.img) {
        const px = (t.col - x_lower_idx) * TILE_SIZE_PIXELS;
        const py = (t.row - y_lower_idx) * TILE_SIZE_PIXELS;
        ctx.drawImage(t.img, px, py, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
      }
    }
  }

  const stitched_edge_to_tile_etrs89 = {
    left: tile_bbox_etrs89[0] - stitched_bbox_etrs89[0],
    top: stitched_bbox_etrs89[3] - tile_bbox_etrs89[3],
  };

  const stitched_edge_to_tile_pixels = {
    left:
      (stitched_edge_to_tile_etrs89.left / stitched_size_etrs89.width) *
      stitched_width_px,
    top:
      (stitched_edge_to_tile_etrs89.top / stitched_size_etrs89.height) *
      stitched_height_px,
  };

  const final_tile_size_pixels = {
    width:
      (tile_size_etrs89.width / stitched_size_etrs89.width) * stitched_width_px,
    height:
      (tile_size_etrs89.height / stitched_size_etrs89.height) *
      stitched_height_px,
  };

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = 256;
  finalCanvas.height = 256;
  const fCtx = finalCanvas.getContext("2d");

  if (fCtx) {
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = "high";

    fCtx.drawImage(
      canvas,
      stitched_edge_to_tile_pixels.left, // sx
      stitched_edge_to_tile_pixels.top, // sy
      final_tile_size_pixels.width, // sWidth
      final_tile_size_pixels.height, // sHeight
      0, // dx
      0, // dy
      256, // dWidth
      256 // dHeight
    );
  }

  const arrayBuffer = await new Promise<ArrayBuffer>((resolve) => {
    finalCanvas.toBlob((blob) => {
      blob!.arrayBuffer().then(resolve);
    }, "image/png");
  });

  return { data: arrayBuffer };
};
