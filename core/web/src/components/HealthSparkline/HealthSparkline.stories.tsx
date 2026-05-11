import type { Meta, StoryObj } from "@storybook/react"
import { HealthSparklineView } from "./View"

const meta = {
  title: "Components/HealthSparkline",
  component: HealthSparklineView,
  parameters: { layout: "padded" }
} satisfies Meta<typeof HealthSparklineView>

export default meta
type Story = StoryObj<typeof meta>

export const Healthy: Story = {
  args: {
    history: {
      project: "pokemon-tcg",
      runs: [
        { project: "pokemon-tcg", score: 60, timestamp: "2026-05-01" },
        { project: "pokemon-tcg", score: 72, timestamp: "2026-05-03" },
        { project: "pokemon-tcg", score: 85, timestamp: "2026-05-06" },
        { project: "pokemon-tcg", score: 88, timestamp: "2026-05-09" }
      ]
    }
  }
}

export const AtRisk: Story = {
  args: {
    history: {
      project: "foresight",
      runs: [
        { project: "foresight", score: 80, timestamp: "2026-04-20" },
        { project: "foresight", score: 65, timestamp: "2026-04-28" },
        { project: "foresight", score: 55, timestamp: "2026-05-05" },
        { project: "foresight", score: 52, timestamp: "2026-05-09" }
      ]
    }
  }
}

export const Stale: Story = {
  args: {
    history: {
      project: "agartha-os",
      runs: [
        { project: "agartha-os", score: 40, timestamp: "2026-04-15" },
        { project: "agartha-os", score: 35, timestamp: "2026-04-30" },
        { project: "agartha-os", score: 28, timestamp: "2026-05-09" }
      ]
    }
  }
}
