import { Outlet, createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { isGroveUser } from "~/grove/access.ts";

export const Route = createFileRoute("/grove")({
  component: () => (
    <Show
      when={isGroveUser()}
      fallback={<div class="container mx-auto p-4">This part of the app is only for the Grove team.</div>}
    >
      <Outlet />
    </Show>
  ),
});
