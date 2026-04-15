/**
 * E2E: Article navigation — click card, open reader, back navigation
 */
import { test, expect } from '@playwright/test'

const MOCK_USER = { user: { login: 'testuser', name: 'Test User', avatar: null } }

const MOCK_INDEX = {
  articles: [
    {
      slug: '2026-04-15-test-article',
      title: 'Test Article for Navigation',
      summary: 'Navigation test summary',
      date: '2026-04-15',
      tags: ['testing'],
      project: 'opc',
      heroImage: null,
      path: '2026/04/15/2026-04-15-test-article.json',
    },
  ],
  lastUpdated: '2026-04-15',
}

const MOCK_ARTICLE = {
  slug: '2026-04-15-test-article',
  title: 'Test Article for Navigation',
  summary: 'Navigation test summary',
  body: '# Full Article Content\n\nThis is the full body of the test article. It has multiple paragraphs.\n\nSecond paragraph here.',
  date: '2026-04-15',
  tags: ['testing'],
  project: 'opc',
  sessionId: 'abc123def456',
  duration: '1h 30min',
  stats: { entries: 5, messages: 10, chunks: 3 },
  heroImage: null,
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-test-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE) })
  )
})

test('clicking card opens article reader', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Wait for card to appear
  const card = page.locator('.article-card').first()
  await expect(card).toBeVisible({ timeout: 10000 })

  // Click the card
  await card.click()

  // URL should have article slug in hash
  await expect(page).toHaveURL(/#\/articles\/2026-04-15-test-article/)

  // Reader h1 should appear within 2s
  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 2000 })
  await expect(page.locator('.reader__title')).toContainText('Test Article for Navigation')
})

test('reader shows article metadata', async ({ page }) => {
  // Navigate directly to article URL — loadArticle will call loadIndex then fetch path
  await page.goto('/#/articles/2026-04-15-test-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 10000 })

  // Date, project, duration
  await expect(page.locator('.reader__meta')).toBeVisible()

  // Summary
  await expect(page.locator('.reader__summary')).toBeVisible()
})

test('reader shows article body', async ({ page }) => {
  await page.goto('/#/articles/2026-04-15-test-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 10000 })

  // Body markdown should be rendered
  await expect(page.locator('.reader__body')).toBeVisible()
  await expect(page.locator('.reader__body')).toContainText('Full Article Content')
})

test('back button returns to article list', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const card = page.locator('.article-card').first()
  await expect(card).toBeVisible({ timeout: 10000 })
  await card.click()

  // In reader
  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 2000 })

  // Click back button
  await page.locator('.reader__back').click()

  // Article list should be visible again
  await expect(page.locator('.articles-feed')).toBeVisible({ timeout: 5000 })
})

test('keyboard navigation: Enter key opens article', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const card = page.locator('.article-card').first()
  await expect(card).toBeVisible({ timeout: 10000 })

  // Focus and press Enter
  await card.focus()
  await page.keyboard.press('Enter')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 2000 })
})
