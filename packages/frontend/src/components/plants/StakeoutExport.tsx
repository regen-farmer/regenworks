// "Stake-out files (RTK)": one zip with point files in the chosen format (SITECH's
// Trimble DKTM N;E, Trimble Access UTM E,N, or lat/long), row ends, DXF, check
// KML and a summary, named <prefix>R<row>T<tree>.
// Grove users only for now. See packages/modelling/planting/stakeout.ts.
import { cleanPrefix, defaultPrefix, plantLabel, STAKEOUT_FORMATS, stakeoutFiles, type StakeoutFormatId } from "@rw/modelling/planting/stakeout.ts";
import { GRIDS, type GridId } from "@rw/modelling/planting/utm.ts";
import { zipTextFiles } from "@rw/modelling/planting/zip.ts";
import { createSignal, For, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { apiFetch } from "~/util/apiFetch.ts";

type Preview = {
  treeMarkerArray: any[];
  plantNames?: { varieties: Record<string, string>; rootstocks: Record<string, string> };
};

export { defaultPrefix };

const storageKey = (projectId: string) => `stakeout-prefix:${projectId}`;
// format, DKTM zone and row-end offset are remembered for every design (the kit is the same everywhere)
const SETTINGS_KEY = "stakeout-settings";
type Settings = { format: StakeoutFormatId; zone: GridId | "auto"; offset: string };
// SITECH's working example (11 Nov) is DKTM2; the job's zone decides, so the zone is chosen, not guessed
const DEFAULTS: Settings = { format: "trimble-dktm-ne", zone: "dktm2", offset: "1" };
const DKTM_ZONES: [GridId, string][] = [
  ["dktm1", "DKTM1 (west Jutland)"],
  ["dktm2", "DKTM2 (east Jutland, Funen)"],
  ["dktm3", "DKTM3 (Zealand)"],
  ["dktm4", "DKTM4 (Bornholm)"],
];
function loadSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return {
      format: Object.hasOwn(STAKEOUT_FORMATS, v.format) ? v.format : DEFAULTS.format,
      zone: v.zone === "auto" || DKTM_ZONES.some(([z]) => z === v.zone) ? v.zone : DEFAULTS.zone,
      offset: typeof v.offset === "string" ? v.offset : DEFAULTS.offset,
    };
  } catch {
    return DEFAULTS;
  }
}

