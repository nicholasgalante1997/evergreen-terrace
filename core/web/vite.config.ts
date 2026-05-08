import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { config } from "@evergreen-terrace/common";

export default defineConfig({
  plugins: [react()],
  server: {
    port: config.dashboard.web.port,
    proxy: {
      "/queue": {
        target: `http://localhost:${config.queue.server.port}`,
        changeOrigin: true,
      },
      "/metrics": {
        target: `http://localhost:${config.metrics.server.port}`,
        changeOrigin: true,
      },
    },
  },
});
