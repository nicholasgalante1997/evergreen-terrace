import type { HeaderViewProps } from "./types"

const TABS = [
  {
    label: "Queue",
    path: "/",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    label: "Sentinel",
    path: "/momentum-sentinel",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: "Metrics",
    path: "/metrics",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    label: "Events",
    path: "/events",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    label: "Docs",
    path: "/docs",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
]

export function HeaderView({ pathname, onNavigate }: HeaderViewProps) {
  return (
    <nav className="leftnav">
      <div className="leftnav__brand">
        <span className="leftnav__brand-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="5" fill="#818cf8" fillOpacity="0.15" />
            <rect x="5" y="5" width="10" height="10" rx="2.5" fill="#818cf8" />
          </svg>
        </span>
        <span className="leftnav__brand-name">evergreen-terrace</span>
      </div>
      <div className="leftnav__body">
        {TABS.map(({ label, path, icon }) => {
          const active = path === "/" ? pathname === "/" : pathname.startsWith(path)
          return (
            <button
              key={path}
              className={`leftnav__item ${active ? "leftnav__item--active" : ""}`}
              onClick={() => onNavigate(path)}
            >
              <span className="leftnav__item-icon">{icon}</span>
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
