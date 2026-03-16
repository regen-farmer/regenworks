import { createEffect, createSignal, onMount } from "solid-js";

const initializeTheme = () => {
  if (typeof localStorage !== "undefined" && localStorage.getItem("theme")) {
    return localStorage.getItem("theme") as "light" | "dark" | "system";
  }
  return "system";
};

export const [theme, setTheme] = createSignal<string>("system");

export const ThemeToggler = ({ children }: any) => {
  onMount(() => {
    // Initialize theme from localStorage on the client only
    setTheme(initializeTheme());

    // Dynamically import to avoid SSR issues with window.matchMedia
    import("@solid-primitives/media").then(({ usePrefersDark }) => {
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
    });
  });

  return <>{children}</>;
};
