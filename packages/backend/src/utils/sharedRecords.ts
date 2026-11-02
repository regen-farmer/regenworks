// Rows and areas used to be shared between a scenario and its copies (a
// duplicate pointed at the same records). Before deleting a scenario's rows
// or areas, leave out any that another scenario still uses.
import mongoose from "mongoose";
import Project from "@rw/db/schemas/project.ts";
import { inIds } from "./mongoSafety.ts";

export async function notUsedElsewhere(field: "rows" | "areas", ids: unknown[], projectId: string) {
  const list = (ids ?? []).map(String).filter((id) => mongoose.isValidObjectId(id));
  if (!list.length) return [];
  const others: any[] = await Project.find({ _id: mongoose.trusted({ $ne: projectId }), [field]: inIds(list) })
    .select(field)
    .lean();
  const shared = new Set(others.flatMap((p) => (p[field] ?? []).map(String)));
  return list.filter((id) => !shared.has(id));
}
