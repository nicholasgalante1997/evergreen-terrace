/** @module Read API composition root. */

import { ReadApiServer } from "./http/read-api-server"
import { ReadDatabase } from "./persistence/read-database"
import { readPort, requireEnvironment } from "@evergreen-terrace/service-runtime"

const database = new ReadDatabase(requireEnvironment("ET_READ_DATABASE_URL"))
await database.connect()

const server = new ReadApiServer({ database, port: readPort(process.env["PORT"], 7440) })
server.start()

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.stop()
    void database.close()
  })
}
