import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 so http://localhost:5173 and Cursor port forwarding work
    // (default can end up on ::1 only, which breaks 127.0.0.1 / some clients).
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
