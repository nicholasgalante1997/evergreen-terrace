import React from "react";
import { QueueItemCard } from "./QueueItem";
import type { SectionProps } from "./types";

function SectionComponent({ title, items }: SectionProps) {
  const sorted = [...items].sort((a, b) =>
    a.item.priority.localeCompare(b.item.priority),
  );

  return (
    <section className="section">
      <h2 className="section-header">
        {title}
        <span className="section-count">({items.length})</span>
      </h2>
      {sorted.length === 0 ? (
        <p className="section-empty">empty</p>
      ) : (
        <ul className="section-list">
          {sorted.map((item) => <QueueItemCard key={item.item.id} item={item} />)}
        </ul>
      )}
    </section>
  );
}

export const Section = React.memo(SectionComponent);
