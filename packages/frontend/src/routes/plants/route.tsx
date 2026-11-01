import { Outlet, createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/plants")({
  component: () => <Outlet />,
});
