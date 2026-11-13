export type ISystemBasedLayout = {
  treeRowLines: any;
  groundCoverAreas: any;
  headlandSides: any;
  marginPolygon: any;
  headlandPolygon: any;
  sidesCloseToBearing: any;
  intersectionPoints: any;
  treeMarkerArray: any;
  speciesCountArray: any;
  groundCoverAreasM2: any;
  stripPolygons?: any[];
  stripAreasM2?: number[];
  /** Grid layout only: where the grid starts and its spacings. */
  grid?: import("../../layout-grid/grid_layout.ts").GridInfo;
};
