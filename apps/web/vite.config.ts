import { defineConfig } from "vite";

// Development-only same-origin proxy. The API itself must remain bound to loopback.
export default defineConfig({
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
