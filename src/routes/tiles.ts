import proj4 from 'proj4';
import joinImages from 'join-images';
import sharp from 'sharp';
import { PNG } from 'pngjs';

// @ts-ignore
import PNGCrop from 'png-crop';
import express from 'express';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// SEQUENCE NEW
router.get(
  '/api/tiles/bluespot',
  async (request: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // const url_params = (new URL(request.url)).searchParams;

    /// ///////////////////////////////////////////////////
    // Coordinates in EPSG 3857 - Pseudo-Mercator
    /// ///////////////////////////////////////////////////

    // const tile_bbox_wgs84: number[] = url_params.get('bbox')?.split(',').map((value) => parseFloat(value))!;

    const tile_bbox_wgs84: number[] = request.url.split('bbox=')[1].split(',').map((value) => parseFloat(value));
    console.log('bbox', tile_bbox_wgs84);

    // let tile_bbox_wgs84: number[] = [1196086.618606437,7633918.888897125,1197309.6110590026,7635141.8813496865]

    /// ///////////////////////////
    // Coordinates in EPSG 25832
    /// ///////////////////////////

    const projections = {
      WGS84: '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
      ETRS89: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    };

    const left_bottom = proj4('GOOGLE', projections.ETRS89, [tile_bbox_wgs84[0], tile_bbox_wgs84[1]]);
    const right_top = proj4('GOOGLE', projections.ETRS89, [tile_bbox_wgs84[2], tile_bbox_wgs84[3]]);
    const left_top = proj4('GOOGLE', projections.ETRS89, [tile_bbox_wgs84[0], tile_bbox_wgs84[3]]);
    const right_bottom = proj4('GOOGLE', projections.ETRS89, [tile_bbox_wgs84[2], tile_bbox_wgs84[1]]);

    // const tile_bbox_etrs89 = [
    //   Math.min(left_bottom[0], left_top[0]),
    //   Math.min(left_bottom[1], right_bottom[1]),
    //   Math.max(right_bottom[0], right_top[0]),
    //   Math.max(right_top[1], left_top[1]),
    // ]

    const tile_bbox_etrs89 = [
      (left_bottom[0] + left_top[0]) / 2,
      (left_bottom[1] + right_bottom[1]) / 2,
      (right_bottom[0] + right_top[0]) / 2,
      (right_top[1] + left_top[1]) / 2,
    ];

    /// ////////////////////////
    // Zoom Level
    /// ////////////////////////

    const tile_size_etrs89 = {
      width: tile_bbox_etrs89[2] - tile_bbox_etrs89[0],
      height: tile_bbox_etrs89[3] - tile_bbox_etrs89[1],
    };

    const meters_per_tile_at_z = [419430.4];
    for (let i = 0; i < 13; i++) {
      meters_per_tile_at_z.push(meters_per_tile_at_z[i] / 2);
    }

    const zoom_level = meters_per_tile_at_z.findIndex((meters, index) => {
      if (Math.max(tile_size_etrs89.width, tile_size_etrs89.height) > meters / 2 || index == 9) {
        return true;
      }
      return false;
    });

    const tile_size_to_download = meters_per_tile_at_z[zoom_level];

    /// ////////////////////////
    // View1 Tile Index
    /// ////////////////////////

    // TileMatrix Origin - Left, Top
    const origin_left = 120000;
    const origin_top = 6500000;

    // Index X
    const origin_to_bbox_left = tile_bbox_etrs89[0] - origin_left;
    const origin_to_bbox_right = tile_bbox_etrs89[2] - origin_left;

    const x_lower_idx = Math.floor(origin_to_bbox_left / tile_size_to_download);
    const x_upper_idx = Math.floor(origin_to_bbox_right / tile_size_to_download);

    // Index Y

    const origin_to_bbox_top = origin_top - tile_bbox_etrs89[3];
    const origin_to_bbox_bottom = origin_top - tile_bbox_etrs89[1];

    const y_lower_idx = Math.floor(origin_to_bbox_top / tile_size_to_download);
    const y_upper_idx = Math.floor(origin_to_bbox_bottom / tile_size_to_download);

    /// ////////////////////////
    // Array of View1 Tile Ids
    /// ////////////////////////

    const tile_ids: { row: number, col: number, z: number }[] = [];

    for (let y = y_lower_idx; y <= y_upper_idx; y++) {
      for (let x = x_lower_idx; x <= x_upper_idx; x++) {
        tile_ids.push({ row: y, col: x, z: zoom_level });
      }
    }

    /// ////////////////////////
    // Download View1 tiles
    /// ////////////////////////

    console.log('Tiles: ', tile_ids.length);

    const tiles = await Promise.all(await tile_ids.map(async ({ row, col, z }) => {
      // Bluespot
      const z_string = `L${z.toString().padStart(2, '0')}`;
      const tile_url = `https://api.dataforsyningen.dk/dhm_bluespot_ekstremregn?token=f3ecb52320902f733a433aa9945d8dc8&layer=bluespot_ekstremregn_0_120&tilematrixset=View1&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix=${z_string}&TileCol=${col}&TileRow=${row}`;

      // Skærmkort
      // const z_string = z.toString().padStart(1, '0')
      // const tile_url = `https://api.dataforsyningen.dk/topo_skaermkort_wmts_DAF?token=f3ecb52320902f733a433aa9945d8dc8&layer=topo_skaermkort&tilematrixset=View1&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix=${z_string}&TileCol=${col}&TileRow=${row}`;
      try {
        const response = await fetch(tile_url);
        return {
          row, col, z, picture: await response.blob(),
        };
      } catch (error) {
        return {
          row, col, z, picture: null,
        };
      }
    }));

    /// ////////////////////////
    // Stitch Images
    /// ////////////////////////

    const rows: sharp.Sharp[] = [];

    const nulltile = tiles.find((tile) => !tile.picture);
    if (nulltile) {
      res.send('No picture');
      return;
    }

    for (let y = y_lower_idx; y <= y_upper_idx; y++) {
      const rowImages = await tiles.filter((tile) => tile.row === y && tile.picture !== null && tile.picture.type === 'image/png');

      const rowImagesAll = await tiles.filter((tile) => tile.row === y);

      if (rowImages.length !== rowImagesAll.length) {
        res.send('No picture');
        return;
      }

      console.log('SHOUDL NOT BE HERE');

      const rowArrayBuffer = await Promise.all(rowImages.map(async (tile) => {
        console.log('kha 2', tile.picture);
        const arrayBuffer = Buffer.from(await tile.picture!.arrayBuffer());
        return arrayBuffer;
      }));

      console.log('kha 1');
      let rowImage;

      console.log('rowArrayBuffer.length', rowArrayBuffer.length);
      if (rowArrayBuffer.length > 1) {
        rowImage = await joinImages(rowArrayBuffer, {
          direction: 'horizontal',
          color: {
            alpha: 0, b: 0, g: 0, r: 0,
          },
        });
      } else if (rowArrayBuffer.length === 1) {
        rowImage = sharp(rowArrayBuffer[0]);
      } else {
        console.log('rowArrayBuffer.length', rowArrayBuffer.length);
      }
      rows.push(rowImage);
    }

    console.log('kha 3');

    const row_buffers: Buffer[] = await Promise.all(rows.map(async (row) => row.png().toBuffer()));

    let stitched: sharp.Sharp;
    if (row_buffers.length > 1) {
      stitched = await (await joinImages(row_buffers, {
        direction: 'vertical',
        color: {
          alpha: 0, b: 0, g: 0, r: 0,
        },
      }));
    } else if (row_buffers.length === 1) {
      stitched = sharp(await rows[0].png().toBuffer());
    } else {
      console.log('row_buffers.length', row_buffers.length);
    }

    /// ///////////////////////////
    // Boundary of stitched image
    /// ///////////////////////////

    // left, bottom, right, top - EPSG 25832
    const stitched_bbox_etrs89 = [
      x_lower_idx * tile_size_to_download + origin_left,
      origin_top - (y_upper_idx + 1) * tile_size_to_download,
      (x_upper_idx + 1) * tile_size_to_download + origin_left,
      origin_top - (y_lower_idx) * tile_size_to_download,
    ];

    const stitched_size_etrs89 = {
      width: stitched_bbox_etrs89[2] - stitched_bbox_etrs89[0],
      height: stitched_bbox_etrs89[3] - stitched_bbox_etrs89[1],
    };

    // @ts-ignore
    const stitched_size_pixels = await stitched.metadata();

    const stitched_edge_to_tile_etrs89 = {
      left: tile_bbox_etrs89[0] - stitched_bbox_etrs89[0],
      top: stitched_bbox_etrs89[3] - tile_bbox_etrs89[3],
    };

    const stitched_edge_to_tile_pixels = {
      left: (stitched_edge_to_tile_etrs89.left / stitched_size_etrs89.width) * stitched_size_pixels.width!,
      top: (stitched_edge_to_tile_etrs89.top / stitched_size_etrs89.height) * stitched_size_pixels.height!,
    };

    const tile_size_pixels = {
      width: (tile_size_etrs89.width / stitched_size_etrs89.width) * stitched_size_pixels.width!,
      height: (tile_size_etrs89.height / stitched_size_etrs89.height) * stitched_size_pixels.height!,
    };

    console.log('tile_size_pixels', tile_size_pixels);

    // await stitched.toFile(`pngs/${left_bottom[0].toString()}_before_crop.png`)

    const crop_region = {
      width: Math.round(tile_size_pixels.width), height: Math.round(tile_size_pixels.height), top: Math.round(stitched_edge_to_tile_pixels.top), left: Math.round(stitched_edge_to_tile_pixels.left),
    };
    let response_buffer;

    // @ts-ignore
    // eslint-disable-next-line no-async-promise-executor
    const crop_promise = new Promise<boolean>(async (resolve, reject) => {
      // @ts-ignore
      PNGCrop.cropToStream(await stitched.png().toBuffer(), crop_region, (err: any, output_stream: PNG) => {
        if (err) throw err;
        // output_stream.pipe(fs.createWriteStream('pngs/expectedCrop.png'));
        response_buffer = PNG.sync.write(output_stream, { colorType: 6 });
        resolve(true);
      });
    });

    await crop_promise;
    res.set('Content-Type', 'image/png');
    res.send(response_buffer);
  },
);

export default router;
