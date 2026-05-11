import type { Meta, StoryObj } from "@storybook/react"
import { Skeleton } from "./Component"

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton
}
export default meta

type Story = StoryObj<typeof Skeleton>

export const Default: Story = {
  args: { rows: 5 }
}

export const ThreeRows: Story = {
  args: { rows: 3 }
}
