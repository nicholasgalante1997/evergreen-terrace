import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import type { EmptyStateViewProps } from "./types"
import { EmptyStateView } from "./View"

function EmptyStateComponent(props: EmptyStateViewProps) {
  return <EmptyStateView {...props} />
}

export const EmptyState = pipeline(memo)(EmptyStateComponent)
