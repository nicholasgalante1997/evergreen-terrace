import React from "react";
import type { QueueItemProps } from "./types";

function QueueItemCardComponent({ item }: QueueItemProps) {
  const agent = item.delegation.agent || "unassigned";

  return (
    <li className="queue-item">
      <p className="queue-item-title">
        <span className={`queue-item-priority priority-${item.item.priority}`}>
          {item.item.priority.toUpperCase()}
        </span>
        <span className="queue-item-title-text">{item.item.title}</span>
      </p>
      <p className="queue-item-meta">
        {item.item.project} · {agent}
      </p>
    </li>
  );
}

export const QueueItemCard = React.memo(QueueItemCardComponent);
