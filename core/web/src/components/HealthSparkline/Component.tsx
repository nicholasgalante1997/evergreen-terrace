import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import { HealthSparklineView } from "./View"

export const HealthSparkline = pipeline(memo)(HealthSparklineView)
