import type { SkeletonViewProps } from "./types"

export function SkeletonView({ rows = 5, className }: SkeletonViewProps) {
  return (
    <div className={`skeleton ${className ?? ""}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton__row"
        >
          <div className="skeleton__dot" />
          <div
            className="skeleton__line"
            style={{ width: `${60 + (i % 3) * 15}%` }}
          />
        </div>
      ))}
    </div>
  )
}
