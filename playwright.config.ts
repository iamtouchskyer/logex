import { defineConfig, devices } from '@playwright/test'

// Use a dedicated port for E2E tests to avoid conflicts with other dev servers
const E2E_PORT = 5199

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Vite dev server. Every e2e spec mocks /api/* via page.route(), so no
    // backend is needed — `vercel dev` (the previous command) required Vercel
    // credentials and blocked credential-free CI entirely.
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
