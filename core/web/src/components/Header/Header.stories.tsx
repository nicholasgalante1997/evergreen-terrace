import type { Meta, StoryObj } from "@storybook/react"
import { HeaderView } from "./View"

const meta = {
  title: "Components/Header",
  component: HeaderView,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof HeaderView>

export default meta
type Story = StoryObj<typeof meta>

export const Queue: Story = {
  args: { pathname: "/", onNavigate: () => {} }
}

export const Sentinel: Story = {
  args: { pathname: "/momentum-sentinel", onNavigate: () => {} }
}

export const Metrics: Story = {
  args: { pathname: "/metrics", onNavigate: () => {} }
}
