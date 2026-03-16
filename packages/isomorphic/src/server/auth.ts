import Auth0 from "@auth/core/providers/auth0";
import { setCookie, getRequest } from "@tanstack/solid-start/server";
import { getSession as getAuthSession } from "start-authjs";
import type { StartAuthJSConfig } from "start-authjs";

export const authConfig: StartAuthJSConfig = {
  secret: process.env.AUTH_SECRET,
  providers: [
    Auth0({
      authorization: {
        params: {
          scope: "email email_verified openid profile",
          prompt: "login",
        },
      },
      async profile(profile, tokens) {
        await setCookie("auth0Token", encodeURIComponent(tokens.access_token ?? ""));
        await setCookie("auth0User", encodeURIComponent(JSON.stringify(profile)));
        return profile;
      },
    }),
  ],
  callbacks: {
    // Persist email_verified and sub through the JWT so session.user has them.
    jwt: async ({ token, user, profile }) => {
      const source = profile ?? user;
      if (source) {
        token.email_verified = (source as any).email_verified ?? token.email_verified;
        token.sub = (source as any).sub ?? token.sub;
      }
      return token;
    },
    session: async ({ session, token }) => {
      (session.user as any).email_verified = token.email_verified as boolean | undefined;
      (session.user as any).sub = token.sub;
      return session;
    },
  },
};

// Server-side session getter — plain function, only called from server context
export async function getSession() {
  const request = getRequest();
  if (!request) return null;
  return await getAuthSession(request, authConfig);
}
