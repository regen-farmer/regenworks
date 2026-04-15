import { Outlet, createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/parcels/$parcelId/layers")({
  component: LayerOutlet,
});

function LayerOutlet() {
  return <Outlet />;
}
