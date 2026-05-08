import { join } from "path";
import { unlinkSync } from "fs";
import TOML from "toml";
import type { QueueItem } from "@evergreen-terrace/common";

async function readTomlFiles(dir: string): Promise<QueueItem[]> {
  const glob = new Bun.Glob("*.toml");
  const items: QueueItem[] = [];
  for await (const file of glob.scan(dir)) {
    const text = await Bun.file(join(dir, file)).text();
    try {
      items.push(TOML.parse(text) as QueueItem);
    } catch {
      console.error(`[queue] failed to parse ${file}`);
    }
  }
  return items;
}

export function createStore(inbox: string, active: string) {
  async function getInbox(): Promise<QueueItem[]> {
    return readTomlFiles(inbox);
  }

  async function getActive(): Promise<QueueItem[]> {
    return readTomlFiles(active);
  }

  async function delegateItem(id: string, agent: string): Promise<boolean> {
    const glob = new Bun.Glob("*.toml");
    for await (const file of glob.scan(inbox)) {
      const path = join(inbox, file);
      const text = await Bun.file(path).text();
      const item = TOML.parse(text) as QueueItem;
      if (item.item.id !== id) continue;

      item.delegation.agent = agent;
      item.delegation.delegated_at = new Date().toISOString();

      await Bun.write(join(active, file), serializeToml(item));
      unlinkSync(path);
      return true;
    }
    return false;
  }

  return { getInbox, getActive, delegateItem };
}

function serializeToml(item: QueueItem): string {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    `[item]`,
    `id = "${escape(item.item.id)}"`,
    `title = "${escape(item.item.title)}"`,
    `project = "${escape(item.item.project)}"`,
    `type = "${item.item.type}"`,
    `priority = "${item.item.priority}"`,
    `created = "${item.item.created}"`,
    `source = "${item.item.source}"`,
    ``,
    `[delegation]`,
    `agent = "${escape(item.delegation.agent)}"`,
    `delegated_at = "${item.delegation.delegated_at}"`,
    ``,
    `[context]`,
    `description = "${escape(item.context.description)}"`,
    `acceptance = "${escape(item.context.acceptance)}"`,
    `links = [${item.context.links.map((l) => `"${escape(l)}"`).join(", ")}]`,
  ].join("\n");
}
