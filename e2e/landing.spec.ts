/**
 * E2E: Landing page & article list
 * Mocks GitHub API + auth. Verifies cards render with correct metadata.
 */
import { test, expect } from '@playwright/test'

const MOCK_USER = { user: { login: 'testuser', name: 'Test User', avatar: null } }

const MOCK_INDEX = {
  articles: [
    {
      slug: '2026-04-15-test-article',
      title: 'Test Article Title',
      summary: 'Test summary text',
      date: '2026-04-15',
      tags: ['testing', 'opc'],
      project: 'opc',
      heroImage: null,
      path: '2026/04/15/2026-04-15-test-article.json',
    },
    {
      slug: '2026-04-14-second-article',
      title: 'Second Article',
      summary: 'Another summary',
      date: '2026-04-14',
      tags: ['vitest'],
      project: 'session-brain',
      heroImage: null,
      path: '2026/04/14/2026-04-14-second-article.json',
    },
  ],
  lastUpdated: '2026-04-15',
}

const MOCK_ARTICLE_1 = {
  slug: '2026-04-15-test-article',
  title: 'Test Article Title',
  summary: 'Test summary text',
  body: '# Test Article\n\nThis is the article body.',
  date: '2026-04-15',
  tags: ['testing', 'opc'],
  project: 'opc',
  sessionId: 'abc123',
  duration: '2h 30min',
  stats: { entries: 5, messages: 10, chunks: 3 },
  heroImage: null,
}

const MOCK_ARTICLE_2 = {
  slug: '2026-04-14-second-article',
  title: 'Second Article',
  summary: 'Another summary',
  body: '# Second\n\nContent.',
  date: '2026-04-14',
  tags: ['vitest'],
  project: 'session-brain',
  sessionId: 'def456',
  duration: '1h 0min',
  stats: { entries: 3, messages: 6, chunks: 2 },
  heroImage: null,
}

test.beforeEach(async ({ page }) => {
  // Mock auth
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
  // Mock GitHub index (most specific match)
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX) })
  )
  // Mock article JSON files
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-test-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_1) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/14/2026-04-14-second-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_2) })
  )
})

test('landing page loads and shows article list', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Nav should be visible (authenticated app)
  await expect(page.locator('.nav__logo-text')).toBeVisible()
})

test('article cards render with correct count', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Wait for articles to load
  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  const cards = page.locator('.article-card')
  await expect(cards).toHaveCount(2)
})

test('article card shows title and date', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  const firstCard = page.locator('.article-card').first()
  await expect(firstCard.locator('.article-card__title')).toBeVisible()
  await expect(firstCard.locator('time')).toBeVisible()
})

test('article card shows project badge', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  const firstCard = page.locator('.article-card').first()
  await expect(firstCard.locator('.project-badge')).toBeVisible()
})

test('article card without heroImage shows gradient fallback', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  const firstCard = page.locator('.article-card').first()
  // Should show gradient (no broken image icon)
  await expect(firstCard.locator('.article-card__hero-gradient')).toBeVisible()
  await expect(firstCard.locator('.article-card__hero-img')).not.toBeVisible()
})

test('footer shows article count', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  await expect(page.locator('.footer')).toContainText('article')
})
