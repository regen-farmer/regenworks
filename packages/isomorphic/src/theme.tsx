import { createEffect, createSignal } from "solid-js";
import { usePrefersDark } from "@solid-primitives/media";

const initializeTheme = () => {
	let theme = "system";
	if (typeof localStorage !== "undefined" && localStorage.getItem("theme")) {
		theme = localStorage.getItem("theme") as "light" | "dark" | "system";
	}

	return theme;
};
export const [theme, setTheme] = createSignal<string>(initializeTheme());

export const ThemeToggler = ({ children }: any) => {
	const prefersDark = usePrefersDark();

	createEffect(() => {
		const root = document.documentElement;

		switch (theme()) {
			case "system": {
				if (prefersDark()) {
					root.classList.add("theme-dark");
					root.style.setProperty("color-scheme", "dark");
				} else {
					root.classList.remove("theme-dark");
					root.style.setProperty("color-scheme", "light");
				}
				localStorage.setItem("theme", "system");
				root.style.setProperty("visibility", "visible");
				root.style.setProperty("opacity", "1");
				break;
			}
			case "light": {
				root.classList.remove("theme-dark");
				root.style.setProperty("color-scheme", "light");
				localStorage.setItem("theme", "light");
				root.style.setProperty("visibility", "visible");
				root.style.setProperty("opacity", "1");
				break;
			}
			case "dark": {
				root.classList.add("theme-dark");
				root.style.setProperty("color-scheme", "dark");
				localStorage.setItem("theme", "dark");
				root.style.setProperty("visibility", "visible");
				root.style.setProperty("opacity", "1");
				break;
			}
		}
	});

	return <>{children}</>;
};
