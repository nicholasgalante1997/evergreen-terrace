import type { SidebarRowProps } from "./types"

export function SidebarRowView({ item, selected, onClick }: SidebarRowProps) {
  const p = item.item.priority
  const agent = item.delegation.agent || "unassigned"
  return (
    <li
      className={`srow ${selected ? "srow--selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick()
      }}
    >
      <div className="srow__top">
        <span className={`srow__priority srow__priority--${p}`}>{p.toUpperCase()}</span>
        <span className="srow__title">{item.item.title}</span>
      </div>
      <div className="srow__meta">
        {item.item.project} · {agent}
      </div>
    </li>
  )
}
