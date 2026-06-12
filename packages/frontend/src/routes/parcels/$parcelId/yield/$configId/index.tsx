import { createFileRoute, useParams } from "@tanstack/solid-router";
import type { Component } from "solid-js";
import { YieldEstimationTab } from "~/components/yield-estimation/YieldEstimationTab";

const YieldEstimationPage: Component = () => {
  const params = useParams({ strict: false });

  return (
    <div
      class="h-full bg-neutral-100 dark:bg-neutral-900"
      style={{ height: "calc(100vh - var(--app-nav-height, 3.5rem))" }}
    >
      <YieldEstimationTab configId={params().configId} />
    </div>
  );
};

export const Route = createFileRoute("/parcels/$parcelId/yield/$configId/")({
  component: YieldEstimationPage,
});
