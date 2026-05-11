import React from "react"
import type { Meta, StoryObj } from "@storybook/react"
import { AgentFeedView } from "./View"
import type { AgentFeedViewProps } from "./types"

const scrollRef = { current: null }

const baseProps: AgentFeedViewProps = {
  queueItemId: "item-abc123",
  bead: null,
  events: [],
  streaming: false,
  error: null,
  promptData: null,
  promptLoading: false,
  autoScroll: true,
  actionBusy: false,
  actionFeedback: null,
  scrollRef: scrollRef as any,
  onAutoScrollChange: () => {},
  onDispatch: async () => true,
  onApprove: () => {},
  onReject: () => {},
  onRetry: () => {},
  onScrollToBottom: () => {}
}

const mockBead = {
  bead: {
    id: "bead-goal-abc-001",
    goal_id: "goal-abc",
    title: "Implement streaming event parser",
    role: "eng-mid",
    status: "in_progress",
    item_type: "feature",
    created: "2026-05-09T10:00:00Z",
    started: "2026-05-09T10:01:00Z",
    completed: ""
  },
  worker: {
    cwd: "/home/nicks-dgx/dev/evergreen-terrace",
    queue_item_id: "item-abc123",
    session_id: "sess-xyz"
  }
}

const mockEvents = [
  {
    ts: "2026-05-09T10:01:05Z",
    type: "status" as const,
    content: "Session ready · tools: Read, Write, Edit, Bash"
  },
  {
    ts: "2026-05-09T10:01:10Z",
    type: "status" as const,
    content: "starting in /home/nicks-dgx/dev/evergreen-terrace"
  },
  {
    ts: "2026-05-09T10:01:12Z",
    type: "tool_use" as const,
    content: "Read  core/conductor/src/polecat.ts",
    meta: { tool: "Read", input: { file_path: "core/conductor/src/polecat.ts" } }
  },
  {
    ts: "2026-05-09T10:01:14Z",
    type: "output" as const,
    content: "Reading polecat.ts to understand current stream handling..."
  },
  {
    ts: "2026-05-09T10:01:20Z",
    type: "tool_use" as const,
    content: "Bash  bun run typecheck",
    meta: { tool: "Bash", input: { command: "bun run typecheck" } }
  },
  {
    ts: "2026-05-09T10:01:35Z",
    type: "output" as const,
    content: "Type check passed. All types are valid."
  }
]

const meta = {
  title: "Components/AgentFeed",
  component: AgentFeedView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story: React.ComponentType) => (
      <div style={{ height: "600px", display: "flex" }}>
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AgentFeedView>

export default meta
type Story = StoryObj<typeof meta>

export const NoItemSelected: Story = {
  args: { ...baseProps, queueItemId: null }
}

export const NoConductorSession: Story = {
  args: { ...baseProps }
}

export const PromptPendingLoading: Story = {
  args: {
    ...baseProps,
    bead: { ...mockBead, bead: { ...mockBead.bead, status: "prompt_pending" } } as any,
    promptLoading: true
  }
}

export const PromptReady: Story = {
  args: {
    ...baseProps,
    bead: { ...mockBead, bead: { ...mockBead.bead, status: "prompt_pending" } } as any,
    promptData: {
      prompt:
        "Task: Implement streaming event parser\n\nDescription:\nThe conductor streams claude -p output as NDJSON...\n\nAcceptance criteria:\n- [ ] parseStreamLine handles text content\n- [ ] parseStreamLine handles tool_use blocks",
      systemPrompt: "You are eng-mid, a mid-level engineer agent...\n\n[Full system prompt would appear here]"
    }
  }
}

export const Streaming: Story = {
  args: {
    ...baseProps,
    bead: mockBead as any,
    events: mockEvents,
    streaming: true
  }
}

export const ReviewPending: Story = {
  args: {
    ...baseProps,
    bead: { ...mockBead, bead: { ...mockBead.bead, status: "review_pending" } } as any,
    events: [
      ...mockEvents,
      {
        ts: "2026-05-09T10:02:00Z",
        type: "usage" as const,
        content: "2,341 in / 847 out · $0.0082 · 12.4s",
        meta: { cost: 0.0082 }
      },
      {
        ts: "2026-05-09T10:02:01Z",
        type: "status" as const,
        content: "review_pending"
      }
    ]
  }
}

export const Completed: Story = {
  args: {
    ...baseProps,
    bead: { ...mockBead, bead: { ...mockBead.bead, status: "completed" } } as any,
    events: [
      ...mockEvents,
      {
        ts: "2026-05-09T10:02:00Z",
        type: "usage" as const,
        content: "2,341 in / 847 out · $0.0082 · 12.4s",
        meta: { cost: 0.0082 }
      }
    ]
  }
}

export const Failed: Story = {
  args: {
    ...baseProps,
    bead: { ...mockBead, bead: { ...mockBead.bead, status: "failed" } } as any,
    events: [
      ...mockEvents.slice(0, 3),
      {
        ts: "2026-05-09T10:01:50Z",
        type: "error" as const,
        content: "Process exited with code 1: claude: command not found"
      },
      {
        ts: "2026-05-09T10:01:51Z",
        type: "status" as const,
        content: "failed (exit 127)"
      }
    ]
  }
}
