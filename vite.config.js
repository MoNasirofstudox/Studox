import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Required for StackBlitz WebContainers
    hmr: { clientPort: 443 },
    allowedHosts: 'all',
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    // Ensure service worker is not processed by Vite
    rollupOptions: {
      input: { main: './index.html' },
    },
  },
})
