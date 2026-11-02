// Deal source dropdown: the list from "Funnels & sources" (Settings), loaded
// once and shared; a deal's old source not on the list still shows.
import { createResource, For, Show } from "solid-js";
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
  const sources = () => (list.error ? [] : (list.latest?.sources ?? []));
  return (
    <select class={props.class} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.currentTarget.value)}>
      <option value="">–</option>
      <Show when={props.value && !sources().includes(props.value)}><option value={props.value}>{props.value}</option></Show>
      <For each={sources()}>{(s) => <option value={s}>{s}</option>}</For>
    </select>
  );
}
