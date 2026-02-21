import { createSignal } from "solid-js";

// Shared signal for dark mode state
const [isDarkModeSignal, setIsDarkModeSignal] = createSignal(false);

let observerSetup = false;

function checkDarkMode(): boolean {
	if (typeof document === "undefined") return false;
	// Check for both "dark" and "theme-dark" classes (app uses "theme-dark")
	return (
		document.documentElement.classList.contains("dark") ||
		document.documentElement.classList.contains("theme-dark")
	);
}

function setupObserver() {
	if (typeof document === "undefined" || observerSetup) return;
	observerSetup = true;

	// Watch for changes
	const observer = new MutationObserver(() => {
		setIsDarkModeSignal(checkDarkMode());
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
}

/**
 * Reactive signal that tracks dark mode state.
 * Watches for changes to the 'dark' class on document.documentElement.
 * Returns a shared signal that updates when theme changes.
 */
export function useDarkMode() {
	// Set up observer on first use
	setupObserver();

	// Always update to current state when called
	const currentDarkMode = checkDarkMode();
	if (isDarkModeSignal() !== currentDarkMode) {
		setIsDarkModeSignal(currentDarkMode);
	}

	return isDarkModeSignal;
}
