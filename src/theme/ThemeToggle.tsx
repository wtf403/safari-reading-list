import React, { useContext, useEffect, useState } from "react";
import { Theme, ThemeContext } from "./ThemeContext";
import "../styles/themeToggle.css";

export function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  const [mounted, setMounted] = useState(false);

  // After mounting, we can safely show the theme toggle
  // This avoids hydration mismatch in SSR environments
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="theme-toggle-container">
      <div className="theme-switch">
        <button
          className={`theme-option system ${
            theme === "system" ? "active" : ""
          }`}
          onClick={() => setTheme("system")}
          aria-label="System theme"
          title="System theme"
        >
          <svg
            className="icon system-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm0-18c4.42 0 8 3.58 8 8s-3.58 8-8 8-8-3.58-8-8 3.58-8 8-8z" />
            <path d="M12 16a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </button>
        <button
          className={`theme-option light ${theme === "light" ? "active" : ""}`}
          onClick={() => setTheme("light")}
          aria-label="Light theme"
          title="Light theme"
        >
          <svg
            className="icon light-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 17a5 5 0 100-10 5 5 0 000 10z" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <button
          className={`theme-option dark ${theme === "dark" ? "active" : ""}`}
          onClick={() => setTheme("dark")}
          aria-label="Dark theme"
          title="Dark theme"
        >
          <svg
            className="icon dark-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>
        <div
          className="theme-slider"
          style={{
            left: `calc(${
              theme === "system" ? 0 : theme === "light" ? 33.33 : 66.66
            }% - 2px)`,
          }}
        ></div>
      </div>
    </div>
  );
}
