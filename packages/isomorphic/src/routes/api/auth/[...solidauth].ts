import { StartAuthJS } from "start-authjs";
import type { AuthRequestContext } from "start-authjs";
import { authConfig } from "~/server/auth.ts";

const { GET: AuthGET, POST: AuthPOST } = StartAuthJS(authConfig);

export const GET = (event: AuthRequestContext) => AuthGET(event);
export const POST = (event: AuthRequestContext) => AuthPOST(event);
