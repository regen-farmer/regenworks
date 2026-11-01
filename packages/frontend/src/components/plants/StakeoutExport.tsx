// "Stake-out files (RTK)": one zip with Trimble-ready grid coordinates, row
// lines, DXF, check KML and a summary, named <prefix>R<row>T<tree>.
// Grove users only for now. See packages/modelling/planting/stakeout.ts.
import { cleanPrefix, stakeoutFiles } from "@rw/modelling/planting/stakeout.ts";
import { zipTextFiles } from "@rw/modelling/planting/zip.ts";
import { createSignal, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { apiFetch } from "~/util/apiFetch.ts";

type Preview = {
  treeMarkerArray: any[];
  plantNames?: { varieties: Record<string, string>; rootstocks: Record<string, string> };
};

/** "Mark 1 Hassel" -> "M1H": first character of each word, letters and digits only. */
export function defaultPrefix(fieldName: string | undefined): string {
  return cleanPrefix(
    (fieldName ?? "")
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase())
      .join(""),
  ).slice(0, 4);
}

const storageKey = (projectId: string) => `stakeout-prefix:${projectId}`;

export function StakeoutExport(props: { projectId: string; fieldName?: string; scenarioName?: string }) {
  const stored = (() => {
    try {
      return localStorage.getItem(storageKey(props.projectId));
    } catch {
      return null;
    }
  })();
  const [prefix, setPrefix] = createSignal(stored ?? defaultPrefix(props.fieldName));
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
        labelOf: (t) => {
          const species = t.species?.nameCommon ?? "Tree";
          const cultivar = t.variety ? names.varieties[t.variety] : undefined;
          const rootstock = t.rootstock ? names.rootstocks[t.rootstock] : undefined;
          let label = cultivar ? `${species} ${cultivar}` : species;
          if (rootstock) label += ` on ${rootstock}`;
          else if (t.ownRoots) label += " own roots";
          if (t.organic === true) label += " (organic)";
          return { label, species };
        },
      });

      const blob = new Blob([zipTextFiles(out.files)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem.replace(/[\\/:*?"<>|]+/g, "_")} - stake-out.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setResult(
        `${out.trees} trees in ${out.rows} rows, ${cleanPrefix(prefix())}R01T001 onwards. ` +
          `mm rounding check ${out.roundTripMm.toFixed(2)} mm.`,
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
        Zip with Trimble CSV (ETRS89 / UTM 32N, mm), row start/end points, DXF, check KML and a
        summary. Stakes are named {cleanPrefix(prefix()) || "?"}R&lt;row&gt;T&lt;tree&gt;. Use a
        different prefix for each field, so fields loaded into one controller job never share
        names. Don't mix files from this button and the old KML converter for one field.
      </p>
      <Show when={result()}>
        <p class="text-xs">{result()}</p>
      </Show>
    </div>
  );
}
