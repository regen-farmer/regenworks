import { Dialog } from "@kobalte/core";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { Show, createSignal } from "solid-js";
import "~/styling/modal.css";
import * as togeojson from "@tmcw/togeojson";

import * as turf from "@turf/turf";
import type { Feature, Polygon, Properties } from "@turf/turf";
import "~/styling/modal.css";
import { useDrawControl } from "~/util/map_controls/useDrawControl";
import type { Map as MLMap } from "maplibre-gl";

type AddFieldModalProps = {
	modalOpen: () => boolean;
	setModalOpen: (modalOpen: boolean) => void;
	setInput: (input: string) => void;
	setKMLPolygon: (input: Feature<Polygon, Properties> | null) => void;
	addDrawControl: () => void;
	enterDefaultMode: (cancelled: boolean) => void;
	removeDrawControl: () => void;
};

function AddFieldModal({
	modalOpen,
	setInput,
	setModalOpen,
	setKMLPolygon,
	addDrawControl,
	enterDefaultMode,
	removeDrawControl,
}: AddFieldModalProps) {
	const [error, setError] = createSignal<string>("");
	// setInput and closeModal
	function closeModal() {
		const input = document.getElementById("input") as HTMLInputElement;
		if (input?.value) {
			setInput(input.value);

			setKMLPolygon(polygon());
			setInternalKMLFile(null);

			setModalOpen(false);

			console.log("Add draw control");
			addDrawControl();
		} else {
			setError("Please enter a name");
		}
	}

	function cancel() {
		setModalOpen(false);
		removeDrawControl();
		enterDefaultMode(true);
	}

	const [kmlFile, setInternalKMLFile] = createSignal<File | null>(null);
	const [polygon, setPolygon] = createSignal<Feature<
		Polygon,
		Properties
	> | null>(null);

	return (
		<div>
			<Dialog.Root open={modalOpen()}>
				<Dialog.Portal>
					<Dialog.Overlay class="dialog__overlay" />
					<div class="dialog__positioner">
						<Dialog.Content
							class="dialog__content"
							onPointerDownOutside={cancel}
						>
							<div class="dialog__header">
								<Dialog.Title class="dialog__title">Add field</Dialog.Title>
							</div>
							<Dialog.Description class="dialog__description">
								<div class="dialog__description__body">
									<input
										type="text"
										class="addFieldInput"
										name="layer[name]"
										placeholder="Name"
										required
										id="input"
									/>

									<label for="kmlfile" class="btn btn-dark">
										{kmlFile()?.name
											? `${kmlFile()?.name} (${
													polygon()?.geometry?.coordinates[0].length
												} coordinates)`
											: "Use geometry from KML file (Optional)"}
									</label>
									<input
										style="visibility:hidden;"
										type="file"
										onChange={async (e) => {
											function invalidFile() {
												alert("Can't parse field coordinates.");
											}

											const file = e.target.files![0];

											// Parse KML file
											if (file) {
												const kmlContent = await file?.text();
												if (!kmlContent) {
													invalidFile();
													return;
												}
												const kml = new DOMParser().parseFromString(
													kmlContent,
													"text/xml",
												);
												if (!kml) {
													invalidFile();
													return;
												}
												const converted = togeojson.kml(kml);
												if (!converted) {
													invalidFile();
													return;
												}

												if (!converted!.features[0]) {
													invalidFile();
													return;
												}

												let geometry = converted!.features[0]!.geometry!;
												if (!geometry) {
													invalidFile();
													return;
												}

												if (geometry.type === "LineString") {
													// Create a polygon from the linestring
													geometry = turf.polygon([
														geometry.coordinates,
													]).geometry;
												}

												if (geometry.type === "Polygon") {
													geometry.coordinates[0] =
														geometry!.coordinates[0].map((coordinate) => [
															coordinate[0],
															coordinate[1],
														]);

													const turfPolygon = turf.polygon(
														(geometry as turf.Polygon).coordinates,
													);

													setPolygon((prev) => turfPolygon);
													setInternalKMLFile((prev) => file);
												} else {
													invalidFile();
													return;
												}
											} else {
												invalidFile();
											}
										}}
										name="kmlfile"
										id="kmlfile"
										title="KML File"
									/>

									<button
										type="button"
										// type="submit"
										// disabled={submitDisabled()}
										class="btn btn-dark center-block"
										onClick={() => closeModal()}
									>
										Continue
									</button>
								</div>
								<Show when={error()}>
									<p>{error()}</p>
								</Show>
							</Dialog.Description>
						</Dialog.Content>
					</div>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	);
}

export default AddFieldModal;
