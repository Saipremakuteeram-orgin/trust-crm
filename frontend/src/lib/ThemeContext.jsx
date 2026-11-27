import { createContext, useContext, useEffect, useState } from "react";

// Bumped key: earlier visits persisted "theme" = "light" automatically, so a
// new key lets the dark default actually reach returning users.
export const THEME_KEY = "theme.v2";

const ThemeContext = createContext({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
