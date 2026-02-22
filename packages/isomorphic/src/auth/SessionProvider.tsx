import { createAsync, useLocation } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import NewUser from "~/auth/signup.tsx";
import { ShowAfterAuth } from "./useAuth.tsx";
import { getSessionData } from "~/app.tsx";

// Routes that should be accessible without authentication
const PUBLIC_ROUTES = ["/scenario-preview/", "/farm-scenario-preview/", "/privacy", "/terms"];

const SessionProvider = (props: any) => {
  const location = useLocation();
  const session = createAsync(() => getSessionData());

  // Check if current route is a public route
  const isPublicRoute = createMemo(() => {
    const path = location.pathname;
    return PUBLIC_ROUTES.some((route) => path.startsWith(route));
  });

  return (
    <>
      <Show when={isPublicRoute()}>
        {/* Public routes - render without auth wrapper */}
        {props.children}
      </Show>
      <Show when={!isPublicRoute()}>
        {/* Protected routes - require authentication */}
        <Show when={session()} fallback={<NewUser />}>
          <ShowAfterAuth>{props.children}</ShowAfterAuth>
        </Show>
      </Show>
    </>
  );
};

export { SessionProvider };
