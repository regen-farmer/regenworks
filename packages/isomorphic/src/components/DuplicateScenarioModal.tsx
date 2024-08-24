import { Dialog } from "@kobalte/core";
import { Show, createResource, createSignal } from "solid-js";
import "~/styling/modal.css";
import { action } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { Row } from "~/components/row/Row";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import { useParams } from "@solidjs/router";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";

type DuplicateScenarioModalProps = {
	modalOpen: () => boolean;
	setModalOpen: (modalOpen: boolean) => void;
	refetchScenarios: any;
	activeScenario: ()=>ProjectDocument;
};

export function DuplicateScenarioModal({
	modalOpen,
	setModalOpen,
	refetchScenarios,
	activeScenario,
}: DuplicateScenarioModalProps) {
	const [error, setError] = createSignal<string>("");
	const [submitDisabled, setSubmitDisabled] = createSignal(false);
	const params = useParams();

	function cancel() {
		setModalOpen(false);
	}

	const [data, { refetch }] = createResource<{
		layer: LayerDocument;
		system: SystemDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${
				params.layerId
			}/new-project`,
			apiFetchOptions(),
		);
		const result = await response.json();
		return result;
	});

	const routeAction = action(async (formData: FormData) => {
		setSubmitDisabled(true);

		const payload = {
			project: {
				name: formData.get("project[name]")?.toString()!,
				source: activeScenario()
			},
		};

		console.log(payload);

		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/projects/duplicate`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		const project: ProjectDocument = await response.json();
		refetchScenarios();
		setModalOpen(false);
	});

	return (
		<div>
			<Show when={modalOpen()}>
				<Dialog.Root open={modalOpen()}>
					<Dialog.Portal>
						<Dialog.Overlay class="dialog__overlay" />
						<div class="dialog__positioner">
							<Dialog.Content
								class="dialog__content"
								onPointerDownOutside={cancel}
							>
								<div class="dialog__header">
									<Dialog.Title class="dialog__title">
										Duplicate "{activeScenario().name}"
									</Dialog.Title>
								</div>
								<Dialog.Description class="dialog__description">
									<Show when={data()}>
										<Row>
											<div>
												<form method="post" action={routeAction}>
													<div class="form-group">
														<label for="project[name]">Scenario title</label>
														{/* disable input when submiting disabled */}
														<input
															type="text"
															class="form-control"
															name="project[name]"
															placeholder=""
															required
															disabled={submitDisabled()}
														/>
													</div>
													
													<br />
													<div class="btn-group">
														<button
															disabled={submitDisabled()}
															type="submit"
															class="rounded-sm p-1 m-1 btn-dark"
														>
															Duplicate scenario
														</button>
													</div>
												</form>
											</div>
										</Row>
									</Show>

									<Show when={error()}>
										<p>{error()}</p>
									</Show>
								</Dialog.Description>
							</Dialog.Content>
						</div>
					</Dialog.Portal>
				</Dialog.Root>
			</Show>
		</div>
	);
}

export default DuplicateScenarioModal;
