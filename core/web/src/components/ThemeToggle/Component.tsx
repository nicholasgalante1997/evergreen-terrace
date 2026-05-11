import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import { useTheme } from "@/hooks/useTheme"
import { ThemeToggleView } from "./View"

function ThemeToggleComponent() {
  const { theme, toggle } = useTheme()
  return (
    <ThemeToggleView
      theme={theme}
      onToggle={toggle}
    />
  )
}

export const ThemeToggle = pipeline(memo)(ThemeToggleComponent)
