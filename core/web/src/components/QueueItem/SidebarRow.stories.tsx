import React from "react"
import type { Meta, StoryObj } from "@storybook/react"
import { SidebarRowView } from "./View"

const mockItem = {
  item: {
    id: "abc-123",
    title: "Implement VelocityChart component",
    project: "evergreen-terrace",
    type: "feature",
    priority: "p1",
    created: "2026-05-01T10:00:00Z",
    source: "manual"
  },
  delegation: { agent: "eng-mid", delegated_at: "2026-05-02T09:00:00Z" },
  context: { description: "", acceptance: "", links: [] }
}

const meta = {
  title: "Components/SidebarRow",
  component: SidebarRowView,
  parameters: { layout: "padded" },
  decorators: [
    (Story: React.ComponentType) => (
      <ul style={{ listStyle: "none", width: 240, background: "#161b22" }}>
        <Story />
      </ul>
    )
  ]
} satisfies Meta<typeof SidebarRowView>

export default meta
type Story = StoryObj<typeof meta>

export const Unselected: Story = {
  args: { item: mockItem as any, selected: false, onClick: () => {} }
}

export const Selected: Story = {
  args: { item: mockItem as any, selected: true, onClick: () => {} }
}

export const P0Priority: Story = {
  args: {
    item: {
      ...mockItem,
      item: { ...mockItem.item, priority: "p0", title: "CRITICAL: Queue server down" }
    } as any,
    selected: false,
    onClick: () => {}
  }
}
