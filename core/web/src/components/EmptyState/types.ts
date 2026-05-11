import type { ReactNode } from "react"

export interface EmptyStateViewProps {
  message: string
  detail?: string
  action?: ReactNode
}
