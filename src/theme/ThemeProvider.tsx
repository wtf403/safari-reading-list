import React, { useEffect, useState } from "react";
import { Theme, ThemeContext } from "./ThemeContext";
import Browser from "webextension-polyfill";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // Load saved theme
    Browser.storage.local.get("theme").then((result) => {
      if (result.theme) setTheme(result.theme as Theme);
    });
  }, []);

  useEffect(() => {
    // Save theme changes
    Browser.storage.local.set({ theme });

    // Apply theme
    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    document.documentElement.classList.remove("light", "dark");

    if (theme !== "system") {
      document.documentElement.classList.add(theme);
    } else if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.add("light");
    }

    // Listen for system theme changes when in system mode
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
