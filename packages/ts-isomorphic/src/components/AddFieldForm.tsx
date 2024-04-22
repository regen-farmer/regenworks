import { createSignal } from "solid-js";
import { action } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";

type AddFieldFormProps = {
	enterDefaultMode: (cancelled: boolean) => void;
	name: () => string;
	refetch: any;
	removeDrawControl: ()=>void
};

function AddFieldForm({ enterDefaultMode, name, refetch, removeDrawControl }: AddFieldFormProps) {
	const [submitDisabled, setSubmitDisabled] = createSignal<boolean>(false);
	const params = useParams<{ parcelId: string }>();

	const routeAction = action(async (formData: FormData) => {
		setSubmitDisabled(true);
		const payload = {
			layer: {
				name: formData.get("layer[name]")?.toString(),
			},
			geometry: formData.get("geometry")?.toString(),
			layersize: formData.get("layersize")?.toString(),
		};

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/parcels/${params.parcelId}/layers`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		enterDefaultMode(false);
		await refetch();
	});

	function cancel(){

		removeDrawControl()
		enterDefaultMode(true)
	}

	return (
		<div>
			<form method="post" action={routeAction}>
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
					}}
				>
					<div>
						<button
							type="button"
							class="btn btn-dark center-block"
							onClick={cancel}
						>
							Cancel
						</button>

						<button
							type="submit"
							disabled={submitDisabled()}
							class="btn btn-dark center-block"
						>
							Save
						</button>
					</div>
				</div>
				<div>
					<input type="hidden" id="name" name="layer[name]" value={name()} />
					<input type="hidden" id="geometry" name="geometry" />
					<input type="hidden" id="layersize" name="layersize" />
				</div>
			</form>
		</div>
	);
}

export default AddFieldForm;
