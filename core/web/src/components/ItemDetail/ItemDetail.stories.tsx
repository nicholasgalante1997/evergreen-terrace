import type { Meta, StoryObj } from "@storybook/react"
import { ItemDetailView } from "./View"

const mockItem = {
  item: {
    id: "a4f1c8d2-e93b-4f6a-b0c2-1d2e3f4a5b6c",
    title: "Implement streaming event parser for conductor output",
    project: "evergreen-terrace",
    type: "feature",
    priority: "p1",
    created: "2026-05-01T10:00:00Z",
    source: "manual"
  },
  delegation: { agent: "eng-mid", delegated_at: "2026-05-02T09:00:00Z" },
  context: {
    description:
      "The conductor streams claude -p output as NDJSON. We need a parser that emits structured BeadEvents for tool_use, output, and usage types.",
    acceptance:
      "## Acceptance Criteria\n- [ ] parseStreamLine handles text content\n- [x] parseStreamLine handles tool_use blocks\n- [ ] parseStreamLine handles result usage event\n- [ ] Non-JSON lines fall through as output events",
    links: ["core/conductor/src/polecat.ts", "core/conductor/src/types.ts"]
  }
}

const meta = {
  title: "Components/ItemDetail",
  component: ItemDetailView,
  parameters: { layout: "padded" }
} satisfies Meta<typeof ItemDetailView>

export default meta
type Story = StoryObj<typeof meta>

const baseArgs = {
  item: mockItem as any,
  selectedAgent: "eng-mid",
  busy: false,
  feedback: null,
  onAgentChange: () => {},
  onDispatch: () => {},
  onComplete: () => {},
  onReturn: () => {}
}

export const Inbox: Story = { args: { ...baseArgs, lane: "inbox" } }
export const Active: Story = { args: { ...baseArgs, lane: "active" } }
export const Completed: Story = { args: { ...baseArgs, lane: "completed" } }
export const Busy: Story = { args: { ...baseArgs, lane: "inbox", busy: true } }
export const WithSuccess: Story = {
  args: {
    ...baseArgs,
    lane: "inbox",
    feedback: { msg: "Dispatched to eng-mid", ok: true }
  }
}
export const WithError: Story = {
  args: {
    ...baseArgs,
    lane: "inbox",
    feedback: { msg: "Dispatch failed", ok: false }
  }
}
