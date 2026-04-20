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
    // Use `vercel dev` so /api/* routes are served alongside the Vite frontend.
    // Plain `vite` leaves API routes unresolved and causes most e2e assertions to fail.
    command: `npx vercel dev --listen ${E2E_PORT} --yes`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
