/** @module SVG dependency graph: tasks and workers left to right, then integration and handoff. */

import type { GraphEdge, GraphNode } from "../../read-model/goal-view"

const width = 190
const height = 58
const gapX = 56
const gapY = 18

const position = (node: GraphNode) => ({ x: 12 + node.column * (width + gapX), y: 12 + node.row * (height + gapY) })

export const stateTone = (state: string): string => {
  if (["completed", "validated", "passed", "launched", "applied"].includes(state)) {
    return "good"
  }
  if (["failed", "conflicted", "blocked", "validation_failed", "rejected", "declined", "cancelled"].includes(state)) {
    return "bad"
  }
  if (["running", "executing", "started", "launching", "drafting", "discovering", "applying"].includes(state)) {
    return "active"
  }
  if (["awaiting_decision", "requested", "proposed", "needs_input"].includes(state)) {
    return "waiting"
  }
  return "idle"
}

export const DependencyGraph = ({ edges, nodes }: { edges: GraphEdge[]; nodes: GraphNode[] }) => {
  if (nodes.length === 0) {
    return <p className="muted">No plan or workers yet.</p>
  }
  const columns = Math.max(...nodes.map((node) => node.column)) + 1
  const rows = Math.max(...nodes.map((node) => node.row)) + 1
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return (
    <div className="graph-scroll">
      <svg
        aria-label="Goal dependency graph"
        className="graph"
        height={24 + rows * (height + gapY)}
        role="img"
        width={24 + columns * (width + gapX)}
      >
        <defs>
          <marker
            id="arrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
          >
            <path
              d="M0,0 L8,4 L0,8 z"
              className="graph-arrow"
            />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = byId.get(edge.from)
          const to = byId.get(edge.to)
          if (from === undefined || to === undefined) {
            return null
          }
          const start = position(from)
          const end = position(to)
          const x1 = start.x + width
          const y1 = start.y + height / 2
          const x2 = end.x
          const y2 = end.y + height / 2
          return (
            <path
              className="graph-edge"
              d={`M${x1},${y1} C${x1 + gapX / 2},${y1} ${x2 - gapX / 2},${y2} ${x2 - 2},${y2}`}
              key={`${edge.from}-${edge.to}`}
              markerEnd="url(#arrow)"
            />
          )
        })}
        {nodes.map((node) => {
          const { x, y } = position(node)
          return (
            <g
              className={`graph-node tone-${stateTone(node.state)}`}
              key={node.id}
              transform={`translate(${x},${y})`}
            >
              <title>{node.detail}</title>
              <rect
                height={height}
                rx="8"
                width={width}
              />
              <text
                className="graph-label"
                x="10"
                y="22"
              >
                {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
              </text>
              <text
                className="graph-state"
                x="10"
                y="42"
              >
                {node.kind} · {node.state}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
