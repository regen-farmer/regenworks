// Model screening: frost, water, waterlogging and wind for a field (project page) or for a
// scenario's design (layout page), from grove-twin's screening service via /internal/screening.
// Grove team only. Nothing is saved: the suggested decision only fills the checklist's form.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { apiFetch } from "~/util/apiFetch.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

type Decision = { topic: string; decision: string; statement: string; measure?: string; robust: boolean; range: number[] };
type Layer = { id: string; title: string; species: string | null; topic: string; png: string; corners: [number, number][]; legend: { min: number; max: number; unit: string } };
type Result = {
  site: string;
  name: string;
  field?: string;
  field_covered: number;
  species: Record<string, { overall: string; decisions: Decision[]; missing: string[] }>;
  layers: Layer[];
  notCovered?: string[];
  model: string;
};
type Field = { _id: string; name: string; size?: number; geometry: any };

// the checklist's sections the findings belong to
const SECTIONS: [string, string[]][] = [
  ["B. Landscape, climate and hydrology", ["frost", "wind", "waterlogging"]],
  ["D. Soil and water", ["water", "establishment"]],
];
const TOPIC: Record<string, string> = { frost: "Spring frost", wind: "Wind", waterlogging: "Waterlogging", water: "Drought and irrigation", establishment: "Establishment" };
const NUTS = ["walnut", "sweet chestnut", "hazel"];
const BERRIES = ["aronia", "sea buckthorn", "blackcurrant"];

const tone = (d: string) =>
  /don't plant|wrong species/.test(d) ? "bg-red-700 text-white" : /^(fine|plant into grass|no irrigation needed|no shelter row needed|plant)$/.test(d) ? "bg-emerald-700 text-white" : "bg-amber-600 text-white";

/** A suggested checklist decision from the model's findings for the species chosen. */
export function suggestDecision(r: Result, species: string[]): { result: string; conditions: string } {
  const sp = species.filter((s) => r.species[s]);
  if (!sp.length) return { result: "", conditions: "" };
  const ok = sp.filter((s) => r.species[s].overall !== "don't plant");
  if (!ok.length) return { result: "no-go", conditions: `Model screening (${r.name}): ${sp.join(", ")}: don't plant (${sp.map((s) => r.species[s].decisions.filter((d) => /don't plant|wrong species/.test(d.decision)).map((d) => TOPIC[d.topic] ?? d.topic).join(", ")).join("; ")}).` };
  const measures: string[] = [];
  for (const s of ok) for (const d of r.species[s].decisions) if (d.measure) measures.push(`${s}: ${d.measure}`);
  const dropped = sp.filter((s) => !ok.includes(s));
  const parts = [...measures, ...dropped.map((s) => `leave out ${s}`)];
  return parts.length ? { result: "go-conditions", conditions: parts.join("; ") } : { result: "go", conditions: "" };
}

