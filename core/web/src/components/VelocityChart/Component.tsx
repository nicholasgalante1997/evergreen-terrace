import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import { VelocityChartView } from "./View"

export const VelocityChart = pipeline(memo)(VelocityChartView)
