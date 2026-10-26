/** @module Projection service composition root. */

import { ProjectionConsumer } from "./projection-consumer"
import { ProjectionServer } from "./http/projection-server"
import { ProjectionDatabase } from "./persistence/projection-database"
import { readPort, requireEnvironment } from "@evergreen-terrace/service-runtime"

const database = new ProjectionDatabase({
  readApiRole: requireEnvironment("ET_READ_API_DATABASE_USER"),
  url: requireEnvironment("ET_READ_DATABASE_URL")
})
const consumer = new ProjectionConsumer({ database, brokers: requireEnvironment("ET_KAFKA_BROKERS") })
await Promise.all([database.connect(), consumer.connect()])
await consumer.start()

const server = new ProjectionServer({ database, consumer, port: readPort(process.env["PORT"], 7430) })
server.start()

async function shutdown(): Promise<void> {
  server.stop()
  await Promise.allSettled([consumer.close(), database.close()])
  process.exit(0)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown()
  })
}
