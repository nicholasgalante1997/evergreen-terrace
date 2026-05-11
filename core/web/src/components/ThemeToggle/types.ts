import type { Theme } from "@/hooks/useTheme"

export interface ThemeToggleViewProps {
  theme: Theme
  onToggle: () => void
}
