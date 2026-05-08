export const config = Object.freeze({
  queue: {
    server: { port: 2727 },
  },
  dashboard: {
    web: { port: 2728 },
  },
  metrics: {
    server: { port: 2729 },
  },
  sentinel: {
    server: { port: 2730 },
  },
  conductor: {
    server: { port: 2731 },
    maxConcurrent: 3,
  },
} as const);
