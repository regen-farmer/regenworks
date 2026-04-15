import { Outlet, createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/parcels")({
  component: () => <Outlet />,
});
