import Auth0 from "@auth/core/providers/auth0";
import { setCookie } from "vinxi/http";
import { getSession as getAuthSession } from "start-authjs";
import type { StartAuthJSConfig } from "start-authjs";
import { getRequestEvent } from "solid-js/web";

declare module "@auth/core/types" {
	export interface Session {
		user: {
			name: string;
			email: string;
			sub: string;
			email_verified: boolean;
		} & Profile;
		account: {
			access_token: string;
		};
		expires: Date;
	}
}

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
};

// Server-side session getter
export async function getSession() {
	"use server";
	const event = getRequestEvent();
	if (!event) return null;
	return await getAuthSession(event.request, authConfig);
}
