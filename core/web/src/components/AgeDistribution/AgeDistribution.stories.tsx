import type { Meta, StoryObj } from "@storybook/react"
import { AgeDistributionView } from "./View"

const meta = {
  title: "Components/AgeDistribution",
  component: AgeDistributionView,
  parameters: { layout: "padded" }
} satisfies Meta<typeof AgeDistributionView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    buckets: [
      { name: "Same day", count: 3 },
      { name: "1–3 days", count: 7 },
      { name: "4–7 days", count: 4 },
      { name: "7+ days", count: 2 }
    ]
  }
}

export const Empty: Story = {
  args: {
    buckets: [
      { name: "Same day", count: 0 },
      { name: "1–3 days", count: 0 },
      { name: "4–7 days", count: 0 },
      { name: "7+ days", count: 0 }
    ]
  }
}
