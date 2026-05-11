import type { DocSection } from "@/docs"

export interface DocsSidebarViewProps {
  sections: DocSection[]
  groups: string[]
  activeSlug: string
  onNavigate: (slug: string) => void
}
