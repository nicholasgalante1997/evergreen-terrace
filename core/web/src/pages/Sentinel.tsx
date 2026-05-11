import { memo } from "react"
import { SentinelView } from "@/views/SentinelView"
import { pipeline } from "@/utils/pipeline"

function SentinelPage() {
  return <SentinelView />
}

export default pipeline(memo)(SentinelPage)
