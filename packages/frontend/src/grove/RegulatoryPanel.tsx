// Regulatory map layers on B's screening page (Grove team only, 22 Nov 2026): protected nature,
// protection lines, conservation orders, ancient monuments, Natura 2000, dikes and drinking-water areas
// from Danish open data, as map layers and as "on the field / X m away / clear" next to the checklist
// items they answer. The map tiles come straight from the public services; nothing is saved.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { apiFetch } from "~/util/apiFetch.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

type Field = { _id: string; name: string; size?: number; geometry: any };
type RegLayer = { id: string; title: string; checklist: string | null; colour: string; tiles: string; note?: string };
type RegResult = { id: string; title: string; checklist: string | null; status: "inside" | "near" | "clear" | "unavailable"; distanceM: number | null; count: number; note?: string; error?: string };
type Check = { field: { _id: string; name: string }; near_m: number; checkedAt: string; results: RegResult[]; checklist: Record<string, string> };

const CHECKLIST: Record<string, string> = {
  "regulatory-p3": "§3 protected nature",
  "regulatory-p15": "§15 beach protection line",
  "regulatory-p16": "§16 lake and river protection line",
  "regulatory-p17": "§17 forest building line",
  "regulatory-p18": "§18 ancient monument protection line",
  "regulatory-p19": "§19 church protection line",
  "regulatory-fredning": "Fredninger and Natura 2000",
  "landscape-features": "Stone and earth dikes",
};
const tone = (s: RegResult["status"]) => (s === "inside" ? "bg-red-700 text-white" : s === "near" ? "bg-amber-600 text-white" : s === "clear" ? "bg-emerald-700 text-white" : "bg-zinc-500 text-white");
const word = (r: RegResult) => (r.status === "inside" ? "on the field" : r.status === "near" ? `${r.distanceM} m away` : r.status === "clear" ? "clear" : "couldn't be checked");

function RegMap(props: { outline: () => any; layers: () => RegLayer[]; on: () => Set<string> }) {
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
  // the public WMS layers, shown or hidden
  createEffect(() => {
    if (!ready() || !map) return;
    const m = map;
    for (const l of props.layers()) {
      const id = `reg-${l.id}`;
      if (!m.getSource(id)) {
        m.addSource(id, { type: "raster", tiles: [l.tiles], tileSize: 256, minzoom: 10, attribution: "© Danmarks Miljøportal, Slots- og Kulturstyrelsen" });
        m.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.75 } });
      }
      m.setLayoutProperty(id, "visibility", props.on().has(l.id) ? "visible" : "none");
    }
    if (m.getLayer("reg-field")) m.moveLayer("reg-field");
  });
  createEffect(() => {
    const o = props.outline();
    if (!ready() || !map) return;
    const m = map;
    const data = o ? { type: "Feature", properties: {}, geometry: o } : { type: "FeatureCollection", features: [] };
    if (m.getSource("reg-field")) (m.getSource("reg-field") as maplibregl.GeoJSONSource).setData(data as any);
    else {
      m.addSource("reg-field", { type: "geojson", data: data as any });
      m.addLayer({ id: "reg-field", type: "line", source: "reg-field", paint: { "line-color": "#00a0ff", "line-width": 2 } });
    }
    const pts: [number, number][] = [];
    const walk = (c: any): void => (typeof c?.[0] === "number" ? void pts.push(c as [number, number]) : c?.forEach(walk));
    if (o) walk(o.coordinates);
    if (pts.length) {
      const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      // show the field with its surroundings, where the protection lines reach in
      m.fitBounds(b, { padding: 60, duration: 0, maxZoom: 15.5 });
    }
  });
  return <div ref={el} style={{ height: "360px", width: "100%", position: "relative" }} class="rounded-sm overflow-hidden" />;
}

