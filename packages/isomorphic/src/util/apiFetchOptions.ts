import { getAuth0User } from "~/auth/useAuth.tsx";

export const apiFetchOptions: () => RequestInit = () => {
	// Get auth0User from signal or try to get it from cookie if signal is not yet initialized
	let auth0User = getAuth0User();
	
	// If signal is not initialized, try to get from cookie
	if (!auth0User && typeof document !== 'undefined') {
		const cookies = document.cookie.split(';');
		const auth0Cookie = cookies.find(c => c.trim().startsWith('auth0User='));
		if (auth0Cookie) {
			try {
				let cookieValue = auth0Cookie.split('=')[1];
				cookieValue = decodeURIComponent(decodeURIComponent(cookieValue));
				auth0User = JSON.parse(cookieValue);
			} catch (e) {
				console.error('Failed to parse auth0User cookie:', e);
			}
		}
	}
	
	return {
		mode: "cors", // no-cors, *cors, same-origin
		cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
		credentials: "same-origin", // include, *same-origin, omit
		headers: {
			"Content-Type": "application/json",
			Authorization: `${JSON.stringify(auth0User || {})}`,
		},
		redirect: "follow", // manual, *follow, error
		referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url}
	};
};
export const apiResponseOptions: ResponseInit = {
	headers: {
		"Content-Type": "application/json",
	},
	status: 200,
};
