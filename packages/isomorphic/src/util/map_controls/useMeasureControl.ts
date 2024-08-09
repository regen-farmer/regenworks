import MeasuresControl from "~/components/Measure.tsx";

export function useMeasureControl(map: maplibregl.Map) {

  const measureControl = new MeasuresControl({
		lang: {
				areaMeasurementButtonTitle: 'Measure area',
				lengthMeasurementButtonTitle: 'Measure length',
				clearMeasurementsButtonTitle:  'Clear measurements',
		},
		style: {
				text: {
						radialOffset:  0.9,
						letterSpacing: 0.05,
						color: '#fff',
						haloColor: '#fff',
						haloWidth: 0,
						font: 'Noto Sans Bold'
				},
				common: {
						midPointRadius: 3,
						midPointColor: 'black',
						midPointHaloRadius: 5,
						midPointHaloColor: '#FFF',
				},
				areaMeasurement: {
						fillColor: 'yellow',
						fillOutlineColor: 'yellow',
						fillOpacity: 0.10,
						lineWidth: 2,
				},
				lengthMeasurement: {
						lineWidth: 2,
						lineColor: "yellow",
				},
		}
});

  map.addControl(measureControl, "top-left");
}