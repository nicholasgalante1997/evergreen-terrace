import type { QueueItem } from "@evergreen-terrace/common"

export interface SidebarRowProps {
  item: QueueItem
  selected: boolean
  onClick: () => void
}
