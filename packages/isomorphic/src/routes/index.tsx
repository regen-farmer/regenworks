import {
	type Component,
	For,
	Match,
	Show,
	Switch,
	createResource,
} from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { allowFarmCreation } from "~/auth/useAuth";
import type { ParcelDocument } from "@rw/db/schemas/parcel";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { createSignal } from "solid-js";
import { AddFarmModal } from "~/components/AddFarmModal";
import MLMap from "~/components/Map";
import { createStore } from "solid-js/store";
import { SessionProvider } from "~/auth/SessionProvider";

async function postParcel(payload: parcelPayload) {
	const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/parcels`, {
		body: JSON.stringify({ parcel: payload }),
		method: "post",
		...apiFetchOptions(),
	});
	return await response.json();
}

async function updateParcel(payload: parcelPayload) {
	const id = payload.id;
	payload.id = undefined;
	const response = await fetch(
		`${import.meta.env.VITE_BACKEND_URL}/parcels/${id}`,
		{
			body: JSON.stringify({ parcel: payload }),
			method: "put",
			...apiFetchOptions(),
		},
	);
	return await response.json();
}

async function getGeoCodeFromLocation(
	location: string,
): Promise<[number, number]> {
	const response = await fetch(
		`${import.meta.env.VITE_BACKEND_URL}/geocoding`,
		{
			body: JSON.stringify({ address: location }),
			method: "post",
			...apiFetchOptions(),
		},
	);
	return await response.json();
}

export enum modes {
	default=0,
	dragMode=1,
	addFarm=2,
}

export type parcelPayload = {
	name: string | undefined;
	location: string | undefined;
	lat: number | undefined;
	lng: number | undefined;
	id?: string;
};

const RouteViewHome: Component = () => {
	const [data, { refetch }] = createResource<{
		parcels: ParcelDocument[];
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/parcels`,
			apiFetchOptions(),
		);

		return await response.json();
	});

	const navigate = useNavigate();

	const [mode, setMode] = createSignal<modes>(modes.default);
	const [isEditing, setIsEditing] = createSignal<boolean>(false);
	const [parcelPayload, setParcelPayload] = createStore<parcelPayload>({
		name: "",
		location: "",
		lng: undefined,
		lat: undefined,
	});
	const [coordinates, setCoordinates] = createSignal<[number, number]>();

	async function enterDefaultMode() {
		if (
			parcelPayload.name &&
			parcelPayload.location &&
			parcelPayload.lng &&
			parcelPayload.lat
		) {
			// await postParcel(parcelPayload);
			await refetch();
		}
		setMode(modes.default);
	}

	function enterAddFarmMode() {
		setMode(modes.addFarm);
	}

	async function enterDragMode() {
		if (parcelPayload.location && !isEditing()) {
			const result = await getGeoCodeFromLocation(parcelPayload.location);
			setCoordinates(result);
			setMode(modes.dragMode);
		} else {
			setCoordinates([parcelPayload.lng!, parcelPayload.lat!]);
			setMode(modes.dragMode);
		}
	}

	function enterEditMode(parcel: ParcelDocument) {
		setIsEditing(true);
		setMode(modes.addFarm);

		setParcelPayload({
			name: parcel.name,
			location: parcel.location,
			lng: Number(parcel.lng),
			lat: Number(parcel.lat),
			id: parcel._id,
		});
	}

	function cancel() {
		setParcelPayload({
			name: "",
			location: "",
			lng: undefined,
			lat: undefined,
			id: undefined,
		});
		setMode(modes.default);
		setIsEditing(false);
	}

	async function submitAndGoToDefaultMode() {
		if (isEditing()) {
			await updateParcel(parcelPayload);
			setIsEditing(false);
		} else {
			const newParcel = await postParcel(parcelPayload);
			navigate(`/parcels/${newParcel._id}`);
		}

		setParcelPayload({
			name: "",
			location: "",
			lng: undefined,
			lat: undefined,
			id: undefined,
		});

		setMode(modes.default);
		refetch();
	}

	return (
		<>
			<AddFarmModal
				mode={mode}
				setParcelPayload={setParcelPayload}
				parcelPayload={parcelPayload}
				enterDragMode={enterDragMode}
				enderDefaultMode={enterDefaultMode}
				cancelIndex={cancel}
				isEditing={isEditing}
				setIsEditing={setIsEditing}
			/>
			<Show when={data() && !data.loading} fallback={<p>no data</p>}>
				{/* <p>Doneloading: {JSON.stringify(data())} </p> */}

				<MLMap
					enterDefaultMode={enterDefaultMode}
					data={data}
					mode={mode}
					setParcelPayload={setParcelPayload}
					coordinates={coordinates}
				/>

				<Switch>
					<Match when={mode() === modes.default}>
						<div
							style={{
								background: "rgba(0,0,0,0.4)",
								"border-radius": "10px",
								position: "fixed",
								"z-index": 10,
								color: "white",
								right: "10px",
								bottom: "10px",
								padding: "10px",
								"min-width": "12rem",
								width: "fit-content",
								"max-height": "600px",
								display: "flex",
								"flex-direction": "column",
							}}
						>
							<strong>
								<span>Farms</span>
							</strong>
							<div>
								<Show when={data()?.parcels}>
									<div class="list-group">
										<For each={data()?.parcels}>
											{(parcel) => (
												<div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div">
													<A
														href={`/parcels/${parcel._id}`}
														class="overlay-list-link"
													>
														{parcel.name}
													</A>
													<div>
		
														<button
															title="Edit farm"
															type="button"
															class={"btn btn-dark menu-btn list-group-button"}
															onClick={() => enterEditMode(parcel)}
														>
															<i class="fa-solid fa-pen" />
														</button>

														
														<button
															title="Show farm on map"
															type="button"
															class={"btn btn-dark menu-btn list-group-button"}
															onClick={() => {
																// Go to location of parcel
																setCoordinates([
																	Number(parcel.lng),
																	Number(parcel.lat),
																]);
															}}
														>
															<i class="fa-solid fa-crosshairs" />
														</button>
													</div>
												</div>
											)}
										</For>
									</div>
								</Show>
							</div>
							{allowFarmCreation() ? (
								<button
									type="button"
									class={"btn btn-dark"}
									onClick={() => enterAddFarmMode()}
									style={{ width: "100%" }}
								>
									Add new farm
								</button>
							) : (
								<></>
							)}
						</div>
					</Match>
					<Match when={mode() === modes.dragMode}>
						<h1
							style={{
								background: "rgba(0,0,0,0.4)",
								"border-radius": "10px",
								position: "fixed",
								"z-index": 10,
								color: "white",
								top: "90px",
								"font-size": "20px",
								"text-align": "center",
								left: "50%",
								transform: "translateX(-50%)",
								padding: "10px",
							}}
						>
							Drag the marker to the location of your farm
						</h1>
						<div
							style={{
								background: "rgba(0,0,0,0.4)",
								"border-radius": "10px",
								position: "fixed",
								"z-index": 10,
								color: "white",
								right: "10px",
								bottom: "10px",
								padding: "10px",
								"min-width": "12rem",
								"max-height": "90%",
							}}
						>
							<strong>
								<span>Location</span>
							</strong>
							<div />
							<button
								type="button"
								class={"btn btn-dark"}
								onClick={() => submitAndGoToDefaultMode()}
								style={{ width: "100%" }}
							>
								Set location
							</button>
							<button
								type="button"
								class={"btn btn-danger"}
								onClick={() => {
									cancel();
								}}
								style={{ width: "100%" }}
							>
								cancel
							</button>
						</div>
					</Match>
				</Switch>
			</Show>
		</>
	);
};

export default function () {
	return (
		<SessionProvider>
			<RouteViewHome />
		</SessionProvider>
	);
}
