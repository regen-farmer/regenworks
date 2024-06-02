import { Select } from "@kobalte/core/select";
import {
	Show,
	createEffect,
	createMemo,
	createResource,
	createSignal,
} from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import type { ParcelDocument } from "@rw/db/schemas/parcel";
import { apiFetchOptions } from "~/util/apiFetchOptions";

// import { breadcrumb } from '~/breadcrumb'

export const [reloadSignal, setReloadSignal] = createSignal(1);

export function FarmSelect() {
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
				options={farms()}
				placeholder="Select farm"
				value={getParcelId()}
				onChange={(val) => {
					if (val) {
						navigate(`/parcels/${val}`);
					}
				}}
				// valueComponent={(props: any) => {
				//   return props.item ? farmDisplay(props.item.rawValue) : ''
				// }}
				itemComponent={(props: any) => (
					<Select.Item item={props.item} class="select__item">
						<Select.ItemLabel>
							{props.item ? farmDisplay(props.item.rawValue) : ""}
						</Select.ItemLabel>

						<Select.ItemIndicator class="select__item-indicator">
							<i class="fas fa-check" />
						</Select.ItemIndicator>
					</Select.Item>
				)}
			>
				<Select.Trigger class="select__trigger" aria-label="Fruit">
					<Select.Value<string> class="select__value">
						{(state) => {
							return state.selectedOption()
								? farmDisplay(state.selectedOption())
								: "";
						}}
					</Select.Value>
					{/* <Select.Icon class='select__icon'>
            <i class='fas fa-sort' />
          </Select.Icon> */}
				</Select.Trigger>
				<Select.Portal>
					<Select.Content class="select__content">
						<Select.Listbox class="select__listbox" />
					</Select.Content>
				</Select.Portal>
			</Select>
		</Show>
	);
}
