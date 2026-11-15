import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: '../reports/e2e.json' }]],
  // E2E_BASE_URL runs the suite against a deployed site (scripts/check-deploy.mjs); otherwise the local preview
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173/', trace: 'off' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://localhost:4173/',
        reuseExistingServer: true,
        timeout: 60_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
