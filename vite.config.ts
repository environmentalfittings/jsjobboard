import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Project lives under OneDrive; native file watching often stalls / "not responding".
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
})
