import { memo, useState, useEffect, useTransition } from "react"
import { useParams, useNavigate } from "react-router"
import type { ComponentType } from "react"
import { pipeline } from "@/utils/pipeline"
import { DOC_SECTIONS, DOC_GROUPS, loadDocContent } from "@/docs"
import { DocsSidebar } from "@/components/docs/DocsSidebar"

function DocsPageComponent() {
  const { slug = "getting-started" } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const [Content, setContent] = useState<ComponentType | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void loadDocContent(slug).then((mod) => {
      if (!cancelled && mod) {
        startTransition(() => setContent(() => mod.default))
      }
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    const idx = DOC_SECTIONS.findIndex((s) => s.slug === slug)
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft" && idx > 0) {
        navigate(`/docs/${DOC_SECTIONS[idx - 1]!.slug}`)
      }
      if (e.altKey && e.key === "ArrowRight" && idx < DOC_SECTIONS.length - 1) {
        navigate(`/docs/${DOC_SECTIONS[idx + 1]!.slug}`)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [slug, navigate])

  const currentSection = DOC_SECTIONS.find((s) => s.slug === slug) ?? DOC_SECTIONS[0]!

  return (
    <div className="docs-layout">
      <DocsSidebar
        sections={DOC_SECTIONS}
        groups={DOC_GROUPS}
        activeSlug={slug}
        onNavigate={(s: string) => navigate(`/docs/${s}`)}
      />
      <main className="docs-content">
        <div className="docs-content__breadcrumb">
          <span>{currentSection.group}</span>
          <span className="docs-breadcrumb-sep">›</span>
          <span>{currentSection.title}</span>
        </div>
        <div className="docs-content__body">
          {isPending && <div className="docs-loading">Loading…</div>}
          {!isPending && Content && <Content />}
        </div>
      </main>
    </div>
  )
}

export default pipeline(memo)(DocsPageComponent)
