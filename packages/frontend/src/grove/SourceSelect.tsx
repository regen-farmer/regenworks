// Deal source dropdown: the list from "Funnels & sources" (Settings), loaded
// once and shared; a deal's old source not on the list still shows.
import { createMemo, createResource, For } from "solid-js";
import { apiFetch } from "~/util/apiFetch.ts";

let cache: Promise<{ sources: string[] }> | null = null;
export const loadSources = (fresh = false) => {
  if (fresh || !cache) cache = apiFetch<{ sources: string[] }>("/internal/deals/sources").catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
};

export function SourceSelect(props: { value: string; onChange: (v: string) => void; class: string; disabled?: boolean }) {
  const [list] = createResource(() => loadSources());
  // one list (the deal's own source first if it's not on the list), each option marked selected,
  // so the shown value stays right when the list arrives
  const options = createMemo(() => {
    const list0 = list.error ? [] : (list.latest?.sources ?? []);
    return props.value && !list0.includes(props.value) ? [props.value, ...list0] : list0;
  });
  return (
    <select class={props.class} disabled={props.disabled} onChange={(e) => props.onChange(e.currentTarget.value)}>
      <option value="" selected={!props.value}>–</option>
      <For each={options()}>{(s) => <option value={s} selected={s === props.value}>{s}</option>}</For>
    </select>
  );
}
