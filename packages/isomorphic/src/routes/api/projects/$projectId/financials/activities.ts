import { createFileRoute } from "@tanstack/solid-router";
import { apiResponseOptions } from "@rw/frontend/src/util/apiFetchOptions.ts";
import { accessErrorResponse, requireProjectOwner } from "../../../../../server/access.ts";

export const Route = createFileRoute("/api/projects/$projectId/financials/activities")({
  server: {
    handlers: {
      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        let project;
        try {
          ({ project } = await requireProjectOwner(params.projectId));
        } catch (err) {
          return accessErrorResponse(err);
        }

        const payload: any = await request.json().catch(() => null);
        if (!Array.isArray(payload)) {
          return new Response(JSON.stringify({ error: "Expected a list of activities" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const system = project.system;
        if (!system) {
          return new Response(JSON.stringify({ error: "Project has no system" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        let newActivities: [
          {
            id: string;
            activities: [
              {
                activityType: string;
                subtype: string;
                name: string;
                time: {
                  startMonth: number;
                  endMonth: number;
                };
                price: number;
              },
            ];
          },
        ];
        try {
          newActivities = payload.map((newactivity: any) => ({
            id: newactivity.id,
            activities: newactivity.activities
              .filter((el: any) => el !== "none")
              .map((el: any) => JSON.parse(el)),
          }));
        } catch {
          return new Response(JSON.stringify({ error: "Activities could not be read" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        system.uniqueSpecies.forEach((uniqueSpecies) => {
          const match = newActivities.find((el) => {
            return el.id === uniqueSpecies.id.toString();
          });

          if (match) {
            uniqueSpecies.activities = match!.activities;
          }
        });

        await system.save();

        return new Response("{}", apiResponseOptions);
      },
    },
  },
});
