import { memo } from "react"
import { MetricsView } from "@/views/MetricsView"
import { pipeline } from "@/utils/pipeline"

function MetricsPage() {
  return <MetricsView />
}

export default pipeline(memo)(MetricsPage)
