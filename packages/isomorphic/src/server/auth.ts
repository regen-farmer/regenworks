import type { SolidAuthConfig } from "@solid-mediakit/auth";
import Auth0 from "@auth/core/providers/auth0";
import { setCookie } from "vinxi/http";

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
		expires: Date; // This is the expiry of the session, not any of the tokens within the session
	}
}

export const authOpts: SolidAuthConfig = {
	providers: [
		Auth0({
			clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
			clientSecret: import.meta.env.VITE_AUTH0_CLIENT_SECRET,
			issuer: import.meta.env.VITE_AUTH0_ISSUER,
			authorization: {
				params: {
					scope: "email email_verified openid profile",
					prompt: "login",
				},
			},
			async profile(profile, tokens) {
				// setAuth0User(profile ?? "");
				// console.log("auth0User", auth0User());
				// setAuth0Token(tokens.access_token ?? "");

				await setCookie("auth0Token", encodeURIComponent(tokens.access_token ?? ""));
				await setCookie("auth0User", encodeURIComponent(JSON.stringify(profile)));


				return profile;
			},
		}),
	],
	debug: false,
};
