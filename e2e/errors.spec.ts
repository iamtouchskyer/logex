/**
 * E2E: Error states — index fetch failure, article not found
 */
import { test, expect } from '@playwright/test'

const MOCK_USER = { user: { login: 'testuser', name: 'Test User', avatar: null } }

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
})

test('index fetch failure shows error state', async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 500, body: 'Internal Server Error' })
  )

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Error state should show
  await expect(page.locator('.state-message--error')).toBeVisible({ timeout: 10000 })
})

test('article not found shows error state in reader', async ({ page }) => {
  // Mock index with the article
  const MOCK_INDEX = {
    articles: [
      {
        slug: '2026-04-15-test-article',
        title: 'Test Article',
        summary: 'Test',
        date: '2026-04-15',
        tags: [],
        project: 'opc',
        heroImage: null,
        path: '2026/04/15/2026-04-15-test-article.json',
      },
    ],
    lastUpdated: '2026-04-15',
  }
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX) })
  )
  // Make the article fetch fail
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-test-article.json', (route) =>
    route.fulfill({ status: 404, body: 'Not Found' })
  )

  await page.goto('/#/articles/2026-04-15-test-article')
  await page.waitForLoadState('networkidle')

  // Error state should show in reader
  await expect(page.locator('.state-message--error')).toBeVisible({ timeout: 10000 })
  // Back button should be available
  await expect(page.locator('.btn--secondary')).toBeVisible()
})

test('article reader error back button navigates to articles list', async ({ page }) => {
  const MOCK_INDEX = {
    articles: [
      {
        slug: '2026-04-15-test-article',
        title: 'Test Article',
        summary: 'Test',
        date: '2026-04-15',
        tags: [],
        project: 'opc',
        heroImage: null,
        path: '2026/04/15/2026-04-15-test-article.json',
      },
    ],
    lastUpdated: '2026-04-15',
  }
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-test-article.json', (route) =>
    route.fulfill({ status: 404, body: 'Not Found' })
  )

  await page.goto('/#/articles/2026-04-15-test-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.state-message--error')).toBeVisible({ timeout: 10000 })

  // Click back button
  await page.locator('.btn--secondary').click()

  // Should return to articles list
  await expect(page.locator('.articles-list')).toBeVisible({ timeout: 5000 })
})