export function StakeoutExport(props: { projectId: string; fieldName?: string; scenarioName?: string }) {
  const stored = (() => {
    try {
      return localStorage.getItem(storageKey(props.projectId));
    } catch {
      return null;
    }
  })();
  const [prefix, setPrefix] = createSignal(stored ?? defaultPrefix(props.fieldName));
  const [settings, setSettings] = createSignal<Settings>(loadSettings());
  const set = (patch: Partial<Settings>) => {
    setSettings({ ...settings(), ...patch });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings()));
    } catch {
      // only a convenience
    }
  };
  const offsetM = () => {
    const v = Number(settings().offset.replace(",", "."));
    return Number.isFinite(v) && v >= 0 && v <= 10 ? v : NaN;
  };
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<string>();

  async function exportFiles() {
    if (!cleanPrefix(prefix())) {
      showToast({
        title: "Enter a name prefix",
        description: "Without one, stakes in two fields get the same names.",
        variant: "destructive",
      });
      return;
    }
    if (Number.isNaN(offsetM())) {
      showToast({ title: "Row-end offset must be 0 to 10 m", variant: "destructive" });
      return;
    }
    setBusy(true);
    setResult(undefined);
    try {
      try {
        localStorage.setItem(storageKey(props.projectId), prefix());
      } catch {
        // remembering the prefix is only a convenience
      }
      const preview = await apiFetch<Preview>(`/projects/${props.projectId}/design-preview`);
      if (!preview?.treeMarkerArray) throw new Error("No design to export");
      const names = preview.plantNames ?? { varieties: {}, rootstocks: {} };

      const stem = [props.fieldName, props.scenarioName].filter(Boolean).join(" - ") || "design";
      const out = stakeoutFiles(preview, stem, {
        prefix: prefix(),
        source: stem,
        labelOf: (t) => plantLabel(t, names),
        format: settings().format,
        dktm: (() => {
          const z = settings().zone;
          return z === "auto" ? undefined : z;
        })(),
        rowEndOffsetM: offsetM(),
      });

      const blob = new Blob([zipTextFiles(out.files) as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem.replace(/[\\/:*?"<>|]+/g, "_")} - stake-out.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setResult(
        `${out.trees} trees in ${out.rows} rows, ${cleanPrefix(prefix())}R01T001 onwards, ` +
          `${out.grid === "latlon" ? "ETRS89 lat/long" : GRIDS[out.grid].name}` +
          (offsetM() ? `, row ends ${offsetM()} m beyond the trees` : "") +
          (out.grid === "latlon" ? "." : `. mm rounding check ${out.roundTripMm.toFixed(2)} mm.`),
      );
    } catch (err) {
      showToast({ title: (err as Error).message || "Export failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex flex-col gap-1" data-testid="stakeout-export">
      <div class="flex gap-2 items-center flex-wrap">
        <label class="text-sm flex items-center gap-1">
          Name prefix
          <input
            class="p-1 w-20 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent"
            value={prefix()}
            maxLength={8}
            onInput={(e) => setPrefix(cleanPrefix(e.currentTarget.value))}
            title="Letters in front of every stake name, e.g. B gives BR03T017 (row 3, tree 17)"
          />
        </label>
        <label class="text-sm flex items-center gap-1">
          Format
          <select
            class="p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent"
            value={settings().format}
            onChange={(e) => set({ format: e.currentTarget.value as StakeoutFormatId })}
          >
            <For each={Object.values(STAKEOUT_FORMATS)}>{(f) => <option value={f.id}>{f.label}</option>}</For>
          </select>
        </label>
        <Show when={settings().format === "trimble-dktm-ne"}>
          <label class="text-sm flex items-center gap-1">
            Zone
            <select
              class="p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent"
              value={settings().zone}
              onChange={(e) => set({ zone: e.currentTarget.value as Settings["zone"] })}
              title="Must match the coordinate system of the job on the controller"
            >
              <For each={DKTM_ZONES}>{([z, label]) => <option value={z}>{label}</option>}</For>
              <option value="auto">Nearest to the field (check the summary)</option>
            </select>
          </label>
        </Show>
        <label class="text-sm flex items-center gap-1">
          Row ends beyond trees (m)
          <input
            class="p-1 w-14 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent"
            inputMode="decimal"
            value={settings().offset}
            onInput={(e) => set({ offset: e.currentTarget.value })}
            title="Row start and end stakes this far beyond the first and last tree, on the row line, so a tiller can pass. 0 puts them on the trees."
          />
        </label>
        <button
          type="button"
          class="rounded-sm p-2 my-2 btn-default"
          onClick={exportFiles}
          disabled={busy() || !cleanPrefix(prefix())}
        >
          <i class="fas fa-location-crosshairs mr-2" />
          {busy() ? "Preparing..." : "Stake-out files (RTK)"}
        </button>
      </div>
      <p class="text-xs opacity-70">
        Zip with the trees and row start/end points in the chosen format, a DXF in the same grid, a
        check KML and a summary. SITECH's Trimble jobs take the DKTM N;E file; check the job uses the
        same DKTM zone. Stakes are named {cleanPrefix(prefix()) || "?"}R&lt;row&gt;T&lt;tree&gt;. Use a
        different prefix for each field, so fields loaded into one controller job never share
        names. Don't mix files from this button and the old KML converter for one field.
      </p>
      <Show when={result()}>
        <p class="text-xs">{result()}</p>
      </Show>
    </div>
  );
}
