import { useParams } from "@solidjs/router";
import { getRequestEvent } from "solid-js/web";
import Project from "@rw/db/schemas/project.ts";
import { apiResponseOptions } from "~/util/apiFetchOptions.ts";

export async function PATCH() {
  const event = getRequestEvent();
  const params = useParams();

  const project = await Project.findById(params.projectId).populate("system");

  const payload: any = await event?.request.json();

  const system = project?.system;

  const newActivities: [
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
  ] = payload.map((newactivity: any) => ({
    id: newactivity.id,
    activities: newactivity.activities
      .filter((el: any) => el !== "none")
      .map((el: any) => JSON.parse(el)),
  }));

  system!.uniqueSpecies.forEach((uniqueSpecies, idx) => {
    const match = newActivities.find((el) => {
      return el.id === uniqueSpecies.id.toString();
    });

    if (match) {
      uniqueSpecies.activities = match!.activities;
    }
  });

  await system?.save();

  return new Response("{}", apiResponseOptions);
}
