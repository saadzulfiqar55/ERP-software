"use client";

import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "./Button";
import { SegmentedButton } from "./Chip";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "albarka-theme";
const THEME_EVENT = "albarka-theme-change";

let activeViewTransitions = 0;
let fallbackTransitionTimer: number | null = null;

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "light";
}

function applyThemeToDocument(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
  return resolved;
}

/**
 * Shared hook to read & update Material 3 Light/Dark/System theme across components.
 */
export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>("light");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => {
      const pref = readStoredPreference();
      setPreference(pref);
      setResolvedTheme(applyThemeToDocument(pref));
    };

    sync();
    setMounted(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (readStoredPreference() === "system") {
        sync();
      }
    };

    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    media.addEventListener("change", onMediaChange);

    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  const updateTheme = (next: ThemePreference) => {
    const commitTheme = () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
        applyThemeToDocument(next);
        window.dispatchEvent(new Event(THEME_EVENT));
      }
      setPreference(next);
      setResolvedTheme(resolveTheme(next));
    };

    if (typeof window === "undefined" || typeof document === "undefined") {
      commitTheme();
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) {
      commitTheme();
      return;
    }

    const root = document.documentElement;
    const startVT = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      }
    ).startViewTransition;

    if (typeof startVT === "function") {
      // Freeze element-level CSS transitions for the snapshot so buttons, inputs,
      // and surfaces cross-fade together cleanly in one compositor pass.
      activeViewTransitions += 1;
      root.classList.add("theme-snap");
      const transition = startVT.call(document, () => {
        flushSync(() => {
          commitTheme();
        });
      });
      transition.finished.finally(() => {
        activeViewTransitions = Math.max(0, activeViewTransitions - 1);
        if (activeViewTransitions === 0) {
          root.classList.remove("theme-snap");
        }
      });
      return;
    }

    // Fallback for browsers without View Transitions API: unify color transitions
    if (fallbackTransitionTimer !== null) {
      window.clearTimeout(fallbackTransitionTimer);
    }
    root.classList.add("theme-transitioning");
    commitTheme();
    fallbackTransitionTimer = window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
      fallbackTransitionTimer = null;
    }, 260);
  };

  const toggleLightDark = () => {
    const next: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    updateTheme(next);
  };

  return {
    preference,
    resolvedTheme,
    mounted,
    setTheme: updateTheme,
    toggleLightDark,
  };
}

/**
 * Reusable Material 3 Top-Bar Icon Button for toggling Dark / Light Mode.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, mounted, toggleLightDark } = useThemePreference();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleLightDark}
      className={className}
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-md-primary" strokeWidth={1.8} />
      ) : (
        <Moon className="w-5 h-5" strokeWidth={1.8} />
      )}
    </Button>
  );
}

/**
 * Reusable Material 3 Segmented Control for Light / Dark / System theme selection.
 */
export function ThemeSelector() {
  const { preference, mounted, setTheme } = useThemePreference();

  const currentValue = mounted ? preference : "light";

  return (
    <SegmentedButton
      value={currentValue}
      onChange={(v) => setTheme(v as ThemePreference)}
      options={[
        {
          value: "light",
          label: "Light",
          icon: <Sun className="w-3.5 h-3.5" strokeWidth={1.8} />,
        },
        {
          value: "dark",
          label: "Dark",
          icon: <Moon className="w-3.5 h-3.5" strokeWidth={1.8} />,
        },
        {
          value: "system",
          label: "System",
          icon: <Monitor className="w-3.5 h-3.5" strokeWidth={1.8} />,
        },
      ]}
    />
  );
}