export function RegulatoryPanel(props: { projectId: string }) {
  const [fields] = createResource(
    () => props.projectId,
    (id) => apiFetch<{ fields: Field[] }>(`/internal/screening/project/${id}/fields`),
  );
  const [layers] = createResource(() => apiFetch<{ layers: RegLayer[]; near_m: number; notCovered: { checklist: string; title: string; note: string }[] }>("/internal/regulatory/layers"));
  const [fieldId, setFieldId] = createSignal("");
  createEffect(() => {
    const f = fields()?.fields;
    if (f?.length && !fieldId()) setFieldId(f[0]._id);
  });
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [check, setCheck] = createSignal<Check | null>(null);
  const [on, setOn] = createSignal<Set<string>>(new Set());
  createEffect(() => {
    fieldId();
    setCheck(null);
  });
  const outline = createMemo(() => fields()?.fields.find((f) => f._id === fieldId())?.geometry ?? null);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const c = await apiFetch<Check>(`/internal/regulatory/field/${fieldId()}`);
      setCheck(c);
      // show the layers that are on or near the field
      setOn(new Set(c.results.filter((r) => r.status === "inside" || r.status === "near").map((r) => r.id)));
    } catch (e: any) {
      setError(e?.message ?? "The check failed");
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id: string) => setOn((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <section class="flex flex-col gap-2">
      <div class="flex items-center gap-2 flex-wrap">
        <h2 class="text-xl font-semibold mr-auto">Regulatory map</h2>
        <Show when={fields()?.fields.length} fallback={<span class="text-sm opacity-70">{fields.loading ? "Loading fields…" : "Link a farm with drawn fields to this project."}</span>}>
          <select class="p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm" value={fieldId()} onChange={(e) => setFieldId(e.currentTarget.value)}>
            <For each={fields()!.fields}>{(f) => <option value={f._id}>{f.name}</option>}</For>
          </select>
          <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={busy() || !fieldId()} onClick={run}>{busy() ? "Checking…" : "Check the field"}</button>
        </Show>
      </div>
      <p class="text-xs opacity-70">
        Protected nature, protection lines, fredninger, ancient monuments, Natura 2000, dikes and drinking-water areas within {layers()?.near_m ?? 300} m of the field, from
        Danmarks Miljøportal and Slots- og Kulturstyrelsen (open data). A help for section C, not a legal answer: check with the municipality before planting where anything is found.
      </p>
      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>
      <RegMap outline={outline} layers={() => layers()?.layers ?? []} on={on} />
      <div class="flex flex-wrap gap-1 text-xs">
        <For each={layers()?.layers}>
          {(l) => (
            <button
              class="rounded-sm px-1.5 py-0.5 border"
              style={{ "border-color": l.colour, background: on().has(l.id) ? l.colour : "transparent", color: on().has(l.id) ? "white" : undefined }}
              onClick={() => toggle(l.id)}
            >
              {l.title}
            </button>
          )}
        </For>
      </div>
      <Show when={check()}>
        {(c) => (
          <div class="flex flex-col gap-1 text-sm">
            <For each={Object.keys(CHECKLIST)}>
              {(key) => {
                const rs = () => c().results.filter((r) => r.checklist === key);
                return (
                  <div class="border-t border-zinc-200 dark:border-slate-700 pt-1">
                    <b>{CHECKLIST[key]}</b>: <span class="opacity-80">{c().checklist[key]}</span>
                    <Show when={rs().length}>
                      <div class="flex flex-wrap gap-1 mt-0.5">
                        <For each={rs()}>
                          {(r) => (
                            <span class={`rounded-sm px-1.5 text-xs ${tone(r.status)}`} title={r.note ?? r.error ?? ""}>
                              {r.title}: {word(r)}
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
            <div class="border-t border-zinc-200 dark:border-slate-700 pt-1">
              <b>Drinking water</b> (no checklist item):{" "}
              <For each={c().results.filter((r) => !r.checklist)}>
                {(r) => <span class={`rounded-sm px-1.5 text-xs mr-1 ${tone(r.status)}`} title={r.note ?? ""}>{r.title}: {word(r)}</span>}
              </For>
            </div>
            <p class="text-xs opacity-60">Checked {new Date(c().checkedAt).toLocaleString("da-DK")}. Copy what applies into the checklist items on the left.</p>
          </div>
        )}
      </Show>
    </section>
  );
}
