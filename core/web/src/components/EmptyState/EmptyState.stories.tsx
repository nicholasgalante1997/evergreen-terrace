import type { Meta, StoryObj } from "@storybook/react"
import { EmptyState } from "./Component"

const meta: Meta<typeof EmptyState> = {
  title: "Components/EmptyState",
  component: EmptyState
}
export default meta

type Story = StoryObj<typeof EmptyState>

export const Default: Story = {
  args: { message: "Nothing here yet" }
}

export const WithDetail: Story = {
  args: {
    message: "No items in queue",
    detail: "Dispatch a ticket to get started."
  }
}
