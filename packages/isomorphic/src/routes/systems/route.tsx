import { Outlet, createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/systems")({
  component: () => <Outlet />,
});
