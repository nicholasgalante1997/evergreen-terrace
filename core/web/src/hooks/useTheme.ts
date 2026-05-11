import { useState, useEffect, useCallback } from "react"

export type Theme = "dark" | "light"

const STORAGE_KEY = "et-theme"

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "dark" || stored === "light") return stored
  return getSystemTheme()
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme
}

export interface UseThemeResult {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setThemeState(e.matches ? "light" : "dark")
      }
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"))
  }, [])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])

  return { theme, toggle, setTheme }
}
