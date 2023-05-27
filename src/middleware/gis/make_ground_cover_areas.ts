import {
  helpers as turf,
  lineIntersect,
  buffer,
  along,
  length,
  mask,
  intersect,
  difference
} from '@turf/turf';
import _ from 'lodash';
import { ISpeciesSchema } from '../../models/species';

function calculateHeadland(headland?: {
  before?: number | undefined;
  after?: number | undefined;
}): { before: number, after: number } {
  let before = 0;
  let after = 0;

  if (headland) {
    if (headland.before) {
      before += headland.before;
    }
    if (headland.after) {
      after += headland.after;
    }
  }

  return { before, after };
}

export function makeGroundCoverAreas(offsetPolygon: turf.Feature<turf.Polygon, turf.Properties>, calibrateDistance: number, lineIntersectingAreaInsideMargin: turf.Feature<turf.LineString, turf.Properties>, widthOfAreaInsideMargin: number, rows: {
  sequence: {
    species: ISpeciesSchema,
    spacingAfter: number
  }[],
  headland?: {
    before?: number,
    after?: number
  },
  offset?: {
    before?: number,
    after?: number
  },
  groundcover?: ISpeciesSchema,
  width: number
}[]): turf.Feature<turf.Polygon, turf.Properties>[] {
  let accumulatingWidth = 0;
  const groundCoverAreas: turf.Feature<turf.Polygon, turf.Properties>[] = [];
  let currentRowIdx = 0;

  if (!(rows.length > 0)) {
    console.log('No rows in system design');
    return [];
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {

    console.log('widthOfAreaInsideMargin', widthOfAreaInsideMargin);
    console.log('accumulatingWidth', accumulatingWidth);
    console.log('rows[currentRowIdx].width', rows[currentRowIdx].width);
    console.log('accumulatingWidth * calibrateDistance', accumulatingWidth * calibrateDistance);

    // Complete if there isn't room for more lines
    if (accumulatingWidth > widthOfAreaInsideMargin) {
      console.log('accumulatingWidth too big - BREAK');
      break;
    }

    // Make bounding box of row width in widht, and very large height. THen do the area intersect.

    let elongatedDonutBuffer;

    // This requires two buffers
    if (accumulatingWidth > 0) {
      const bufferSmall = buffer(lineIntersectingAreaInsideMargin, (accumulatingWidth * calibrateDistance), { units: 'meters' });
      const bufferBig = buffer(lineIntersectingAreaInsideMargin, ((accumulatingWidth + rows[currentRowIdx].width) * calibrateDistance), { units: 'meters' });
      elongatedDonutBuffer = mask(bufferSmall, bufferBig);
    } else {
      elongatedDonutBuffer = buffer(lineIntersectingAreaInsideMargin, (rows[currentRowIdx].width * calibrateDistance), { units: 'meters' });
    }

    // Mask big polygon with the smaller to find the difference (a en elongated donut shape)
    

    
    
    groundCoverAreas.push(elongatedDonutBuffer);
  


    // console.log('intersectionAreas', typeof elongatedDonutBuffer);

    
    
    
    
    
    
    // const intersectionAreas = intersect(offsetPolygon, elongatedDonutBuffer);
    // // // Check if turf value is a polygon or a multipolygon
    // if (intersectionAreas?.geometry.type === 'Polygon') {

    //   console.log('Polygon found');


    //   const area = intersectionAreas as turf.Feature<turf.Polygon, turf.Properties>;
    //   groundCoverAreas.push(turf.polygon(area.geometry.coordinates, { name: `alleypoly${groundCoverAreas.length}` }));
    // } else if (intersectionAreas?.geometry.type === 'MultiPolygon') {

    //   console.log('MultiPolygon found');
    //   const area = intersectionAreas as turf.Feature<turf.MultiPolygon, turf.Properties>;
    //   area.geometry.coordinates.forEach((polygon) => {
    //     groundCoverAreas.push(turf.polygon(polygon, { name: `alleypoly${groundCoverAreas.length}` }));
    //   });
    // }


    // // Handle each segment if there are multiple areas
    // for (let k = 0; k < intersectionAreas?.type; k++) {
    //   let treeRow = turf.lineString([sortedIntersectionPoints[k * 2].geometry.coordinates, sortedIntersectionPoints[k * 2 + 1].geometry.coordinates], { name: `line-${groundCoverAreas.length}` });

    //   // Add spacing before and after

    //   const { before, after } = calculateHeadland(rows[currentRowIdx].headland);

    //   if (before + after >= length(treeRow, { units: 'meters' })) {
    //     console.log('Headland and offset are longer than tree row line. Skipping');
    //     // eslint-disable-next-line no-continue
    //     continue;
    //   }

    //   treeRow = turf.lineString([along(treeRow, before, { units: 'meters' }).geometry.coordinates, along(treeRow, length(treeRow, { units: 'meters' }) - after, { units: 'meters' }).geometry.coordinates], { name: `line-${groundCoverAreas.length}` });

    //   // Add offset before

    //   groundCoverAreas.push(treeRow);
    // }



    // Add row width
    accumulatingWidth += rows[currentRowIdx].width;

    // Prepare for next row. Cycle through rows in system design
    currentRowIdx++;
    if (currentRowIdx === rows.length) {
      currentRowIdx = 0;
    }
  }

  console.log('groundCoverAreas.length', groundCoverAreas.length)

  return groundCoverAreas;
}
