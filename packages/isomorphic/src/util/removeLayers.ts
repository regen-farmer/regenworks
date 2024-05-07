export function removeLayers(layerNames: string[], map:maplibregl.Map) {
  for (const layerName of layerNames) {
    if (map.getSource(layerName)) {

      console.log("HERE", layerName)
      map.removeLayer(layerName);
      map.removeSource(layerName);
    }
  }
}