import { memo } from "react"
import { QueueView } from "@/views/QueueView"
import { pipeline } from "@/utils/pipeline"

function QueuePage() {
  return <QueueView />
}

export default pipeline(memo)(QueuePage)
