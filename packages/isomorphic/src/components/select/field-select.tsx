import { Select } from "@kobalte/core";
import { Show, createMemo, createResource, createSignal } from "solid-js";
import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";

import type { LayerDocument } from "~/models/layer";
// import { breadcrumb } from '~/breadcrumb'

export const [reloadSignal, setReloadSignal] = createSignal(1);

export function FieldSelect() {
	const location = useLocation();
	const params = useParams();

	const getParcelId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const parcelsIndex = pathSections.findIndex((value) => value === "parcels");
		const parcelId: string = pathSections[parcelsIndex + 1];
		return parcelId;
	});

	const getLayerId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const layersIndex = pathSections.findIndex((value) => value === "layers");
		const layerId: string = pathSections[layersIndex + 1];
		return layerId;
	});

	const [farmData, { refetch }] = createResource(
		reloadSignal,
		async (reloader) => {
			// console.log("farm", getParcelId());

			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/parcels/${getParcelId()}`,
				apiFetchOptions(),
			);
			const answer = await response.json();
			return answer;
		},
	);

	const navigate = useNavigate();

	function fieldDisplay(fieldId: string): string {
		return farmData()?.parcel.layers.find(
			(layer: LayerDocument) => layer._id.toString() === fieldId.toString(),
		)?.name!;
	}

	const fields = createMemo(() => {
	
		if (!farmData()?.error) {
			const fields = farmData()?.parcel.layers?.map((field: LayerDocument) =>
				field._id.toString(),
			)!;
			// console.log('Load fields', fields)
			return fields;
		}
		return [];
	});

	return (
		<Show when={fields()}>
			<Select.Root
				options={fields()}
				placeholder="Select field"
				value={getLayerId()}
				onChange={(val) => {
					if (val && val !== params.layerId) {
						navigate(`/parcels/${getParcelId()}/layers/${val}`);
					}
				}}
				// valueComponent={(props: any) => {
				//   return props.item ? fieldDisplay(props.item.rawValue) : ''
				// }}
				itemComponent={(props: any) => (
					<Select.Item item={props.item} class="select__item">
						<Select.ItemLabel>
							{props.item ? fieldDisplay(props.item.rawValue) : ""}
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
								? fieldDisplay(state.selectedOption())
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
			</Select.Root>
		</Show>
	);
}
