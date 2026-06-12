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


