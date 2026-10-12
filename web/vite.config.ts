import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1400,
  },
})
