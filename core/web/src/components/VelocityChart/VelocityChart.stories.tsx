import type { Meta, StoryObj } from "@storybook/react"
import { VelocityChartView } from "./View"

const mockData = [
  { date: "05-01", created: 3, delegated: 2, completed: 1 },
  { date: "05-02", created: 1, delegated: 3, completed: 2 },
  { date: "05-03", created: 4, delegated: 2, completed: 3 },
  { date: "05-04", created: 2, delegated: 1, completed: 4 },
  { date: "05-05", created: 0, delegated: 2, completed: 2 },
  { date: "05-06", created: 5, delegated: 3, completed: 1 },
  { date: "05-07", created: 2, delegated: 4, completed: 3 }
]

const meta = {
  title: "Components/VelocityChart",
  component: VelocityChartView,
  parameters: { layout: "padded" }
} satisfies Meta<typeof VelocityChartView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { data: mockData } }
export const Empty: Story = { args: { data: [] } }
