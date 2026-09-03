"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

// Reads the current theme from the <html> class list; the class-change listeners
// are our own toggle calls, so a manual subscribe with a MutationObserver keeps
// the hook in sync without effect-driven setState.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  // Server snapshot is "light"; the pre-paint init script has already set the
  // real class before hydration, so the first client read is correct.
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
    listeners.forEach((l) => l());
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span suppressHydrationWarning>{theme === "dark" ? "🌙" : "☀️"}</span>
    </Button>
  );
}
