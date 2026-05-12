---
name: generic
description: Stack-neutral engineering conventions — strict types, explicit errors, async-first, clean code hygiene
tags: [typescript, conventions, error-handling, async, code-quality]
---

# Generic Engineering Conventions

## Priority

**High**

## Instructions

**NEVER** use `any` in TypeScript — use `unknown` with type guards or define the proper interface (ID: GEN-001)

**ALWAYS** use `import type` for type-only imports in TypeScript (ID: GEN-002)

**ALWAYS** use named exports for utilities and shared modules — never default exports (ID: GEN-003)

**NEVER** swallow errors silently in a `catch` block — handle the error or rethrow it (ID: GEN-004)

**NEVER** use `try/catch` as control flow for expected conditions — throw for truly exceptional paths only (ID: GEN-005)

**ALWAYS** use `async/await` over raw `.then()` chains (ID: GEN-006)

**ALWAYS** use `Promise.all` or `Promise.allSettled` for parallel independent async operations (ID: GEN-007)

**NEVER** leave magic numbers in code — extract to named constants with clear names (ID: GEN-008)

**NEVER** commit `console.log` calls — use a structured logger or remove before committing (ID: GEN-009)

**ALWAYS** write comments that explain WHY, not WHAT — the code explains what (ID: GEN-010)

### TypeScript Strict Mode

Required compiler options. Never disable these on a per-project or per-file basis:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

The `unknown` type with narrowing — never `any`:

```typescript
// CORRECT
function processInput(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  throw new Error(`unexpected input type: ${typeof value}`);
}

// WRONG — loses all type safety
function processInput(value: any): string {
  return value.trim(); // crashes at runtime if value is a number
}
```

`as const` union instead of enum:

```typescript
// CORRECT
const Status = {
  Pending: "pending",
  Running: "running",
  Done: "done",
  Failed: "failed",
} as const;
type Status = (typeof Status)[keyof typeof Status];

// WRONG
enum Status { Pending = "pending", Running = "running" }
```

### Error Handling

Typed error result pattern:

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.users.findById(id);
    if (!user) {
      return { success: false, error: new Error(`user not found: ${id}`) };
    }
    return { success: true, data: user };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: new Error(`db error fetching user: ${message}`) };
  }
}
```

Never swallow errors:

```typescript
// CORRECT — handle or rethrow
async function saveRecord(data: Record) {
  try {
    await db.save(data);
  } catch (err) {
    logger.error({ err, recordId: data.id }, "failed to save record");
    throw err; // rethrow so callers know something went wrong
  }
}

// WRONG — silent swallow
async function saveRecord(data: Record) {
  try {
    await db.save(data);
  } catch {
    // nothing here — caller has no idea this failed
  }
}
```

### Async Patterns

Parallel independent operations:

```typescript
// CORRECT — concurrent
const [user, projects, metrics] = await Promise.all([
  fetchUser(userId),
  fetchProjects(userId),
  fetchMetrics(userId),
]);

// WRONG — sequential when operations are independent
const user = await fetchUser(userId);
const projects = await fetchProjects(userId);
const metrics = await fetchMetrics(userId);
```

Always await in async functions — no fire-and-forget without explicit intent:

```typescript
// CORRECT — explicit fire-and-forget with comment
async function queueNotification(event: Event) {
  await saveEvent(event);
  // Intentionally not awaited — notification delivery is best-effort
  void sendNotification(event).catch((err) => logger.warn({ err }, "notification failed"));
}

// WRONG — accidental fire-and-forget
async function queueNotification(event: Event) {
  await saveEvent(event);
  sendNotification(event); // missing await — error is silently dropped
}
```

### Naming and Exports

```typescript
// Named exports only — no defaults for shared utilities
export function formatDate(date: Date): string { ... }
export type DateFormat = "iso" | "short" | "long";

// PascalCase for types and interfaces
interface UserProfile { ... }
type RequestOptions = { ... };

// camelCase for functions and variables
const activeUsers = await getActiveUsers();
function buildQueryString(params: Record<string, string>): string { ... }

// SCREAMING_SNAKE for true constants that never change
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
```

### Code Hygiene

No magic numbers — extract to named constants:

```typescript
// CORRECT
const MAX_QUEUE_SIZE = 100;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const RETRY_BACKOFF_BASE_MS = 250;

if (queue.length >= MAX_QUEUE_SIZE) { ... }
setTimeout(checkHealth, HEALTH_CHECK_INTERVAL_MS);

// WRONG
if (queue.length >= 100) { ... }
setTimeout(checkHealth, 30000);
```

Comments explain why, not what:

```typescript
// WRONG — explains what, not why
// Increment the counter
count++;

// CORRECT — explains the non-obvious constraint
// Start at 1, not 0, because the API uses 1-based page numbering
let page = 1;

// Skip items with null owner — they are system records excluded from user-facing views
const userItems = items.filter((item) => item.ownerId !== null);
```

## Common Mistakes

- **Using `any` to silence a TypeScript error**: This disables the type checker on that value and all its downstream uses. The right fix is to define the correct interface or use `unknown` with a narrowing check.
- **Empty catch blocks**: A caught error that produces no log, no rethrow, and no return means a failure disappears completely. Always log or rethrow.
- **Sequential awaiting of independent promises**: If three database calls don't depend on each other's results, they should run with `Promise.all`. Sequential awaiting triples the latency for no reason.
- **Default exports from utility modules**: Default exports force the importer to choose a name, break tree-shaking in some bundlers, and make rename refactors inconsistent. Named exports always.
- **Magic numbers in conditionals**: `if (count > 50)` — what is 50? Where is it documented? Extract to `MAX_ITEMS_PER_PAGE` and the reader understands immediately.
- **`console.log` in production code**: `console.log` is not structured, not filterable, and noisy in production. Use a structured logger (`pino`, `winston`, `tracing`, etc.) or remove the statement before committing.
