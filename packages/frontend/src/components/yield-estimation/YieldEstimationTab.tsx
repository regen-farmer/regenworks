import { createQuery } from "@tanstack/solid-query";
import {
  type Component,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import { showToast } from "~/components/ui/toast";
import {
  getYieldEstimation,
  type YieldSpeciesSummary,
} from "~/util/api/yieldEstimation";

interface YieldEstimationTabProps {
  configId: string;
  configName?: string;
}

function getYieldForYear(yieldCurve: number[], year: number): number {
  if (yieldCurve.length === 0) return 0;
  const index = year - 1;
  if (index < yieldCurve.length) return yieldCurve[index] ?? 0;
  return yieldCurve[yieldCurve.length - 1] ?? 0;
}

function hasYieldData(entry: YieldSpeciesSummary): boolean {
  return entry.yieldCurve != null && entry.yieldCurve.length > 0;
}

export const YieldEstimationTab: Component<YieldEstimationTabProps> = (props) => {
  const [period, setPeriod] = createSignal(30);
  const [selectedFieldId, setSelectedFieldId] = createSignal<string | null>(null);

  // TanStack Query — keeps previous data visible during refetch automatically
  const query = createQuery(() => ({
    queryKey: ["yield-estimation", props.configId, period()],
    queryFn: () => getYieldEstimation(props.configId, period()),
    placeholderData: (prev: any) => prev, // keep previous data while fetching new
    staleTime: 60_000,
  }));

  const latestData = () => query.data ?? null;

  // Derive display data based on selected field
  const displaySpecies = createMemo((): YieldSpeciesSummary[] => {
    const data = latestData();
    if (!data) return [];

    const fieldId = selectedFieldId();
    if (!fieldId) return data.speciesSummary;

    const field = data.fieldSummary.find((f: any) => f.field._id === fieldId);
    if (!field) return [];

    return field.species
      .map((fieldSp: any) => {
        const fullSummary = data.speciesSummary.find(
          (s: any) => s.species._id === fieldSp.speciesId,
        );
        if (!fullSummary) return null;

        const yieldCurve = fullSummary.yieldCurve;
        const count = fieldSp.count;

        let totalProduction = 0;
        for (let year = 1; year <= data.period; year++) {
          totalProduction += count * getYieldForYear(yieldCurve, year);
        }

        return {
          ...fullSummary,
          count,
          annualProductionAtMaturity: fieldSp.annualProductionAtMaturity,
          totalProductionOverPeriod: totalProduction,
        } as YieldSpeciesSummary;
      })
      .filter((s: any): s is YieldSpeciesSummary => s !== null);
  });

  const speciesWithoutData = createMemo(() => displaySpecies().filter((s) => !hasYieldData(s)));


  const handleExportCSV = async () => {
    const species = displaySpecies();
    const p = latestData()?.period ?? period();
    if (species.length === 0) return;

    const years = Array.from({ length: p }, (_, i) => i + 1);
    const header = ["Species", "Count", ...years].join(",");
    const rows = species.map((entry) => {
      const cells = years.map((year) => {
        if (!hasYieldData(entry)) return "";
        const v = getYieldForYear(entry.yieldCurve, year) ?? 0;
        return v % 1 === 0 ? String(v) : v.toFixed(1);
      });
      return [`"${entry.species.nameCommon}"`, entry.count, ...cells].join(",");
    });
    const csv = [header, ...rows].join("\n");

    try {
      if ((window as any).electronAPI?.saveFile) {
        const saved = await (window as any).electronAPI.saveFile("yield-estimation.csv", csv);
        if (saved) {
          showToast({ title: "Exported", description: "CSV saved.", variant: "success" });
        }
      } else {
        // Browser fallback
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "yield-estimation.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast({ title: "Exported", description: "CSV downloaded.", variant: "success" });
      }
    } catch (error: any) {
      showToast({ title: "Export failed", description: error.message || "An error occurred.", variant: "error" });
    }
  };

  const handleCopyTable = async () => {
    const species = displaySpecies();
    const p = latestData()?.period ?? period();
    if (species.length === 0) return;

    const years = Array.from({ length: p }, (_, i) => i + 1);

    // Header row: Species \t Count \t 1 \t 2 \t ... \t N
    const header = ["Species", "Count", ...years].join("\t");

    // Data rows. Species without yield data get blank cells: pasted zeros
    // would read as real measured yields in the sheet.
    const rows = species.map((entry) => {
      const cells = years.map((year) => {
        if (!hasYieldData(entry)) return "";
        const v = getYieldForYear(entry.yieldCurve, year) ?? 0;
        return v % 1 === 0 ? String(v) : v.toFixed(1);
      });
      return [entry.species.nameCommon, entry.count, ...cells].join("\t");
    });

    const tsv = [header, ...rows].join("\n");

    // Use Electron's clipboard API if available, otherwise fallback
    if ((window as any).electronAPI?.copyToClipboard) {
      (window as any).electronAPI.copyToClipboard(tsv);
    } else {
      await navigator.clipboard.writeText(tsv);
    }

    showToast({
      title: "Copied",
      description: "Table copied to clipboard. Paste into Excel.",
      variant: "success",
    });
  };

  const selectedFieldName = createMemo(() => {
    const data = latestData();
    const id = selectedFieldId();
    if (!id || !data) return null;
    return data.fieldSummary.find((f: any) => f.field._id === id)?.field.name ?? null;
  });

  return (
    <div class="h-full overflow-y-auto p-4 space-y-6">
      {/* Title */}
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Yield Estimation{props.configName ? `: ${props.configName}` : ""}
        </h2>
      </div>

      {/* Parameters + field selector */}
      <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
        <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">Parameters</h3>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 dark:text-gray-400">Period</span>
            <input
              type="number"
              value={period()}
              onInput={(e) => setPeriod(parseInt(e.currentTarget.value) || 30)}
              class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              min="1"
              max="100"
              aria-label="Period in years"
            />
            <span class="text-sm text-gray-500">years</span>
          </div>

          {/* Field selector */}
          <Show when={latestData()?.fieldSummary && latestData()!.fieldSummary.length > 1}>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 dark:text-gray-400">Field</span>
              <select
                value={selectedFieldId() ?? ""}
                onChange={(e) =>
                  setSelectedFieldId(e.currentTarget.value === "" ? null : e.currentTarget.value)
                }
                class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                aria-label="Field filter"
              >
                <option value="">All Fields</option>
                <For each={latestData()?.fieldSummary}>
                  {(field: any) => (
                    <option value={field.field._id}>
                      {field.field.name} ({field.area.toFixed(2)} ha)
                    </option>
                  )}
                </For>
              </select>
            </div>
          </Show>

          {/* Refetch indicator — inline next to parameters */}
          <Show when={query.isFetching && latestData()}>
            <div class="flex items-center gap-2 text-sm text-gray-400">
              <div class="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Updating...
            </div>
          </Show>
        </div>
      </div>

      {/* Scope indicator when a field is selected */}
      <Show when={selectedFieldName()}>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            Showing yield for field:
          </span>
          <span class="text-sm font-medium text-white bg-green-600 rounded-full px-3 py-0.5">
            {selectedFieldName()}
          </span>
          <button
            type="button"
            onClick={() => setSelectedFieldId(null)}
            class="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            show all fields
          </button>
        </div>
      </Show>

      {/* Initial loading (no previous data) */}
      <Show when={query.isPending}>
        <div class="flex items-center justify-center py-12 text-gray-500">
          Computing yield estimation...
        </div>
      </Show>

      <Show when={query.isError && !latestData()}>
        <div class="rounded-lg bg-red-900/20 border border-red-500/30 p-4 text-sm text-red-400">
          <div class="font-semibold mb-1">Failed to load yield estimation</div>
          <div>{String(query.error)}</div>
        </div>
      </Show>

      <Show when={latestData() && displaySpecies().length === 0 && !query.isFetching}>
        <div class="flex items-center justify-center py-12 text-gray-500">
          No species found. Add species to your system design to see yield data.
        </div>
      </Show>

      {/* Main content — always in DOM, hidden via CSS */}
      <div class="space-y-6" classList={{ hidden: displaySpecies().length === 0 }}>
        {/* Missing yield data warning */}
        <Show when={speciesWithoutData().length > 0}>
          <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <span class="font-semibold">
              No yield data for {speciesWithoutData().length} species:
            </span>{" "}
            {speciesWithoutData()
              .map((s) => s.species.nameCommon)
              .join(", ")}
            . These rows show no values and contribute nothing to production totals.
          </div>
        </Show>

        {/* Year × Species production table */}
        <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-700 dark:text-gray-300">
              Annual Yield by Species
              <span class="ml-2 text-xs font-normal text-gray-500">(kg per tree per year)</span>
            </h3>
            <button
              type="button"
              onClick={handleCopyTable}
              class="flex items-center gap-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
              title="Copy table as tab-separated values (paste into Excel)"
            >
              <i class="fa-solid fa-copy" />
              Copy
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="text-sm border-collapse">
              <thead>
                <tr class="border-b border-neutral-300 dark:border-neutral-600">
                  <th class="sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800 text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400 min-w-[160px]">
                    Species
                  </th>
                  <th class="sticky left-[160px] z-10 bg-neutral-100 dark:bg-neutral-800 text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400 min-w-[60px] border-r border-neutral-300 dark:border-neutral-600">
                    Count
                  </th>
                  <For each={Array.from({ length: latestData()?.period ?? period() }, (_, i) => i + 1)}>
                    {(year) => (
                      <th class="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400 min-w-[50px]">
                        {year}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={displaySpecies()}>
                  {(entry) => {
                    const hasYield = hasYieldData(entry);
                    const unitLabel = entry.unitType === "m2" ? "m\u00B2" : "trees";
                    const p = latestData()?.period ?? period();

                    return (
                      <tr class="border-b border-neutral-200 dark:border-neutral-700">
                        <td class="sticky left-0 z-10 bg-neutral-100 dark:bg-neutral-800 py-2 px-3 text-gray-900 dark:text-gray-100">
                          <div class="font-medium">{entry.species.nameCommon || "Unknown"}</div>
                          <div class="text-[10px] text-gray-500 italic">
                            {entry.species.genus} {entry.species.species}
                          </div>
                        </td>
                        <td class="sticky left-[160px] z-10 bg-neutral-100 dark:bg-neutral-800 py-2 px-2 text-right text-gray-600 dark:text-gray-400 border-r border-neutral-300 dark:border-neutral-600">
                          <div>{entry.count.toLocaleString()}</div>
                          <div class="text-[10px] text-gray-400">{unitLabel}</div>
                        </td>
                        <Show
                          when={hasYield}
                          fallback={
                            <td
                              colspan={p}
                              class="py-2 px-3 text-left text-xs italic text-amber-600 dark:text-amber-500"
                            >
                              no yield data
                            </td>
                          }
                        >
                          <For each={Array.from({ length: p }, (_, i) => i + 1)}>
                            {(year) => {
                              const yieldKg = getYieldForYear(entry.yieldCurve, year);
                              const totalKg = entry.count * yieldKg;
                              const isZero = yieldKg === 0;
                              const isMaturity = yieldKg === entry.yieldAtMaturity && yieldKg > 0;

                              return (
                                <td
                                  class="py-2 px-2 text-right tabular-nums"
                                  classList={{
                                    "text-gray-300 dark:text-gray-700": isZero,
                                    "text-gray-700 dark:text-gray-300": !isZero && !isMaturity,
                                    "text-green-600 dark:text-green-400 font-medium": isMaturity,
                                  }}
                                  title={totalKg > 0 ? `${totalKg.toLocaleString()} kg total (${entry.count} × ${yieldKg} kg)` : ""}
                                >
                                  {yieldKg % 1 === 0 ? yieldKg : yieldKg.toFixed(1)}
                                </td>
                              );
                            }}
                          </For>
                        </Show>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </div>
