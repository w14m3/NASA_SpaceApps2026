import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Relative base so the static build works from any path (GitHub Pages, Netlify, Vercel, file server).
export default defineConfig({
  base: './',
  define: { CESIUM_BASE_URL: JSON.stringify('./cesium/') },
  plugins: [
    react(),
  ],
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
