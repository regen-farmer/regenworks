import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select"
import {
	Show,
	createEffect,
	createMemo,
	createResource,
	createSignal,
} from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import type { ParcelDocument } from "@rw/db/schemas/parcel.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

// import { breadcrumb } from '~/breadcrumb'

export function FarmSelect() {
	const [reloadSignal, setReloadSignal] = createSignal(1);
	const [farmListData, { refetch }] = createResource(
		reloadSignal,
		async (reloader) => {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/parcels`,
				apiFetchOptions(),
			);
			try {
				const data = await response.json();
				return data;
			} catch (err) {
				console.log(err);
				return { parcels: [] };
			}
		},
	);

	const navigate = useNavigate();

	function farmDisplay(farmId: string): string {
		return farmListData()?.parcels.find(
			(parcel: ParcelDocument) => parcel._id.toString() === farmId.toString(),
		)?.name!;
	}

	const farms = createMemo(() => {
		return farmListData()?.parcels.map((farm: ParcelDocument) =>
			farm._id.toString(),
		)!;
	});

	const location = useLocation();

	const getParcelId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const parcelsIndex = pathSections.findIndex((value) => value === "parcels");

		const parcelId: string = pathSections[parcelsIndex + 1];
		return parcelId;
	});

	createEffect(() => {
		// console.log('params', location.pathname)

		if (
			getParcelId() &&
			farms() &&
			farms().findIndex((farm: ParcelDocument) => farm === getParcelId()) === -1
		) {
			// refresh.refetch()
		}
	});

	return (
		<Show
			when={
				farms() &&
				(getParcelId() && farms()
					? farms().findIndex(
							(farm: ParcelDocument) => farm === getParcelId(),
						) > -1
					: true)
			}
		>
			<Select
				value={getParcelId()}
				onChange={(val) => {
					if (val) {
						navigate(`/parcels/${val}`);
						
					}
				}}
				options={farms()}
				placeholder="Select farm"
				itemComponent={(props) => (
					<SelectItem item={props.item}>
						{props.item ? farmDisplay(props.item.rawValue) : ""}
					</SelectItem>
				)}
			>
				<SelectTrigger aria-label="Farm" class="select__trigger">
					<SelectValue<string>>
						{(state) => (
							state.selectedOption()
								? farmDisplay(state.selectedOption())
								: ""
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent class="select__content" />
			</Select>
		</Show>
	);
}
