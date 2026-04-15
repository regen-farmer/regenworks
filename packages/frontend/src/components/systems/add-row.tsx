import "./add-row.css";
import type { ISpeciesSchema } from "@rw/db/schemas/species";

export interface IRow {
  sequence: {
    species: ISpeciesSchema | string;
    spacingAfter: number;
  }[];
  offset?: {
    before?: number;
    after?: number;
  };
  groundcover?: ISpeciesSchema;
  width: number;
}

export function AddRow(props: {
  ping: boolean;
  index: number;
  setSystem: any;
  logSystem: any;
  disabled?: boolean;
}) {
  return (
    <div class="trigger">
      <div
        class={`rounded-sm p-1 my-2 btn-default ${props.ping ? "animate-bounce" : ""} ${props.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => {
          if (props.disabled) return;
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
