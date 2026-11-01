// Access checks for the web app's own server routes (src/routes/api/**).
// The browser can be anyone: every route that reads or changes user data must
// call one of these before touching the database.
import mongoose from "mongoose";
import Project from "@rw/db/schemas/project.ts";
import User, { type UserDocument } from "@rw/db/schemas/user.ts";
import { getSession } from "./auth.ts";

export class AccessError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** The logged-in user with a verified email, or an AccessError (401). */
export async function requireUser(): Promise<UserDocument> {
  const session = await getSession();
  const sessionUser = session?.user as
    | { sub?: string; email?: string; email_verified?: boolean }
    | undefined;
  if (!sessionUser || sessionUser.email_verified !== true) {
    throw new AccessError(401, "Log in with a verified email to do that");
  }
  let user: UserDocument | null = null;
  if (typeof sessionUser.sub === "string" && sessionUser.sub) {
    user = await User.findOne({ externalId: { $eq: sessionUser.sub } }).exec();
  }
  if (!user && typeof sessionUser.email === "string" && sessionUser.email) {
    user = await User.findOne({ email: { $eq: sessionUser.email } }).exec();
  }
  if (!user) throw new AccessError(401, "User not found");
  return user;
}

/** The project, if the logged-in user owns it (or is an admin); otherwise an AccessError. */
export async function requireProjectOwner(projectId: string) {
  if (!mongoose.isValidObjectId(projectId)) throw new AccessError(400, "Invalid project id");
  const user = await requireUser();
  const project = await Project.findById(projectId).populate("system");
  if (!project) throw new AccessError(404, "Project not found");
  const ownerId = project.owner?.id?.toString();
  if (ownerId !== user._id.toString() && !user.isAdmin) {
    throw new AccessError(403, "You don't have permission to change this project");
  }
  return { user, project };
}

/** Turn an AccessError into a JSON response; rethrow anything else. */
export function accessErrorResponse(err: unknown): Response {
  if (err instanceof AccessError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  throw err;
}
