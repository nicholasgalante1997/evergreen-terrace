import { join } from "path"
import { unlinkSync } from "fs"
import TOML from "toml"
import type { QueueItem } from "@evergreen-terrace/common"

async function readTomlFiles(dir: string): Promise<QueueItem[]> {
  const glob = new Bun.Glob("*.toml")
  const items: QueueItem[] = []
  for await (const file of glob.scan(dir)) {
    const text = await Bun.file(join(dir, file)).text()
    try {
      items.push(TOML.parse(text) as QueueItem)
    } catch {
      console.error(`[queue] failed to parse ${file}`)
    }
  }
  return items
}

async function findItemFile(dir: string, id: string): Promise<{ path: string; item: QueueItem } | null> {
  const glob = new Bun.Glob("*.toml")
  for await (const file of glob.scan(dir)) {
    const path = join(dir, file)
    const text = await Bun.file(path).text()
    try {
      const item = TOML.parse(text) as QueueItem
      if (item.item.id === id) return { path, item }
    } catch {
      // skip
    }
  }
  return null
}

export function createStore(inbox: string, active: string, completed: string) {
  async function getInbox(): Promise<QueueItem[]> {
    return readTomlFiles(inbox)
  }

  async function getActive(): Promise<QueueItem[]> {
    return readTomlFiles(active)
  }

  async function getCompleted(): Promise<QueueItem[]> {
    return readTomlFiles(completed)
  }

  /**
   * Moves an item from inbox to active, stamps delegation info.
   * Returns the updated item on success, null if not found.
   */
  async function delegateItem(id: string, agent: string): Promise<QueueItem | null> {
    const found = await findItemFile(inbox, id)
    if (!found) return null

    found.item.delegation.agent = agent
    found.item.delegation.delegated_at = new Date().toISOString()

    const filename = found.path.split("/").at(-1)!
    await Bun.write(join(active, filename), serializeToml(found.item))
    unlinkSync(found.path)
    return found.item
  }

  async function completeItem(id: string): Promise<boolean> {
    const found = await findItemFile(active, id)
    if (!found) return false

    const filename = found.path.split("/").at(-1)!
    await Bun.write(join(completed, filename), serializeToml(found.item))
    unlinkSync(found.path)
    return true
  }

  async function returnItem(id: string): Promise<boolean> {
    const found = await findItemFile(active, id)
    if (!found) return false

    found.item.delegation.delegated_at = ""

    const filename = found.path.split("/").at(-1)!
    await Bun.write(join(inbox, filename), serializeToml(found.item))
    unlinkSync(found.path)
    return true
  }

  return { getInbox, getActive, getCompleted, delegateItem, completeItem, returnItem }
}

function escapeBasic(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function serializeString(key: string, value: string): string {
  if (value.includes("\n")) {
    return `${key} = """\n${value}\n"""`
  }
  return `${key} = "${escapeBasic(value)}"`
}

function serializeToml(item: QueueItem): string {
  const linksList = item.context.links.map((l) => `"${escapeBasic(l)}"`).join(", ")

  return [
    `[item]`,
    `id = "${escapeBasic(item.item.id)}"`,
    `title = "${escapeBasic(item.item.title)}"`,
    `project = "${escapeBasic(item.item.project)}"`,
    `type = "${item.item.type}"`,
    `priority = "${item.item.priority}"`,
    `created = "${item.item.created}"`,
    `source = "${item.item.source}"`,
    ``,
    `[delegation]`,
    `agent = "${escapeBasic(item.delegation.agent)}"`,
    `delegated_at = "${item.delegation.delegated_at}"`,
    ``,
    `[context]`,
    serializeString("description", item.context.description),
    serializeString("acceptance", item.context.acceptance),
    `links = [${linksList}]`
  ].join("\n")
}
