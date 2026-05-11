import { memo, useMemo } from "react"
import { pipeline } from "@/utils/pipeline"
import { AgeDistributionView } from "./View"
import type { AgeDistributionProps, AgeBucket } from "./types"
import type { QueueMetric } from "@/hooks/useMetrics"

function bucketAge(metrics: QueueMetric[]): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { name: "Same day", count: 0 },
    { name: "1–3 days", count: 0 },
    { name: "4–7 days", count: 0 },
    { name: "7+ days", count: 0 }
  ]
  for (const m of metrics) {
    if (!m.delegatedAt) continue
    const days = (new Date(m.delegatedAt).getTime() - new Date(m.createdAt).getTime()) / 86_400_000
    if (days < 1) buckets[0]!.count++
    else if (days <= 3) buckets[1]!.count++
    else if (days <= 7) buckets[2]!.count++
    else buckets[3]!.count++
  }
  return buckets
}

function AgeDistributionComponent({ data }: AgeDistributionProps) {
  const buckets = useMemo(() => bucketAge(data), [data])
  return <AgeDistributionView buckets={buckets} />
}

export const AgeDistribution = pipeline(memo)(AgeDistributionComponent)
