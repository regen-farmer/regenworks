import { createFileRoute } from "@tanstack/solid-router";
import { StartAuthJS } from "start-authjs";
import { authConfig } from "~/server/auth.ts";

const { GET: AuthGET, POST: AuthPOST } = StartAuthJS(authConfig);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => AuthGET({ request, response: new Response() }),
      POST: ({ request }: { request: Request }) => AuthPOST({ request, response: new Response() }),
    },
  },
});
