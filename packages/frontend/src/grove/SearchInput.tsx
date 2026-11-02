// A text input with its own suggestion list: shows only options whose name
// contains every typed word (Latin or Danish name), at most 20, with arrow
// keys and Enter. Typing something not on the list is allowed. Used where the
// browser's own datalist shows every option instead of filtering.
import { createMemo, createSignal, For, Show } from "solid-js";

export type SearchOption = { value: string; label?: string };

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function SearchInput(props: {
  value: string;
  onInput: (v: string) => void;
  options: SearchOption[];
  class: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const matches = createMemo(() => {
    const words = fold(props.value).split(/\s+/).filter(Boolean);
    if (!words.length) return props.options.slice(0, 20);
    const out: SearchOption[] = [];
    for (const o of props.options) {
      const hay = fold(`${o.value} ${o.label ?? ""}`);
      if (words.every((w) => hay.includes(w))) out.push(o);
      if (out.length >= 20) break;
    }
    // exactly what was typed: nothing to suggest
    return out.length === 1 && fold(out[0].value) === fold(props.value) ? [] : out;
  });
  const pick = (o: SearchOption) => {
    props.onInput(o.value);
    setOpen(false);
  };
  return (
    <div class="relative">
      <input
        class={props.class}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        maxLength={props.maxLength}
        aria-label={props.ariaLabel}
        role="combobox"
        aria-expanded={open() && matches().length > 0}
        aria-autocomplete="list"
        autocomplete="off"
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          const list = matches();
          if (!open() || !list.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(list.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(list[Math.min(active(), list.length - 1)]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <Show when={open() && matches().length && !props.disabled}>
        <ul role="listbox" class="absolute z-50 mt-1 left-0 min-w-full w-max max-w-sm max-h-64 overflow-y-auto rounded-md border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg text-sm">
          <For each={matches()}>
            {(o, i) => (
              <li
                role="option"
                aria-selected={i() === active()}
                class="px-2 py-1 cursor-pointer"
                classList={{ "bg-emerald-700 text-white": i() === active() }}
                // mousedown, so the input keeps focus until the pick is made
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i())}
              >
                <span class={o.label ? "italic" : ""}>{o.value}</span>
                <Show when={o.label}><span class="opacity-70"> · {o.label}</span></Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
