import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

const read = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#0b0d12" : "#f6f7fb",
    );
    try {
      localStorage.setItem("ms-theme", theme);
    } catch {
      /* private mode — theme fakt ya session sathi */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
