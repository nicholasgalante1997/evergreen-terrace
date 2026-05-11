import type { DocsSidebarViewProps } from "./types"

export function DocsSidebarView({ sections, groups, activeSlug, onNavigate }: DocsSidebarViewProps) {
  return (
    <nav className="docs-sidebar">
      <div className="docs-sidebar__title">Documentation</div>
      {groups.map((group) => (
        <div key={group} className="docs-sidebar__group">
          <div className="docs-sidebar__group-label">{group}</div>
          {sections.filter((s) => s.group === group).map((s) => (
            <button
              key={s.slug}
              className={`docs-sidebar__item ${activeSlug === s.slug ? "docs-sidebar__item--active" : ""}`}
              onClick={() => onNavigate(s.slug)}
            >
              {s.title}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
