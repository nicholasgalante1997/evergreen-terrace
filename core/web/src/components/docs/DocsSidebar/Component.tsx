import { memo } from "react"
import { pipeline } from "@/utils/pipeline"
import type { DocsSidebarViewProps } from "./types"
import { DocsSidebarView } from "./View"

function DocsSidebarComponent(props: DocsSidebarViewProps) {
  return <DocsSidebarView {...props} />
}

export const DocsSidebar = pipeline(memo)(DocsSidebarComponent)
