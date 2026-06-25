/**
 * Platform detection utilities
 *
 * Helps determine the runtime environment.
 */
export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  return "electronAPI" in window;
}

/**
 * Check if we're running in a native desktop environment
 */
export function isDesktop(): boolean {
  return isElectron();
}

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Check if we're running on the server (SSR)
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}

/**
 * Get the current platform name
 */
export function getPlatform(): "electron" | "browser" | "server" {
  if (isServer()) return "server";
  if (isElectron()) return "electron";
  return "browser";
}
