// B · Projects (left menu for Grove users): every Grove project, as a status
// list, board, list or map. The same list as the Dashboard's B tab; farms and
// their designs stay under "Farms & designs".
import { createFileRoute } from "@tanstack/solid-router";
import { Dashboard } from "~/routes/grove/index.tsx";

export const Route = createFileRoute("/grove/projects/")({ component: () => <Dashboard only="projects" /> });
