// A checklist on a project (the screening first): collapsible sections with
// progress, each item Done / Not relevant / Issue found with an optional note,
// a note per section, and the go / no-go decision (Grove team). Each change
// is saved at once, one item at a time.
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type State = "open" | "done" | "na" | "issue";
type Template = {
  kind: string;
  title: string;
  decision: boolean;
  sections: { key: string; title: string; items: { key: string; text: string; hint?: string }[] }[];
};
type Progress = { done: number; total: number; issues: number; sections: { key: string; done: number; total: number; issues: number }[]; decision: string | null };
type Data = {
  template: Template;
  checklist: { items: Record<string, { state: State; note?: string; at?: string }>; sectionNotes: Record<string, string>; decision: { result?: string | null; conditions?: string; at?: string } | null };
  progress: Progress;
};

const STATES: [State, string, string][] = [
  ["done", "Done", "bg-emerald-700 text-white border-emerald-700"],
  ["na", "Not relevant", "bg-zinc-600 text-white border-zinc-600"],
  ["issue", "Issue found", "bg-amber-600 text-white border-amber-600"],
];
export const DECISION_EN: Record<string, string> = { go: "Go", "go-conditions": "Go, with conditions", "no-go": "No-go" };
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";

export function ChecklistPanel(props: { projectId: string; kind: string; suggestion?: () => { result: string; conditions: string } | null }) {
  const [data, { mutate }] = createResource(
    () => ({ id: props.projectId, kind: props.kind }),
    (k) => apiFetch<Data>(`/internal/projects/${k.id}/checklists/${k.kind}`),
  );
  const d = () => (data.error ? undefined : data.latest);
  // The template is kept once, so saving doesn't rebuild the sections
  // (open sections, focus and text being typed stay as they are).
  const [template, setTemplate] = createSignal<Template>();
  const [openSections, setOpenSections] = createSignal<Set<string>>(new Set());
  let shownFor = "";
  createEffect(() => {
    const x = d();
    // once per project and checklist (the page may be reused for another project)
    if (x && shownFor !== `${props.projectId}|${x.template.kind}`) {
      shownFor = `${props.projectId}|${x.template.kind}`;
      setTemplate(x.template);
      const first = x.progress.sections.find((p) => p.done < p.total)?.key ?? x.template.sections[0]?.key;
      setOpenSections(new Set(first ? [first] : []));
    }
  });
  const [saving, setSaving] = createSignal(0);
  let seq = 0;
  const [noteOpen, setNoteOpen] = createSignal<Set<string>>(new Set());
  const [decision, setDecision] = createSignal<{ result: string; conditions: string } | null>(null);
  // a suggestion (e.g. from the model screening) fills the decision form; it is saved only with "Save decision"
  createEffect(() => {
    const s = props.suggestion?.();
    if (s?.result) setDecision({ result: s.result, conditions: s.conditions });
  });

  async function send(path: string, body: unknown, itemKey?: string) {
    setSaving((n) => n + 1);
    const mine = ++seq;
    try {
      const r = await apiFetch<Data>(`/internal/projects/${props.projectId}/checklists/${props.kind}/${path}`, { method: "PUT", body: JSON.stringify(body) });
      const now = data.latest;
      // the newest reply wins; an older one only updates its own item
      if (mine === seq || !now) mutate(r);
      else if (itemKey) mutate({ ...now, checklist: { ...now.checklist, items: { ...now.checklist.items, [itemKey]: r.checklist.items[itemKey] } } });
      return true;
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
      return false;
    } finally {
      setSaving((n) => n - 1);
    }
  }

  const answer = (key: string) => d()?.checklist.items[key];
  const setState = (key: string, state: State) => {
    const current = answer(key)?.state ?? "open";
    // clicking the active state again opens the item again
    send(`items/${key}`, { state: current === state ? "open" : state }, key);
  };
  const saveNote = (key: string, note: string) => {
    if ((answer(key)?.note ?? "") === note.trim()) return;
    send(`items/${key}`, { note }, key);
  };
  const sectionProgress = (key: string) => d()?.progress.sections.find((s) => s.key === key);

  return (
    <section class="flex flex-col gap-2" data-testid={`checklist-${props.kind}`} aria-label={d()?.template.title ?? "Checklist"}>
      <Show when={d()} fallback={<p class="text-sm">{data.error ? (data.error as Error).message : "Loading…"}</p>}>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-xl font-semibold">{d()!.template.title}</h2>
          <span class="text-sm">
            {d()!.progress.done}/{d()!.progress.total} done
            <Show when={d()!.progress.issues}><span class="text-amber-700"> · {d()!.progress.issues} issue{d()!.progress.issues === 1 ? "" : "s"}</span></Show>
          </span>
          <div class="h-2 w-40 rounded bg-zinc-200 dark:bg-slate-700" role="progressbar" aria-label="Progress" aria-valuenow={d()!.progress.done} aria-valuemin={0} aria-valuemax={d()!.progress.total}>
            <div class="h-2 rounded bg-emerald-700" style={{ width: `${Math.round((d()!.progress.done / Math.max(1, d()!.progress.total)) * 100)}%` }} />
          </div>
          <Show when={d()!.progress.decision}>
            <span class="text-sm font-semibold rounded-sm px-2 py-0.5" classList={{ "bg-emerald-700 text-white": d()!.progress.decision !== "no-go", "bg-red-700 text-white": d()!.progress.decision === "no-go" }}>
              {DECISION_EN[d()!.progress.decision!]}
            </span>
          </Show>
          <span class="text-xs opacity-60" aria-live="polite">{saving() ? "Saving…" : ""}</span>
        </div>

        <For each={template()?.sections}>
          {(s) => (
            <details
              class="rounded-md border border-zinc-300 dark:border-slate-600"
              open={openSections().has(s.key)}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                if (isOpen !== openSections().has(s.key)) {
                  setOpenSections((x) => {
                    const n = new Set(x);
                    if (isOpen) n.add(s.key);
                    else n.delete(s.key);
                    return n;
                  });
                }
              }}
            >
              <summary class="cursor-pointer px-3 py-2 flex items-center gap-2">
                <span class="font-semibold mr-auto">{s.title}</span>
                <span class="text-sm" classList={{ "text-emerald-700 font-semibold": sectionProgress(s.key)?.done === s.items.length }}>
                  {sectionProgress(s.key)?.done ?? 0}/{s.items.length}
                </span>
                <Show when={sectionProgress(s.key)?.issues}><span class="text-xs text-amber-700">{sectionProgress(s.key)!.issues} issue{sectionProgress(s.key)!.issues === 1 ? "" : "s"}</span></Show>
              </summary>
              <div class="px-3 pb-3 flex flex-col">
                <For each={s.items}>
                  {(item) => {
                    const st = () => answer(item.key)?.state ?? "open";
                    const showNote = () => noteOpen().has(item.key) || !!answer(item.key)?.note;
                    return (
                      <div class="py-2 border-t border-zinc-200 dark:border-slate-700 flex flex-col gap-1">
                        <div class="flex flex-wrap items-start gap-2">
                          <div class="flex-1 min-w-64 text-sm" classList={{ "opacity-60": st() === "na" }}>
                            {item.text}
                            <Show when={item.hint}><div class="text-xs opacity-70">{item.hint}</div></Show>
                          </div>
                          <div class="flex gap-1" role="group" aria-label={`Status: ${item.text}`}>
                            <For each={STATES}>
                              {([k, label, on]) => (
                                <button
                                  type="button"
                                  class={`rounded-sm px-2 py-1 text-xs border border-zinc-300 dark:border-slate-600 ${st() === k ? on : ""}`}
                                  aria-pressed={st() === k}
                                  onClick={() => setState(item.key, k)}
                                >
                                  {label}
                                </button>
                              )}
                            </For>
                            <Show when={!showNote()}>
                              <button
                                type="button"
                                class="text-xs underline px-1"
                                onClick={() => setNoteOpen((x) => new Set(x).add(item.key))}
                              >
                                Note
                              </button>
                            </Show>
                          </div>
                        </div>
                        <Show when={showNote()}>
                          <textarea
                            class={input}
                            rows={2}
                            maxLength={2000}
                            aria-label={`Note: ${item.text}`}
                            value={answer(item.key)?.note ?? ""}
                            placeholder="What you found, e.g. drain map from the landowner, distance to the line…"
                            onBlur={(e) => saveNote(item.key, e.currentTarget.value)}
                          />
                        </Show>
                      </div>
                    );
                  }}
                </For>
                <label class="flex flex-col text-xs mt-2">
                  Notes for {s.title.replace(/^[A-Z]\.\s*/, "")}
                  <textarea
                    class={input}
                    rows={2}
                    maxLength={3000}
                    value={d()!.checklist.sectionNotes[s.key] ?? ""}
                    onBlur={(e) => {
                      if ((d()!.checklist.sectionNotes[s.key] ?? "") !== e.currentTarget.value.trim()) send(`sections/${s.key}`, { note: e.currentTarget.value });
                    }}
                  />
                </label>
              </div>
            </details>
          )}
        </For>

        <Show when={d()!.template.decision}>
          <div class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-2">
            <div class="font-semibold">Decision</div>
            <Show
              when={canSeeMoney()}
              fallback={<p class="text-sm">{d()!.checklist.decision?.result ? DECISION_EN[d()!.checklist.decision!.result!] : "Not decided yet"} (the Grove team decides)</p>}
            >
              <div role="radiogroup" aria-label="Decision" class="flex flex-wrap gap-3 text-sm">
                <For each={[["", "Not decided"], ...Object.entries(DECISION_EN)]}>
                  {([k, label]) => (
                    <label class="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`decision-${props.projectId}`}
                        checked={(decision()?.result ?? d()!.checklist.decision?.result ?? "") === k}
                        onChange={() => setDecision({ result: k, conditions: decision()?.conditions ?? d()!.checklist.decision?.conditions ?? "" })}
                      />
                      {label}
                    </label>
                  )}
                </For>
              </div>
              <label class="flex flex-col text-xs">
                Conditions or reasons
                <textarea
                  class={input}
                  rows={2}
                  maxLength={3000}
                  value={decision()?.conditions ?? d()!.checklist.decision?.conditions ?? ""}
                  placeholder="e.g. keep 10 m from the §3 meadow; no trees over the main drain"
                  onInput={(e) => setDecision({ result: decision()?.result ?? d()!.checklist.decision?.result ?? "", conditions: e.currentTarget.value })}
                />
              </label>
              <div class="flex gap-2 items-center">
                <button
                  type="button"
                  class="rounded-sm px-2 py-1 btn-default"
                  disabled={!decision() || saving() > 0}
                  onClick={async () => {
                    if (await send("decision", decision())) setDecision(null);
                  }}
                >
                  Save decision
                </button>
                <Show when={d()!.progress.done < d()!.progress.total}>
                  <span class="text-xs text-amber-700">{d()!.progress.total - d()!.progress.done} item(s) still open</span>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </section>
  );
}
