/**
 * E2E: Search and project filter functionality
 */
import { test, expect } from '@playwright/test'

const MOCK_USER = { user: { login: 'testuser', name: 'Test User', avatar: null } }

const MOCK_INDEX = {
  articles: [
    {
      slug: '2026-04-15-opc-article',
      title: 'OPC Design Review',
      summary: 'An article about OPC pipeline design',
      date: '2026-04-15',
      tags: ['opc', 'review'],
      project: 'opc',
      heroImage: null,
      path: '2026/04/15/2026-04-15-opc-article.json',
    },
    {
      slug: '2026-04-14-session-brain-article',
      title: 'Session Brain Architecture',
      summary: 'How session brain works internally',
      date: '2026-04-14',
      tags: ['vitest', 'typescript'],
      project: 'session-brain',
      heroImage: null,
      path: '2026/04/14/2026-04-14-session-brain-article.json',
    },
  ],
  lastUpdated: '2026-04-15',
}

const MOCK_ARTICLE_OPC = {
  slug: '2026-04-15-opc-article',
  title: 'OPC Design Review',
  summary: 'An article about OPC pipeline design',
  body: '# OPC\n\nContent.',
  date: '2026-04-15',
  tags: ['opc', 'review'],
  project: 'opc',
  sessionId: 'abc',
  duration: '1h 0min',
  stats: { entries: 5, messages: 10, chunks: 3 },
  heroImage: null,
}

const MOCK_ARTICLE_SB = {
  slug: '2026-04-14-session-brain-article',
  title: 'Session Brain Architecture',
  summary: 'How session brain works internally',
  body: '# Session Brain\n\nContent.',
  date: '2026-04-14',
  tags: ['vitest', 'typescript'],
  project: 'session-brain',
  sessionId: 'def',
  duration: '2h 0min',
  stats: { entries: 8, messages: 16, chunks: 4 },
  heroImage: null,
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-opc-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_OPC) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/14/2026-04-14-session-brain-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_SB) })
  )
})

test('search filters cards by title', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.article-card')).toHaveCount(2)

  // Search for second article
  await page.locator('.search-bar__input').fill('Session Brain')

  await expect(page.locator('.article-card')).toHaveCount(1)
  await expect(page.locator('.article-card__title')).toContainText('Session Brain Architecture')
})

test('search filters cards by tag', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // 'opc' tag only on first article
  await page.locator('.search-bar__input').fill('opc')

  await expect(page.locator('.article-card')).toHaveCount(1)
  await expect(page.locator('.article-card__title')).toContainText('OPC Design Review')
})

test('search with no match shows empty state', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  await page.locator('.search-bar__input').fill('zzznomatch')

  await expect(page.locator('.article-card')).toHaveCount(0)
  await expect(page.locator('.state-message')).toContainText('No articles found')
  await expect(page.locator('.state-message__detail')).toContainText('Try a different search term')
})

test('project filter button filters cards', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.article-card')).toHaveCount(2)

  // Click 'opc' filter
  await page.locator('.filter-btn', { hasText: 'opc' }).click()

  await expect(page.locator('.article-card')).toHaveCount(1)
  await expect(page.locator('.article-card__title')).toContainText('OPC Design Review')
})

test('project filter All button resets to full list', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // Apply filter
  await page.locator('.filter-btn', { hasText: 'opc' }).click()
  await expect(page.locator('.article-card')).toHaveCount(1)

  // Reset to All
  await page.locator('.filter-btn', { hasText: 'All' }).click()
  await expect(page.locator('.article-card')).toHaveCount(2)
})

test('project filter empty state shows correct message', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // Select a project that exists but then search for something that doesn't match
  await page.locator('.filter-btn', { hasText: 'opc' }).click()
  await page.locator('.search-bar__input').fill('zzznomatch')

  await expect(page.locator('.article-card')).toHaveCount(0)
  await expect(page.locator('.state-message__detail')).toContainText('Try a different search term')
})
