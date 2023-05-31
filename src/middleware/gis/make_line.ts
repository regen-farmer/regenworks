import {
  bbox,
  bboxPolygon,
  helpers as turf,
  length as turfLength,
  LineString,
  transformRotate,
  centroid,
} from '@turf/turf';
import { ISystemDesignSchema } from '../../models/systemdesign';

export function makeInitialLine(
  systemdesign: ISystemDesignSchema,
  offsetPolygon,
) {
  const pivotPoint = centroid(offsetPolygon);

  const rotatedPolygon = transformRotate(
    offsetPolygon,
    -systemdesign.bearing,
    { pivot: pivotPoint },
  );

  const box = bboxPolygon(bbox(rotatedPolygon));
  const lengthLine = turf.lineString(
    [box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]],
    { name: 'line-0' },
  );
  const widthOfAreaInsideMargin: number = turfLength(lengthLine, { units: 'meters' });
  const rotatedLineIntersectingAreaInsideMargin = turf.lineString(
    [box.geometry.coordinates[0][3], box.geometry.coordinates[0][4]],
    { name: 'line-1' },
  );

  // Rotate line back using same pivot

  const lineIntersectingAreaInsideMargin: turf.Feature<
  LineString,
  turf.Properties
> = transformRotate(
  rotatedLineIntersectingAreaInsideMargin,
  systemdesign.bearing,
  { pivot: pivotPoint },
);

  return {
    lineIntersectingAreaInsideMargin,
    widthOfAreaInsideMargin,
  };
}
