import { For, Show } from "solid-js";
import type { GridCorner, IGridSettings, ILayoutSettings } from "@rw/db/schemas/systemdesign.ts";

/**
 * Layout tool for a design: straight rows (the original row layout) or a
 * grid (its own layout model: one fixed lattice, trees at right angles across
 * the rows). Free lines and contour are shown as coming.
 *
 * The rows below the panel stay the same in both tools. In the grid they are
 * the pattern: row widths repeat across the field, each row's sequence
 * repeats along it.
 */
export function LayoutToolPanel(props: {
  layout: ILayoutSettings | null | undefined;
  /** Replace the design's layout settings. */
  setLayout: (layout: ILayoutSettings) => void;
  /** The anchor the grid actually used in the last preview, [lng, lat]. */
  effectiveAnchor?: [number, number];
  /** Spacing along each design row in the last preview (m). */
  periods?: number[];
  rowWidths: number[];
  picking: boolean;
  onPickAnchor: () => void;
  /** A preview is being made: the anchor shown may be about to change. */
  busy?: boolean;
  disabled?: boolean;
}) {
  const mode = () => props.layout?.mode ?? "rows";
  const grid = (): IGridSettings => props.layout?.grid ?? {};
  const locked = () => grid().locked === true;

  const setGrid = (patch: Partial<IGridSettings>) =>
    props.setLayout({ mode: "grid", grid: { ...grid(), ...patch } });

  const num = (value: string): number | null => {
    if (value.trim() === "") return null;
    const n = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const notSquare = () => {
    const widths = props.rowWidths.filter((w) => w > 0);
    const periods = (props.periods ?? []).filter((p) => p > 0);
    if (!widths.length || !periods.length) return false;
    return widths.some((w) => periods.some((p) => Math.abs(w - p) > 0.01));
  };

  const tools: { id: string; label: string; ready: boolean }[] = [
    { id: "rows", label: "Straight rows", ready: true },
    { id: "grid", label: "Grid", ready: true },
    { id: "free", label: "Free lines", ready: false },
    { id: "contour", label: "Contour", ready: false },
  ];

  const corners: { id: GridCorner; label: string }[] = [
    { id: "start-left", label: "Start, left side" },
    { id: "start-right", label: "Start, right side" },
    { id: "end-left", label: "End, left side" },
    { id: "end-right", label: "End, right side" },
  ];

  const inputClass =
    "form-control p-1 rounded-sm w-20 border border-zinc-300 dark:border-slate-600 dark:bg-customdark1";

  return (
    <div class="m-2 p-2 rounded-sm border border-zinc-300 dark:border-slate-600 text-sm">
      <div class="flex flex-wrap items-center gap-1">
        <span class="font-semibold mr-2">Layout tool</span>
        <For each={tools}>
          {(tool) => (
            <button
              type="button"
              class="rounded-sm px-2 py-1 border border-zinc-300 dark:border-slate-600"
              classList={{
                "bg-zinc-800 text-white dark:bg-white dark:text-black": mode() === tool.id,
                "opacity-50 cursor-not-allowed": !tool.ready || props.disabled,
              }}
              disabled={!tool.ready || props.disabled}
              title={tool.ready ? undefined : "Coming"}
              onClick={() => {
                if (tool.id === "rows") props.setLayout({ mode: "rows", grid: props.layout?.grid ?? null });
                if (tool.id === "grid") props.setLayout({ mode: "grid", grid: grid() });
              }}
            >
              {tool.label}
              {tool.ready ? "" : " (coming)"}
            </button>
          )}
        </For>
      </div>

      <Show when={mode() === "rows"}>
        <p class="mt-2 opacity-70">
          Each row runs from edge to edge and starts its first tree at the headland.
        </p>
      </Show>

      <Show when={mode() === "grid"}>
        <p class="mt-2 opacity-70">
          One fixed grid over the field: trees line up at right angles across the rows. The rows
          below are the pattern; their widths repeat across, each sequence repeats along.
          <Show when={notSquare()}> Spacing along ≠ row width, so the grid is right-angled, not square.</Show>
        </p>

        <div class="mt-2 grid gap-x-4 gap-y-1" style={{ "grid-template-columns": "auto auto" }}>
          <label class="leading-7">Start from</label>
          <select
            class={`${inputClass} w-44`}
            disabled={props.disabled || locked() || !!grid().anchor}
            value={grid().corner ?? "start-left"}
            onChange={(e) => setGrid({ corner: e.currentTarget.value as GridCorner })}
          >
            <For each={corners}>{(c) => <option value={c.id}>{c.label}</option>}</For>
          </select>

          <label class="leading-7">Start point</label>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded-sm px-2 py-1 btn-default"
              classList={{ "animate-pulse": props.picking }}
              disabled={props.disabled || locked()}
              onClick={props.onPickAnchor}
              title="Click on the map where the first tree of the first row should stand"
            >
              {props.picking ? "Click on the map…" : grid().anchor ? "Move on map" : "Set on map"}
            </button>
            <Show when={grid().anchor && !locked()}>
              <button
                type="button"
                class="rounded-sm px-2 py-1 btn-default"
                disabled={props.disabled}
                onClick={() => setGrid({ anchor: null })}
              >
                Use corner
              </button>
            </Show>
          </div>

          <label class="leading-7">Shift along rows (m)</label>
          <input
            type="number"
            step="0.1"
            class={inputClass}
            disabled={props.disabled || locked()}
            value={grid().shiftAlong ?? 0}
            onChange={(e) => setGrid({ shiftAlong: num(e.currentTarget.value) })}
          />

          <label class="leading-7">Shift across rows (m)</label>
          <input
            type="number"
            step="0.1"
            class={inputClass}
            disabled={props.disabled || locked()}
            value={grid().shiftAcross ?? 0}
            onChange={(e) => setGrid({ shiftAcross: num(e.currentTarget.value) })}
          />

          <label class="leading-7">Pattern</label>
          <select
            class={`${inputClass} w-44`}
            disabled={props.disabled || locked()}
            value={grid().pattern ?? "rectangular"}
            onChange={(e) =>
              setGrid({ pattern: e.currentTarget.value as "rectangular" | "offset" })
            }
          >
            <option value="rectangular">Square / rectangular</option>
            <option value="offset">Offset (triangular)</option>
          </select>

          <label class="leading-7" title="Tree rows from the start point. Blank = as many as fit">
            Number of tree rows
          </label>
          <input
            type="number"
            min={1}
            step="1"
            placeholder="all"
            class={inputClass}
            disabled={props.disabled || locked()}
            value={grid().extent?.rows ?? ""}
            onChange={(e) => {
              const n = num(e.currentTarget.value);
              setGrid({
                extent: { ...grid().extent, rows: n === null || n < 1 ? null : Math.floor(n) },
              });
            }}
          />

          <label class="leading-7" title="Measured from the start point. Blank = to the field edge">
            Row length (m)
          </label>
          <input
            type="number"
            min={0}
            step="1"
            placeholder="to edge"
            class={inputClass}
            disabled={props.disabled || locked()}
            value={grid().extent?.length ?? ""}
            onChange={(e) =>
              setGrid({
                extent: { ...grid().extent, length: num(e.currentTarget.value) },
              })
            }
          />
        </div>

        <div class="mt-2 flex items-center gap-2">
          <Show
            when={locked()}
            fallback={
              <button
                type="button"
                class="rounded-sm px-2 py-1 btn-default"
                disabled={props.disabled || props.busy || !props.effectiveAnchor}
                title="Fix the grid at its current position, so it stays put if the field or the corner changes"
                onClick={() =>
                  setGrid({
                    anchor: props.effectiveAnchor ?? null,
                    shiftAlong: null,
                    shiftAcross: null,
                    locked: true,
                  })
                }
              >
                <i class="fas fa-lock-open mr-1" /> Lock grid here
              </button>
            }
          >
            <button
              type="button"
              class="rounded-sm px-2 py-1 btn-default"
              disabled={props.disabled}
              onClick={() => setGrid({ locked: false })}
            >
              <i class="fas fa-lock mr-1" /> Locked: unlock
            </button>
          </Show>
          <Show when={!props.effectiveAnchor}>
            <span class="opacity-70">Generate a preview first.</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
