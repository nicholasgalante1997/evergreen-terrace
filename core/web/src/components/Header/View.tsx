import type { HeaderViewProps } from "./types"

const TABS = [
  { label: "Queue", path: "/" },
  { label: "Sentinel", path: "/momentum-sentinel" },
  { label: "Metrics", path: "/metrics" },
  { label: "Events", path: "/events" }
]

export function HeaderView({ pathname, onNavigate }: HeaderViewProps) {
  return (
    <header className="header">
      <span className="header__title">evergreen-terrace</span>
      <nav className="tab-nav">
        {TABS.map(({ label, path }) => (
          <button
            key={path}
            className={`tab-btn ${pathname === path ? "tab-active" : ""}`}
            onClick={() => onNavigate(path)}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  )
}
