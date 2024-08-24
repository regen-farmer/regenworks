import type { IRow } from "~/routes/parcels/[parcelId]/layers/[layerId]/projects/[projectId]/designer.tsx";
import "./add-row.css";

export function AddRow(props: {
	index: number;
	setSystem: any;
	logSystem: any;
}) {
	return (
		<div class="trigger">
			<div
				class="rounded-sm p-1 m-1 btn-default"
				onClick={() => {
					props.setSystem("rows", (prev: IRow[]) => [
						...prev.slice(0, props.index),
						{
							width: 5,
							sequence: [],
							offset: { before: 0, after: 0 },
						},
						...prev.slice(props.index, prev.length),
					]);

					props.logSystem();
				}}
			>
				<i class="fa-solid fa-plus" />
			</div>
			{/* <div class="buttons">
      <button
        class='btn btn-default'
        onClick={() => {
          props.setSystem('rows', (prev:any) => [
            ...prev.slice(0, props.index),
            { width: 1, sequence:[] },
            ...prev.slice(props.index, prev.length),
          ])
        }}
      >
        {'Row'}
      </button>
      
      </div> */}
		</div>
	);
}
