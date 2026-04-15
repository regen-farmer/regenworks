import { Outlet, createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/parcels/$parcelId/layers/$layerId/projects")({
  component: Projects,
});

function Projects() {
  return <Outlet />;
}
