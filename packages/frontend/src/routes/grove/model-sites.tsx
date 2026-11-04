// Library → Model sites: agroforestry systems, orchards and trials for Grove's landscape
// model (grove-twin). Paste coordinates into a batch (e.g. from the EURAF agroforestry map),
// click a site to fly there, then pick its fields from the field map or draw the outline,
// add the layout (species, row direction, alley width, planting year) and save. grove-data's
// jobs read the traced sites and fetch their satellite, weather, soil and terrain records.
// Grove team only; the backend enforces it on every /internal/model-sites route.
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { createFileRoute } from "@tanstack/solid-router";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import maplibregl, { type IControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { isGroveTeam } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";
import { maplibreCompatibleStyles } from "~/util/map_controls/useDrawControl.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

type Outline = Polygon | MultiPolygon;
type Site = {
  _id: string;
  name: string;
  batch: string;
  status: "queued" | "traced" | "skipped";
  source?: string;
  lon: number;
  lat: number;
  geometry?: Outline;
  fieldIds?: string[];
  system?: string;
  species?: string[];
  rowBearingDeg?: number | null;
  alleyWidthM?: number | null;
  inRowSpacingM?: number | null;
  plantedYear?: number | null;
  notes?: string;
};
type Data = { sites: Site[]; batches: string[] };

const SYSTEMS: [string, string][] = [
  ["silvoarable", "Silvoarable (trees with arable crops)"],
  ["silvopasture", "Silvopasture (trees with grazing)"],
  ["agrosilvopastoral", "Agrosilvopastoral (crops and grazed clover-grass in rotation)"],
  ["orchard", "Orchard"],
  ["hedgerow", "Hedgerow"],
  ["shelterbelt", "Shelterbelt"],
  ["short-rotation", "Short-rotation coppice belts"],
  ["food-forest", "Food forest"],
  ["control", "Control: open field without trees"],
  ["other", "Other"],
];
// field-map tiles served by the app's tile server (the same as on the farm page)
const FIELD_TILESETS = ["DK_Marker_2023", "DE_Brandenburg_2025", "DE_Niedersachen_2024", "NL_brpgewaspercelen_definitief_2022", "FR_PARCELLES_GRAPHIQUES_2022", "CZ_2024_DPB", "IE_Parcels_2023", "AT_INSPIRE_FELDSTUECKE_2019_POLYGON", "FI_AgriculturalParcel_2023", "PT_Solo_2022"];
const STATUS_COLOR = { queued: "#f59e0b", traced: "#22c55e", skipped: "#94a3b8" };
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const btn = "px-2 py-1 rounded-sm border border-zinc-300 dark:border-slate-600 text-sm hover:bg-zinc-100 dark:hover:bg-slate-700 disabled:opacity-50";
const primary = "px-2 py-1 rounded-sm text-sm bg-green-700 text-white hover:bg-green-800 disabled:opacity-50";

const ha = (g?: Outline | null) => (g ? turf.area({ type: "Feature", geometry: g, properties: {} } as Feature) / 1e4 : 0);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function ModelSites() {
  const [batch, setBatch] = createSignal("");
  const [data, { refetch }] = createResource(() => apiFetch<Data>("/internal/model-sites"));
  const batches = createMemo(() => data()?.batches ?? []);
  createEffect(() => {
    if (!batch() && batches().length) setBatch(batches()[0]);
  });
  const sites = createMemo(() => (data()?.sites ?? []).filter((s) => !batch() || s.batch === batch()));
  const counts = createMemo(() => ({
    queued: sites().filter((s) => s.status === "queued").length,
    traced: sites().filter((s) => s.status === "traced").length,
    skipped: sites().filter((s) => s.status === "skipped").length,
  }));
  const [selectedId, setSelectedId] = createSignal<string>("");
  const selected = createMemo(() => sites().find((s) => s._id === selectedId()));

  // ---- renaming the batch
  const [renaming, setRenaming] = createSignal(false);
  const [renameTo, setRenameTo] = createSignal("");
  async function renameBatch() {
    const from = batch();
    const to = renameTo().trim();
    if (!from || !to || to === from) {
      setRenaming(false);
      return;
    }
    try {
      const r = await apiFetch<{ renamed: number; batch: string }>("/internal/model-sites/rename-batch", { method: "POST", body: JSON.stringify({ from, to }) });
      showToast({ title: `Renamed ${from} to ${r.batch} (${r.renamed} site${r.renamed === 1 ? "" : "s"})` });
      setRenaming(false);
      setBatch(r.batch);
      await refetch();
    } catch (e) {
      showToast({ title: "Couldn't rename the batch", description: (e as Error).message, variant: "destructive" });
    }
  }

  // ---- adding coordinates
  const [newBatch, setNewBatch] = createSignal("");
  const [paste, setPaste] = createSignal("");
  const [adding, setAdding] = createSignal(false);
  async function addSites() {
    const b = (newBatch() || batch()).trim();
    if (!b) {
      showToast({ title: "Give the batch a name first", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const r = await apiFetch<{ added: number; duplicates: number; skipped: string[] }>("/internal/model-sites/queue", {
        method: "POST",
        body: JSON.stringify({ batch: b, text: paste() }),
      });
      showToast({
        title: `Added ${r.added} site${r.added === 1 ? "" : "s"} to ${b}`,
        description: [r.duplicates ? `${r.duplicates} already in the batch` : "", r.skipped.length ? `Not read: ${r.skipped.slice(0, 3).join(" · ")}` : ""].filter(Boolean).join(". ") || undefined,
      });
      setPaste("");
      setNewBatch("");
      setBatch(b);
      await refetch();
    } catch (e) {
      showToast({ title: "Couldn't add the sites", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  // ---- the form for the selected site (text, so typing isn't interrupted)
  const [form, setForm] = createSignal<Record<string, string>>({});
  createEffect(
    on(selectedId, () => {
    const s = selected();
    if (!s) return;
    setForm({
      name: s.name,
      system: s.system ?? "",
      species: (s.species ?? []).join(", "),
      rowBearingDeg: s.rowBearingDeg?.toString() ?? "",
      alleyWidthM: s.alleyWidthM?.toString() ?? "",
      inRowSpacingM: s.inRowSpacingM?.toString() ?? "",
      plantedYear: s.plantedYear?.toString() ?? "",
      notes: s.notes ?? "",
    });
    }),
  );
  const set = (k: string) => (e: Event) => setForm({ ...form(), [k]: (e.currentTarget as HTMLInputElement).value });

  // ---- map, field picking and drawing
  let resizeObserver: ResizeObserver | undefined;
  let map: maplibregl.Map | undefined;
  let draw: MapboxDraw | undefined;
  const [mapReady, setMapReady] = createSignal(false);
  const [picking, setPicking] = createSignal(false);
  const [fieldIds, setFieldIds] = createSignal<string[]>([]);
  const [draftHa, setDraftHa] = createSignal(0);
  // the outline is only sent when it was changed here, so a save never wipes a stored one by accident
  const [outlineDirty, setOutlineDirty] = createSignal(false);

  function draftOutline(): Outline | null {
    if (!draw) return null;
    const polys = draw.getAll().features.filter((f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") as Feature<Outline>[];
    if (!polys.length) return null;
    if (polys.length === 1) return polys[0].geometry;
    const u = turf.union(turf.featureCollection(polys) as any);
    return (u?.geometry as Outline) ?? null;
  }
  const refreshDraft = () => setDraftHa(ha(draftOutline()));
  const changed = () => {
    setOutlineDirty(true);
    refreshDraft();
  };

  function addToDraft(g: Outline) {
    if (!draw) return;
    const current = draftOutline();
    let next: Outline = g;
    if (current) {
      const u = turf.union(turf.featureCollection([turf.feature(current), turf.feature(g)]) as any);
      if (u) next = u.geometry as Outline;
    }
    draw.deleteAll();
    draw.add({ type: "Feature", geometry: next, properties: {} });
    changed();
  }

  // set up the map when its box is in the page (a callback ref: the page can render before
  // the site list has loaded), and keep it sized to the box
  function initMap(el: HTMLDivElement) {
    if (map) return;
    resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(el);
    map = new maplibregl.Map({ container: el, style: GoogleSatStyle as any, center: [9.5, 56.1], zoom: 6, maxZoom: 20 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    draw = new MapboxDraw({ displayControlsDefault: false, defaultMode: "simple_select", styles: maplibreCompatibleStyles as any });
    map.addControl(draw as unknown as IControl, "top-right");
    map.on("draw.create", changed);
    map.on("draw.update", changed);
    map.on("draw.delete", changed);
    map.on("load", () => {
      const m = map!;
      m.addSource("sites", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "site-outline-fill", type: "fill", source: "sites", filter: ["==", "$type", "Polygon"], paint: { "fill-color": "#22c55e", "fill-opacity": 0.15 } });
      m.addLayer({ id: "site-outline-line", type: "line", source: "sites", filter: ["==", "$type", "Polygon"], paint: { "line-color": "#22c55e", "line-width": 2 } });
      m.addLayer({
        id: "site-points",
        type: "circle",
        source: "sites",
        filter: ["==", "$type", "Point"],
        paint: { "circle-radius": ["case", ["get", "selected"], 9, 6], "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
      });
      m.on("click", "site-points", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) choose(id);
      });
      for (const t of FIELD_TILESETS) {
        m.addSource(`${t}_ms`, { type: "vector", url: `https://martin-lpis.onrender.com/${t}`, promoteId: { fields: "AutoID" } as any });
        m.addLayer({ id: `${t}_ms_fill`, type: "fill", source: `${t}_ms`, "source-layer": "fields", layout: { visibility: "none" }, paint: { "fill-color": "rgba(255, 248, 97, 0.25)" } });
        m.addLayer({ id: `${t}_ms_line`, type: "line", source: `${t}_ms`, "source-layer": "fields", layout: { visibility: "none" }, paint: { "line-color": "#facc15", "line-width": 1 } });
        m.on("click", `${t}_ms_fill`, (e) => {
          if (!picking()) return;
          const id = e.features?.[0]?.properties?.AutoID;
          if (id === undefined) return;
          // a field cut by tile edges comes back in pieces: join them
          const parts = m.querySourceFeatures(`${t}_ms`, { sourceLayer: "fields" }).filter((f) => f.properties?.AutoID === id);
          if (!parts.length) return;
          const pieces = parts.map((p) => turf.feature(p.geometry as Outline));
          const joined = pieces.length > 1 ? turf.union(turf.featureCollection(pieces) as any) : pieces[0];
          const geom = joined?.geometry as Outline | undefined;
          if (!geom) return;
          addToDraft(geom);
          const key = `${t}:${id}`;
          if (!fieldIds().includes(key)) setFieldIds([...fieldIds(), key]);
        });
      }
      setMapReady(true);
      m.resize();
    });
    map.on("error", (e) => console.error("model sites map:", e?.error ?? e));
  }
  onCleanup(() => {
    resizeObserver?.disconnect();
    map?.remove();
  });

  // show the field map while picking
  createEffect(() => {
    if (!mapReady() || !map) return;
    const v = picking() ? "visible" : "none";
    for (const t of FIELD_TILESETS) {
      map.setLayoutProperty(`${t}_ms_fill`, "visibility", v);
      map.setLayoutProperty(`${t}_ms_line`, "visibility", v);
    }
    map.getCanvas().style.cursor = picking() ? "pointer" : "";
  });

  // the batch on the map: points coloured by status, saved outlines
  createEffect(() => {
    if (!mapReady() || !map) return;
    const features: any[] = [];
    for (const s of sites()) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { id: s._id, color: STATUS_COLOR[s.status], selected: s._id === selectedId() } });
      if (s.geometry && s._id !== selectedId()) features.push({ type: "Feature", geometry: s.geometry, properties: { id: s._id } });
    }
    (map.getSource("sites") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  });

  function choose(id: string) {
    setSelectedId(id);
    setPicking(false);
  }

  // load the chosen site's outline into the drawing layer once the map is ready
  createEffect(
    on([selectedId, mapReady], () => {
      const s = sites().find((x) => x._id === selectedId());
      if (!s || !mapReady() || !map || !draw) return;
      draw.deleteAll();
      if (s.geometry) {
        draw.add({ type: "Feature", geometry: s.geometry, properties: {} });
        const b = turf.bbox(turf.feature(s.geometry));
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 80, maxZoom: 18, duration: 600 });
      } else {
        map.flyTo({ center: [s.lon, s.lat], zoom: 16, duration: 600 });
      }
      setFieldIds(s.fieldIds ?? []);
      setOutlineDirty(false);
      refreshDraft();
    }),
  );

  function next() {
    const list = sites();
    const i = list.findIndex((s) => s._id === selectedId());
    const after = list.slice(i + 1).find((s) => s.status === "queued") ?? list.find((s) => s.status === "queued");
    if (after) choose(after._id);
  }

  const [saving, setSaving] = createSignal(false);
  async function save(status?: Site["status"]) {
    const s = selected();
    if (!s) return;
    const f = form();
    const outline = draftOutline();
    const numbers: Record<string, number | null> = {};
    for (const k of ["rowBearingDeg", "alleyWidthM", "inRowSpacingM", "plantedYear"]) {
      const v = numOrNull(f[k] ?? "");
      if (v !== null && !Number.isFinite(v)) {
        showToast({ title: `Check the number in "${k === "rowBearingDeg" ? "row direction" : k === "alleyWidthM" ? "alley width" : k === "inRowSpacingM" ? "in-row spacing" : "planted"}"`, variant: "destructive" });
        return;
      }
      numbers[k] = v;
    }
    const body: Record<string, unknown> = { name: f.name, system: f.system || null, species: f.species, ...numbers, notes: f.notes };
    if (outlineDirty()) {
      // rounded to ~1 cm: keeps the request small
      body.geometry = outline ? turf.truncate(turf.feature(outline), { precision: 7, coordinates: 2 }).geometry : null;
      body.fieldIds = fieldIds();
      if (!outline && !status) body.status = "queued";
    }
    if (status) body.status = status;
    setSaving(true);
    try {
      await apiFetch(`/internal/model-sites/${s._id}`, { method: "PUT", body: JSON.stringify(body) });
      showToast({ title: status === "skipped" ? `Skipped ${f.name}` : outline ? `Saved ${f.name} (${ha(outline).toFixed(1)} ha)` : `Saved ${f.name} (no outline yet)` });
      setOutlineDirty(false);
      await refetch();
      if (status === "skipped" || outline) next();
    } catch (e) {
      showToast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const [confirmRemove, setConfirmRemove] = createSignal(false);
  async function remove() {
    const s = selected();
    if (!s) return;
    if (!confirmRemove()) {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 4000);
      return;
    }
    setConfirmRemove(false);
    try {
      await apiFetch(`/internal/model-sites/${s._id}`, { method: "DELETE" });
      setSelectedId("");
      draw?.deleteAll();
      await refetch();
    } catch (e) {
      showToast({ title: "Couldn't remove the site", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div class="flex flex-col md:flex-row h-[calc(100vh-4rem)]" data-testid="grove-model-sites">
      <Toaster />
      <aside class="md:w-96 shrink-0 overflow-y-auto p-3 flex flex-col gap-3 border-r border-zinc-300 dark:border-slate-600">
        <div>
          <h1 class="text-xl font-bold">Model sites</h1>
          <p class="text-sm opacity-80">Systems for the landscape model. Add coordinates, click a site, pick its fields or draw it, add the layout, save.</p>
        </div>
        <Show when={!isGroveTeam()}>
          <p class="text-sm">This page is for the Grove team.</p>
        </Show>
        <label class="flex flex-col gap-1 text-sm">
          Batch
          <select class={input} value={batch()} onChange={(e) => { setBatch(e.currentTarget.value); setSelectedId(""); }}>
            <For each={batches()}>{(b) => <option value={b}>{b}</option>}</For>
            <Show when={!batches().length}>
              <option value="">No batches yet</option>
            </Show>
          </select>
        </label>
        <Show
          when={renaming()}
          fallback={
            <Show when={batch()}>
              <button class={`${btn} self-start text-xs`} onClick={() => { setRenameTo(batch()); setRenaming(true); }}>
                Rename batch
              </button>
            </Show>
          }
        >
          <div class="flex gap-1">
            <input class={input} value={renameTo()} onInput={(e) => setRenameTo(e.currentTarget.value)} id="model-sites-rename" />
            <button class={primary} onClick={renameBatch}>Rename</button>
            <button class={btn} onClick={() => setRenaming(false)}>Cancel</button>
          </div>
        </Show>
        <div class="text-xs flex gap-3">
          <span style={{ color: STATUS_COLOR.queued }}>● {counts().queued} to trace</span>
          <span style={{ color: STATUS_COLOR.traced }}>● {counts().traced} traced</span>
          <span style={{ color: STATUS_COLOR.skipped }}>● {counts().skipped} skipped</span>
        </div>

        <details class="rounded-md border border-zinc-300 dark:border-slate-600 p-2" open={!batches().length}>
          <summary class="text-sm font-semibold cursor-pointer">Add sites</summary>
          <div class="flex flex-col gap-2 mt-2">
            <label class="text-sm flex flex-col gap-1">
              Batch (new or existing)
              <input class={input} value={newBatch()} placeholder={batch() || "e.g. EURAF Germany"} onInput={(e) => setNewBatch(e.currentTarget.value)} id="model-sites-new-batch" />
            </label>
            <label class="text-sm flex flex-col gap-1">
              One site per line: latitude, longitude, then a name
              <textarea class={`${input} h-28 font-mono`} value={paste()} onInput={(e) => setPaste(e.currentTarget.value)} id="model-sites-paste" placeholder={"55.672643, 12.294337 Taastrup\n56.303055, 8.512583 Hestbjerg 1"} />
            </label>
            <button class={primary} disabled={adding() || !paste().trim()} onClick={addSites}>
              {adding() ? "Adding…" : "Add to batch"}
            </button>
          </div>
        </details>

        <Show when={data.loading}>
          <p class="text-sm opacity-70">Loading…</p>
        </Show>
        <Show when={data.error}>
          <p class="text-sm text-red-600">Couldn't load the sites: {(data.error as Error)?.message}</p>
        </Show>
        <ul class="flex flex-col text-sm">
          <For each={sites()}>
            {(s) => (
              <li>
                <button
                  class={`w-full text-left px-2 py-1 rounded-sm flex items-center gap-2 ${s._id === selectedId() ? "bg-zinc-200 dark:bg-slate-700" : "hover:bg-zinc-100 dark:hover:bg-slate-800"}`}
                  onClick={() => choose(s._id)}
                >
                  <span style={{ color: STATUS_COLOR[s.status] }}>●</span>
                  <span class="truncate flex-1">{s.name}</span>
                  <Show when={s.geometry}>
                    <span class="text-xs opacity-70 tabular-nums">{ha(s.geometry).toFixed(1)} ha</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
      </aside>

      <main class="flex-1 relative min-h-[60vh]">
        {/* maplibre's own CSS sets its container to position: relative, which beats Tailwind's
            "absolute"; so the map fills a positioned wrapper instead of being positioned itself */}
        <div class="absolute inset-0">
          <div ref={(node) => queueMicrotask(() => initMap(node))} class="w-full h-full" />
        </div>
        <Show when={selected()}>
          <section class="absolute left-3 top-3 w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-md bg-white/95 dark:bg-slate-900/95 shadow p-3 flex flex-col gap-2 text-sm">
            <div class="flex items-center gap-2">
              <input class={`${input} font-semibold`} value={form().name ?? ""} onInput={set("name")} id="model-site-name" />
            </div>
            <div class="flex flex-wrap gap-1">
              <button class={picking() ? primary : btn} onClick={() => setPicking(!picking())}>
                {picking() ? "Picking fields: click on the map" : "Pick fields"}
              </button>
              <button class={btn} onClick={() => { setPicking(false); draw?.changeMode("draw_polygon"); }}>Draw</button>
              <button class={btn} onClick={() => { draw?.deleteAll(); setFieldIds([]); changed(); }}>Clear outline</button>
            </div>
            <p class="text-xs opacity-80">
              {draftHa() ? `Outline: ${draftHa().toFixed(2)} ha${fieldIds().length ? ` from ${fieldIds().length} field${fieldIds().length === 1 ? "" : "s"}` : ""}. Click it to edit corners.` : "No outline yet."}
            </p>
            <label class="flex flex-col gap-1">
              System
              <select class={input} value={form().system ?? ""} onChange={set("system")} id="model-site-system">
                <option value="">–</option>
                <For each={SYSTEMS}>{([v, l]) => <option value={v}>{l}</option>}</For>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              Trees (species, comma separated)
              <input class={input} value={form().species ?? ""} onInput={set("species")} placeholder="Poplar, Willow" id="model-site-species" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="flex flex-col gap-1">
                Row direction (° from north)
                <input class={input} inputmode="decimal" value={form().rowBearingDeg ?? ""} onInput={set("rowBearingDeg")} placeholder="0–180" id="model-site-bearing" />
              </label>
              <label class="flex flex-col gap-1">
                Planted (year)
                <input class={input} inputmode="numeric" value={form().plantedYear ?? ""} onInput={set("plantedYear")} id="model-site-planted" />
              </label>
              <label class="flex flex-col gap-1">
                Alley width (m)
                <input class={input} inputmode="decimal" value={form().alleyWidthM ?? ""} onInput={set("alleyWidthM")} id="model-site-alley" />
              </label>
              <label class="flex flex-col gap-1">
                In-row spacing (m)
                <input class={input} inputmode="decimal" value={form().inRowSpacingM ?? ""} onInput={set("inRowSpacingM")} id="model-site-spacing" />
              </label>
            </div>
            <label class="flex flex-col gap-1">
              Notes
              <textarea class={`${input} h-16`} value={form().notes ?? ""} onInput={set("notes")} placeholder="Data available, management, who to ask (no personal details)" id="model-site-notes" />
            </label>
            <div class="flex flex-wrap gap-1 justify-between">
              <button class={primary} disabled={saving()} onClick={() => save()}>
                {saving() ? "Saving…" : draftHa() ? "Save and next" : "Save"}
              </button>
              <button class={btn} disabled={saving()} onClick={() => save("skipped")}>Skip</button>
              <button class={btn} onClick={remove}>{confirmRemove() ? "Click again to remove" : "Remove"}</button>
            </div>
          </section>
        </Show>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/grove/model-sites")({ component: ModelSites });
