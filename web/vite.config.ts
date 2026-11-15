import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Relative base path: the static build works at any URL prefix (GitHub Pages project site, file server).
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
