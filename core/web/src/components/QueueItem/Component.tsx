import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import { SidebarRowView } from "./View"

export const SidebarRow = pipeline(memo)(SidebarRowView)
