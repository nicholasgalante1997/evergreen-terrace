import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { config } from "@evergreen-terrace/common"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  server: {
    port: config.dashboard.web.port,
    proxy: {
      "/queue": {
        target: `http://localhost:${config.queue.server.port}`,
        changeOrigin: true
      },
      "/metrics": {
        target: `http://localhost:${config.metrics.server.port}`,
        changeOrigin: true
      },
      "/sentinel": {
        target: `http://localhost:${config.sentinel.server.port}`,
        changeOrigin: true
      },
      "/conductor": {
        target: `http://localhost:${config.conductor.server.port}`,
        changeOrigin: true,
        ws: true
      },
      "/health": {
        target: `http://localhost:${config.queue.server.port}`,
        changeOrigin: true
      }
    }
  }
})
