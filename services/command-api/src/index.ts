/** @module Command API composition root. */

import { CommandApiServer } from "./http/command-api-server"
import { CommandDatabase } from "./persistence/command-database"
import { readPort, requireEnvironment } from "@evergreen-terrace/service-runtime"

const database = new CommandDatabase(requireEnvironment("ET_COMMAND_DATABASE_URL"))
await database.connect()

const server = new CommandApiServer({
  database,
  port: readPort(process.env["PORT"], 7410)
})
server.start()

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.stop()
    void database.close()
  })
}
