import type { EmptyStateViewProps } from "./types"

export function EmptyStateView({ message, detail, action }: EmptyStateViewProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">◈</div>
      <div className="empty-state__msg">{message}</div>
      {detail && <div className="empty-state__detail">{detail}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
