/** @module Outbox relay composition root. */

import { KafkaEventPublisher } from "./kafka-event-publisher"
import { OutboxRelay } from "./outbox-relay"
import { OutboxRelayServer } from "./http/outbox-relay-server"
import { OutboxRelayDatabase } from "./persistence/outbox-relay-database"
import { readPort, requireEnvironment } from "@evergreen-terrace/service-runtime"

const commandDatabase = new OutboxRelayDatabase(requireEnvironment("ET_COMMAND_DATABASE_URL"))
const publisher = new KafkaEventPublisher(requireEnvironment("ET_KAFKA_BROKERS"))
await Promise.all([commandDatabase.connect(), publisher.connect()])

const relay = new OutboxRelay({ database: commandDatabase, publisher })
await relay.flush()
relay.start()

const server = new OutboxRelayServer({
  database: commandDatabase,
  port: readPort(process.env["PORT"], 7420),
  publisher
})
server.start()

async function shutdown(): Promise<void> {
  relay.stop()
  server.stop()
  await Promise.allSettled([publisher.close(), commandDatabase.close()])
  process.exit(0)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown()
  })
}
