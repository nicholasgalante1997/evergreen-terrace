import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import type { SkeletonViewProps } from "./types"
import { SkeletonView } from "./View"

function SkeletonComponent(props: SkeletonViewProps) {
  return <SkeletonView {...props} />
}

export const Skeleton = pipeline(memo)(SkeletonComponent)
