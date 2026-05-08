/** Minimal cron expression parser (minute hour dom month dow). No external deps. */

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [rangeStr, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (rangeStr === "*") {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (rangeStr!.includes("-")) {
      const [startStr, endStr] = rangeStr!.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      for (let i = start; i <= end; i += step) values.add(i);
    } else {
      values.add(parseInt(rangeStr!, 10));
    }
  }
  return values;
}

export function parseCron(expression: string): CronFields {
  const [minute, hour, dom, month, dow] = expression.trim().split(/\s+/);
  return {
    minutes: parseField(minute!, 0, 59),
    hours: parseField(hour!, 0, 23),
    daysOfMonth: parseField(dom!, 1, 31),
    months: parseField(month!, 1, 12),
    daysOfWeek: parseField(dow!, 0, 6),
  };
}

export function matches(fields: CronFields, date: Date): boolean {
  return (
    fields.minutes.has(date.getMinutes()) &&
    fields.hours.has(date.getHours()) &&
    fields.daysOfMonth.has(date.getDate()) &&
    fields.months.has(date.getMonth() + 1) &&
    fields.daysOfWeek.has(date.getDay())
  );
}

export function nextRun(fields: CronFields, from: Date): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  for (let i = 0; i < 525960; i++) {
    if (matches(fields, next)) return next;
    next.setMinutes(next.getMinutes() + 1);
  }
  return next;
}
