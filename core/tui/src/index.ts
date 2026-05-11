import { config } from "@evergreen-terrace/common"
import type { QueueItem, QueueState } from "@evergreen-terrace/common"

const QUEUE_URL = `http://localhost:${config.queue.server.port}`

const PRIORITY_COLOR: Record<string, string> = {
  p0: "\x1b[31m",
  p1: "\x1b[33m",
  p2: "\x1b[36m",
  p3: "\x1b[90m"
}
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"

async function fetchQueue(): Promise<QueueState> {
  try {
    const res = await fetch(`${QUEUE_URL}/queue`)
    return (await res.json()) as QueueState
  } catch {
    console.error(`\x1b[31m[tui] queue-server not reachable at ${QUEUE_URL}\x1b[0m`)
    console.error(`      Run: bun run queue`)
    process.exit(1)
  }
}

function renderItem(item: QueueItem): void {
  const p = item.item.priority
  const color = PRIORITY_COLOR[p] ?? RESET
  const agent = item.delegation.agent ? `→ ${item.delegation.agent}` : "unassigned"
  console.log(`  ${color}${BOLD}[${p}]${RESET} ${item.item.title}`)
  console.log(`       ${DIM}${item.item.project} · ${agent}${RESET}`)
}

function renderSection(title: string, items: QueueItem[]): void {
  console.log(`\n${BOLD}${title}${RESET} ${DIM}(${items.length})${RESET}`)
  console.log("─".repeat(50))
  if (items.length === 0) {
    console.log(`  ${DIM}empty${RESET}`)
  } else {
    ;[...items].sort((a, b) => a.item.priority.localeCompare(b.item.priority)).forEach(renderItem)
  }
}

async function render(): Promise<void> {
  console.clear()
  console.log(`${BOLD}evergreen-terrace queue${RESET}  ${DIM}${new Date().toLocaleTimeString()}${RESET}`)
  const { inbox, active } = await fetchQueue()
  renderSection("INBOX", inbox)
  renderSection("ACTIVE", active)
  console.log(`\n${DIM}Press r to refresh · q to quit${RESET}`)
}

await render()

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on("data", async (key: Buffer) => {
    const k = key.toString()
    if (k === "r" || k === "\r") await render()
    if (k === "q" || k === "\x03") process.exit(0)
  })
}
