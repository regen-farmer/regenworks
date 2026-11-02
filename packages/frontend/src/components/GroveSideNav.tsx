// Left menu for Grove users: Dashboard and the three workspaces
// (A · Deals, B · Projects, C · Managed farms), then Library and Settings.
// Collapses to icons; the choice is remembered in this browser.
import { Link, useLocation } from "@tanstack/solid-router";
import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { canSeeMoney } from "~/grove/access.ts";
import { canUsePlantCatalogue } from "~/util/plantCatalogue.ts";

type Item = { to: string; label: string; icon: string; exact?: boolean; show?: () => boolean; letter?: string; sub?: boolean; soon?: boolean; also?: RegExp };

const ITEMS: (Item | { heading: string; show?: () => boolean })[] = [
  { to: "/grove", label: "Dashboard", icon: "fa-table-columns", exact: true },
  { heading: "Workspaces" },
  { to: "/grove/deals", label: "Deals", letter: "A", icon: "fa-filter", show: () => canSeeMoney() },
  { to: "/grove/clients", label: "Clients", icon: "fa-address-book", sub: true, show: () => canSeeMoney() },
  { to: "/grove/offers", label: "Offers", icon: "fa-file-invoice", sub: true, show: () => canSeeMoney() },
  { to: "/grove/supply", label: "Supply", icon: "fa-boxes-stacked", sub: true, show: () => canSeeMoney() },
  { to: "/grove/funnels", label: "Funnels & sources", icon: "fa-sliders", sub: true, show: () => canSeeMoney() },
  { to: "/", label: "Projects", letter: "B", icon: "fa-compass-drafting", exact: true, also: /^\/(parcels|grove\/projects)(\/|$)/ },
  { to: "/grove/managed", label: "Managed farms", letter: "C", icon: "fa-tractor", soon: true },
  { heading: "Library" },
  { to: "/plants", label: "Plants", icon: "fa-seedling", show: () => canUsePlantCatalogue() },
  { to: "/grove/prices", label: "Prices", icon: "fa-scale-balanced", show: () => canSeeMoney() },
  { to: "/grove/pricebook", label: "Pricebook", icon: "fa-tags", show: () => canSeeMoney() },
  { to: "/grove/value-chains", label: "Value chains", icon: "fa-diagram-project", show: () => canSeeMoney() },
  { to: "/settings", label: "Settings", icon: "fa-gear" },
];

/** The saved choice, else collapsed on narrow screens (phones). */
function readCollapsed() {
  try {
    const v = localStorage.getItem("grove-nav-collapsed");
    if (v === "1" || v === "0") return v === "1";
  } catch {
    // no saved choice
  }
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export function GroveSideNav(): JSX.Element {
  const [collapsed, setCollapsed] = createSignal(readCollapsed());
  const location = useLocation();
  // Fixed overlays on the map pages (e.g. the soil legend) read this to sit right of the menu.
  createEffect(() => document.documentElement.style.setProperty("--grove-nav-width", collapsed() ? "3.5rem" : "13rem"));
  onCleanup(() => document.documentElement.style.removeProperty("--grove-nav-width"));
  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    try {
      localStorage.setItem("grove-nav-collapsed", next ? "1" : "0");
    } catch {
      // remembering is only a convenience
    }
  };

  return (
    <nav
      aria-label="Grove"
      class="shrink-0 sticky top-0 self-start overflow-y-auto border-r border-zinc-300 dark:border-slate-600 bg-zinc-50 dark:bg-slate-900 flex flex-col gap-0.5 py-2 transition-[width] duration-150"
      style={{ height: "calc(100vh - var(--app-nav-height, 3.5rem))", width: collapsed() ? "3.5rem" : "13rem" }}
      data-testid="grove-side-nav"
    >
      <button
        type="button"
        class="mx-2 mb-1 h-9 rounded-sm flex items-center gap-2 px-2 text-sm hover:bg-zinc-200 dark:hover:bg-slate-700"
        onClick={toggle}
        aria-expanded={!collapsed()}
        aria-label={collapsed() ? "Expand menu" : "Collapse menu"}
        title={collapsed() ? "Expand menu" : "Collapse menu"}
      >
        <i class={`fas ${collapsed() ? "fa-angles-right" : "fa-angles-left"} w-5 text-center`} aria-hidden="true" />
        <Show when={!collapsed()}>
          <span class="opacity-70">Collapse</span>
        </Show>
      </button>
      <For each={ITEMS}>
        {(item) =>
          "heading" in item ? (
            <Show when={!collapsed()} fallback={<div class="mx-3 my-1 border-t border-zinc-300 dark:border-slate-700" />}>
              <div class="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide opacity-60">{item.heading}</div>
            </Show>
          ) : (
            <Show when={item.show?.() ?? true}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                class="mx-2 h-9 rounded-sm flex items-center gap-2 px-2 text-sm hover:bg-zinc-200 dark:hover:bg-slate-700"
                classList={{ "pl-6": item.sub && !collapsed(), "bg-emerald-700 text-white hover:bg-emerald-800 dark:hover:bg-emerald-800 font-semibold": !!item.also?.test(location().pathname) }}
                activeProps={{ class: "bg-emerald-700 text-white hover:bg-emerald-800 dark:hover:bg-emerald-800 font-semibold" }}
                title={item.letter ? `${item.letter} · ${item.label}` : item.label}
                aria-label={collapsed() ? (item.letter ? `${item.letter} · ${item.label}` : item.label) : undefined}
              >
                <Show
                  when={item.letter}
                  fallback={<i class={`fas ${item.icon} w-5 text-center ${item.sub ? "text-xs opacity-80" : ""}`} aria-hidden="true" />}
                >
                  <span class="w-5 h-5 rounded-sm bg-zinc-700 text-white dark:bg-slate-300 dark:text-black text-xs font-bold flex items-center justify-center" aria-hidden="true">
                    {item.letter}
                  </span>
                </Show>
                <Show when={!collapsed()}>
                  <span class="truncate">{item.label}</span>
                  <Show when={item.soon}>
                    <span class="ml-auto text-[10px] uppercase opacity-60">soon</span>
                  </Show>
                </Show>
              </Link>
            </Show>
          )
        }
      </For>
    </nav>
  );
}
