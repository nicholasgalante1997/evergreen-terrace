import type { ComponentType } from "react"

export interface DocSection {
  slug: string
  title: string
  description: string
  group: string
}

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "getting-started",
    group: "Overview",
    title: "Getting Started",
    description: "Prerequisites, first-time setup, and starting the system",
  },
  {
    slug: "queue",
    group: "Core Concepts",
    title: "The Work Queue",
    description: "How items flow from inbox to active to completed",
  },
  {
    slug: "model-a",
    group: "Workflows",
    title: "Model A — Interactive",
    description: "Working with Claude Code directly, using queue items as briefs",
  },
  {
    slug: "model-b",
    group: "Workflows",
    title: "Model B — Conductor",
    description: "Automated dispatch, prompt review, streaming output, and review gates",
  },
  {
    slug: "sentinel",
    group: "Workflows",
    title: "Running the Sentinel",
    description: "Momentum scoring, reading reports, and managing project health",
  },
  {
    slug: "agents",
    group: "Reference",
    title: "Agent Roles",
    description: "Available agents, their models, tools, and when to use each",
  },
  {
    slug: "schema",
    group: "Reference",
    title: "Queue Item Schema",
    description: "TOML structure, field descriptions, and examples for all item types",
  },
]

export const DOC_GROUPS = [...new Set(DOC_SECTIONS.map((s) => s.group))]

export async function loadDocContent(slug: string): Promise<{ default: ComponentType } | null> {
  const modules: Record<string, () => Promise<{ default: ComponentType }>> = {
    "getting-started": () => import("./getting-started"),
    "queue":           () => import("./queue"),
    "model-a":         () => import("./model-a"),
    "model-b":         () => import("./model-b"),
    "sentinel":        () => import("./sentinel"),
    "agents":          () => import("./agents"),
    "schema":          () => import("./schema"),
  }
  const loader = modules[slug]
  return loader ? loader() : null
}
