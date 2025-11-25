import { StartAuthJS } from "start-authjs";
import type { APIEvent } from "@solidjs/start/server";
import { authConfig } from "~/server/auth.ts";

const { GET: AuthGET, POST: AuthPOST } = StartAuthJS(authConfig);

export const GET = (event: APIEvent) => AuthGET(event);
export const POST = (event: APIEvent) => AuthPOST(event);
