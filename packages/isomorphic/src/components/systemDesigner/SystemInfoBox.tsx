import { type Component, For } from "solid-js";
import { difference as turfDifference, area as turfArea } from "@turf/turf";
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout";

const SystemInfoBox: Component<{
	systemLayout: ISystemBasedLayout;
	species: any;
	scenarioData: any;
}> = (props) => {
	function calculateMarginHeadlandArea(): number {
		const geometry = turfDifference(
			JSON.parse(props.scenarioData.project.layer.geometry),
			props.systemLayout.headlandPolygon,
		);

		const area = Number.parseFloat(turfArea(geometry));

		return area;
	}

	function fieldArea(geometry: string): number {
		return turfArea(JSON.parse(geometry));
	}

	function groundCoverPercentage(
		groundCoverArea: string,
		fieldGeometry: string,
	): string {
		return (
			(Number.parseFloat(groundCoverArea) / fieldArea(fieldGeometry)) *
			100
		)
			.toFixed(2)
			.replace(".", ",");
	}

	return (
		<div
			style={{
				color: "white",
				position: "absolute",
				padding: "10px",
				background: "rgba(0,0,0,0.4)",
				"border-radius": "10px",
				"z-index": 10,
				left: "10px",
				bottom: "10px",
			}}
		>
			<strong>
				<span>Tree and shrub counts:</span>
			</strong>
			<br />

			<For each={props.systemLayout.speciesCountArray}>
				{(speciesEl) => {
					// console.log("species", systemDesignData()?.species);
					return (
						<>
							<span>
								{props.species.speciesById.get(speciesEl.species).nameCommon}:{" "}
								{speciesEl.count}
							</span>
							<br />
						</>
					);
				}}
			</For>

			{Object.keys(props.systemLayout.groundCoverAreasM2).length > 0 ? (
				<>
					<strong>
						<span>Ground cover:</span>
					</strong>
					<br />
					<For each={Object.keys(props.systemLayout.groundCoverAreasM2)}>
						{(speciesEl) => {
							console.log("groundcover", speciesEl);
							return (
								<>
									<span>
										{props.species.speciesById.get(speciesEl).nameCommon}:{" "}
										{`${(
											Number.parseFloat(
												props.systemLayout.groundCoverAreasM2[speciesEl],
											) / 10000
										)
											.toFixed(2)
											.replace(".", ",")} ha (${groundCoverPercentage(
											props.systemLayout.groundCoverAreasM2[speciesEl],
											props.scenarioData.project.layer.geometry,
										)}%)`}
									</span>
									<br />
								</>
							);
						}}
					</For>
				</>
			) : (
				<></>
			)}
			{(props.scenarioData.project.systemdesign.headland > 0 ||
				props.scenarioData.project.systemdesign.margin > 0) &&
			calculateMarginHeadlandArea() > 10 ? (
				<>
					<strong>
						<span>Margin & headland:</span>
					</strong>
					<br />
					{`${(calculateMarginHeadlandArea() / 10000)
						.toFixed(2)
						.replace(".", ",")} ha`}
					<br />
				</>
			) : (
				<></>
			)}

			<strong>
				<span>Field area:</span>
			</strong>
			<br />
			{`${(fieldArea(props.scenarioData.project.layer.geometry) / 10000)
				.toFixed(2)
				.replace(".", ",")} ha`}
		</div>
	);
};

export { SystemInfoBox };
