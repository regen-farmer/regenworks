import { SolidAuth } from "@solid-mediakit/auth";
import { authOpts } from "~/server/auth.ts";

export const { GET, POST } = SolidAuth(authOpts);
