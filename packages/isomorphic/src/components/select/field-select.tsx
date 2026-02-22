import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select";
import { Show, createMemo, createResource, createSignal } from "solid-js";
import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

import type { LayerDocument } from "@rw/db/schemas/layer.ts";
// import { breadcrumb } from '~/breadcrumb'

export function FieldSelect() {
	const [reloadSignal, setReloadSignal] = createSignal(1);
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
			<Select
				value={getLayerId()}
				onChange={(val) => {
					if (val && val !== params.layerId) {
						navigate(`/parcels/${getParcelId()}/layers/${val}`);
					}
				}}
				options={fields()}
				placeholder="Select field"
				itemComponent={(props) => (
					<SelectItem item={props.item}>
						{props.item ? fieldDisplay(props.item.rawValue) : ""}
					</SelectItem>
				)}
			>
				<SelectTrigger aria-label="Field" class="select__trigger">
					<SelectValue<string>>
						{(state) => (
							state.selectedOption()
								? fieldDisplay(state.selectedOption())
								: ""
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent class="select__content" />
			</Select>
		</Show>
	);
}