function MiniMap(props: { layer: () => Layer | undefined; outline: () => any }) {
  let el!: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  const [ready, setReady] = createSignal(false);
  createEffect(() => {
    if (map) return;
    map = new maplibregl.Map({ container: el, style: GoogleSatStyle as any, center: [9.5, 56.1], zoom: 6, maxZoom: 19 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setReady(true));
  });
  onCleanup(() => map?.remove());
  createEffect(() => {
    const l = props.layer();
    const o = props.outline();
    if (!ready() || !map) return;
    const m = map;
    if (m.getLayer("screen-img")) m.removeLayer("screen-img");
    if (m.getSource("screen-img")) m.removeSource("screen-img");
    if (l) {
      m.addSource("screen-img", { type: "image", url: l.png, coordinates: l.corners as any });
      m.addLayer({ id: "screen-img", type: "raster", source: "screen-img", paint: { "raster-opacity": 0.85, "raster-resampling": "nearest" } });
    }
    const data = o ? { type: "Feature", properties: {}, geometry: o } : { type: "FeatureCollection", features: [] };
    if (m.getSource("screen-field")) (m.getSource("screen-field") as maplibregl.GeoJSONSource).setData(data as any);
    else {
      m.addSource("screen-field", { type: "geojson", data: data as any });
      m.addLayer({ id: "screen-field", type: "line", source: "screen-field", paint: { "line-color": "#00a0ff", "line-width": 2 } });
    }
    if (m.getLayer("screen-field")) m.moveLayer("screen-field");
    const pts: [number, number][] = l ? l.corners : [];
    if (o) {
      const walk = (c: any): void => (typeof c?.[0] === "number" ? void pts.push(c as [number, number]) : c?.forEach(walk));
      walk(o.coordinates);
    }
    if (pts.length) {
      const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      m.fitBounds(b, { padding: 20, duration: 0, maxZoom: 17 });
    }
  });
  // maplibre's own CSS sets position: relative on the container; keep an explicit height
  return <div ref={el} style={{ height: "360px", width: "100%", position: "relative" }} class="rounded-sm overflow-hidden" />;
}

export function ScreeningModel(props: { projectId?: string; scenarioId?: string; onSuggestion?: (s: { result: string; conditions: string }) => void }) {
  const [fields] = createResource(
    () => props.projectId,
    (id) => apiFetch<{ farm: { name: string } | null; fields: Field[]; configured: boolean }>(`/internal/screening/project/${id}/fields`),
  );
  const [fieldId, setFieldId] = createSignal<string>("");
  createEffect(() => {
    const f = fields()?.fields;
    if (f?.length && !fieldId()) setFieldId(f[0]._id);
  });
  const [group, setGroup] = createSignal<"nuts" | "berries">("nuts");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [result, setResult] = createSignal<Result | null>(null);
  const [species, setSpecies] = createSignal<string>("");
  const [layerId, setLayerId] = createSignal<string>("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const body = props.scenarioId ? { scenarioId: props.scenarioId } : { fieldId: fieldId(), species: group() === "nuts" ? NUTS : BERRIES };
      const r = await apiFetch<Result>("/internal/screening/run", { method: "POST", body: JSON.stringify(body) });
      setResult(r);
      const first = Object.keys(r.species)[0] ?? "";
      setSpecies(first);
      setLayerId(r.layers.find((l) => l.species === first)?.id ?? r.layers[0]?.id ?? "");
    } catch (e: any) {
      setResult(null);
      setError(e?.message ?? "Screening failed");
    } finally {
      setBusy(false);
    }
  }

  const outline = createMemo(() => fields()?.fields.find((f) => f._id === fieldId())?.geometry ?? null);
  const layer = createMemo(() => result()?.layers.find((l) => l.id === layerId()));
  const speciesLayers = createMemo(() => (result()?.layers ?? []).filter((l) => l.species === species() || l.species === null));
  const findings = (topics: string[]) => (result()?.species[species()]?.decisions ?? []).filter((d) => topics.includes(d.topic));

  return (
    <section class="flex flex-col gap-2">
      <div class="flex items-center gap-2 flex-wrap">
        <h2 class="text-xl font-semibold mr-auto">Model screening</h2>
        <Show when={props.projectId}>
          <Show when={fields()?.fields.length} fallback={<span class="text-sm opacity-70">{fields.loading ? "Loading fields…" : "Link a farm with drawn fields to this project to screen them."}</span>}>
            <select class="p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm" value={fieldId()} onChange={(e) => setFieldId(e.currentTarget.value)}>
              <For each={fields()!.fields}>{(f) => <option value={f._id}>{f.name}{f.size ? ` (${Number(f.size).toFixed(1)} ha)` : ""}</option>}</For>
            </select>
            <select class="p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm" value={group()} onChange={(e) => setGroup(e.currentTarget.value as any)}>
              <option value="nuts">Nut trees</option>
              <option value="berries">Berry shrubs</option>
            </select>
          </Show>
        </Show>
        <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={busy() || (!!props.projectId && !fieldId())} onClick={run}>
          {busy() ? "Screening…" : props.scenarioId ? "Screen this design" : "Run screening"}
        </button>
      </div>
      <p class="text-xs opacity-70">
        Frost, drought, establishment, waterlogging and wind for young trees, with Grove's thresholds. Nothing is saved.
        {props.scenarioId ? " Uses the trees in this design; the design's own rows as shelter come with the next model step." : ""}
      </p>
      <Show when={fields()?.configured === false && props.projectId}>
        <p class="text-sm text-amber-600">The screening service isn't set up on this server yet.</p>
      </Show>
      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>
      <Show when={result()}>
        {(r) => (
          <div class="flex flex-col gap-2">
            <p class="text-sm">
              Screened as <b>{r().name}</b>
              {r().field_covered < 0.95 ? ` (covers ${Math.round(r().field_covered * 100)}% of the field)` : ""}.
              <Show when={r().notCovered?.length}> Not in the model yet: {r().notCovered!.join(", ")}.</Show>
            </p>
            <div class="flex gap-1 flex-wrap">
              <For each={Object.entries(r().species)}>
                {([sp, v]) => (
                  <button
                    class="rounded-sm px-2 py-0.5 text-sm border"
                    classList={{ "border-sky-500": species() === sp, "border-transparent opacity-80": species() !== sp }}
                    onClick={() => {
                      setSpecies(sp);
                      setLayerId(r().layers.find((l) => l.species === sp && l.topic === layer()?.topic)?.id ?? r().layers.find((l) => l.species === sp)?.id ?? layerId());
                    }}
                  >
                    {sp} <span class={`rounded-sm px-1 text-xs ${tone(v.overall)}`}>{v.overall}</span>
                  </button>
                )}
              </For>
            </div>
            <div class="flex gap-1 flex-wrap text-xs">
              <For each={speciesLayers()}>
                {(l) => (
                  <label class="flex items-center gap-1 rounded-sm px-1 border border-zinc-300 dark:border-slate-600">
                    <input type="radio" name="screen-layer" checked={layerId() === l.id} onChange={() => setLayerId(l.id)} />
                    {l.title.split(":")[0]}
                  </label>
                )}
              </For>
            </div>
            <MiniMap layer={layer} outline={outline} />
            <Show when={layer()}>
              <p class="text-xs opacity-70">{layer()!.title}: light {layer()!.legend.min} → dark {layer()!.legend.max} ({layer()!.legend.unit}).</p>
            </Show>
            <For each={SECTIONS}>
              {([title, topics]) => (
                <div class="border border-zinc-300 dark:border-slate-600 rounded-sm p-2 flex flex-col gap-1">
                  <h3 class="font-semibold text-sm">{title}</h3>
                  <For each={findings(topics)} fallback={<p class="text-xs opacity-70">No model findings for this section.</p>}>
                    {(d) => (
                      <div class="text-sm">
                        <span class="font-semibold">{TOPIC[d.topic] ?? d.topic}: </span>
                        <span class={`rounded-sm px-1 text-xs ${tone(d.decision)}`}>{d.decision}</span>
                        <Show when={!d.robust}>
                          <span class="text-xs opacity-70"> (close to the threshold: could go either way)</span>
                        </Show>
                        <div class="text-xs opacity-90">{d.statement}</div>
                        <Show when={d.measure}>
                          <div class="text-xs">Measure: {d.measure}</div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
            <Show when={props.onSuggestion}>
              <button class="rounded-sm px-2 py-1 btn-default text-sm self-start" onClick={() => props.onSuggestion!(suggestDecision(r(), Object.keys(r().species)))}>
                Use as suggested decision (fills the checklist; you save it)
              </button>
            </Show>
            <p class="text-xs opacity-60">{r().model}</p>
          </div>
        )}
      </Show>
    </section>
  );
}
