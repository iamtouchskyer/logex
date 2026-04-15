/**
 * E2E: Auth states — unauthenticated landing, authenticated app
 */
import { test, expect } from '@playwright/test'

test('unauthenticated user sees Landing page with sign-in CTA', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: null }) })
  )

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Landing page should render
  await expect(page.locator('.landing')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.landing__cta')).toBeVisible()
  await expect(page.locator('.landing__cta')).toContainText('Sign in')

  // App nav should NOT be visible
  await expect(page.locator('.nav__links')).not.toBeVisible()
})

test('unauthenticated user sees Landing brand name', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: null }) })
  )

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.landing__brand')).toBeVisible()
  await expect(page.locator('.landing__brand')).toContainText('Logex')
})

test('authenticated user sees nav username', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { login: 'testuser', name: 'Test User', avatar: null } }),
    })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ articles: [], lastUpdated: '2026-04-15' }),
    })
  )

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.nav__username')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.nav__username')).toContainText('testuser')
})
