"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "theme";

/** Inline script for <head>: applies the saved theme before first paint. Dark is the default. */
export const THEME_SCRIPT = `try{document.documentElement.classList.toggle("dark",localStorage.getItem("${KEY}")!=="light")}catch(e){}`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "dark",
  );
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}
