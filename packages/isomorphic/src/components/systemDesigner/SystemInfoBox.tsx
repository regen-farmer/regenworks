import { type Component, For } from "solid-js";
import { difference as turfDifference, area as turfArea } from "@turf/turf";
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";

const SystemInfoBox: Component<{
	systemLayout: ISystemBasedLayout;
	species: any;
	scenarioData: any;
}> = (props) => {
	function calculateMarginHeadlandArea(): number {
		const geometry = turfDifference({
			type: "FeatureCollection",
			features: [
				JSON.parse(props.scenarioData.project.layer.geometry),
				props.systemLayout.headlandPolygon,
			],
		});

		const area = Number.parseFloat(turfArea(geometry!).toString());

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
			class="dark:bg-background bg-white  text-black  dark:text-white"
			style={{
				position: "absolute",
				padding: "10px",
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
					const species = props.species.speciesById.get(speciesEl.species);
					if (!species) {
						console.warn(`Species not found:`, speciesEl.species, typeof speciesEl.species);
						return null;
					}
					return (
						<>
							<span>
								{species.nameCommon}:{" "}
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
							const species = props.species.speciesById.get(speciesEl);
							if (!species) {
								console.warn(`Ground cover species not found: ${speciesEl}`);
								return null;
							}
							return (
								<>
									<span>
										{species.nameCommon}:{" "}
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
			{(props.scenarioData.project.systemdesign?.headland > 0 ||
				props.scenarioData.project.systemdesign?.margin > 0) &&
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
