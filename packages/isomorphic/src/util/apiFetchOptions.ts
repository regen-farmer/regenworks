import { getAuth0User } from "~/auth/useAuth.tsx";

export const apiFetchOptions: () => RequestInit = () => {
	return {
		mode: "cors", // no-cors, *cors, same-origin
		cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
		credentials: "same-origin", // include, *same-origin, omit
		headers: {
			"Content-Type": "application/json",
			Authorization: `${JSON.stringify(getAuth0User())}`,
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
