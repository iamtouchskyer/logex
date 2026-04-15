/**
 * E2E: Article reader — stats, tags, heroImage with fallback
 */
import { test, expect } from '@playwright/test'

const MOCK_USER = { user: { login: 'testuser', name: 'Test User', avatar: null } }

const MOCK_INDEX_RICH = {
  articles: [
    {
      slug: '2026-04-15-rich-stats-article',
      title: 'Rich Stats Article',
      summary: 'Article with full stats',
      date: '2026-04-15',
      tags: ['opc', 'testing', 'playwright'],
      project: 'opc',
      heroImage: null,
      path: '2026/04/15/2026-04-15-rich-stats-article.json',
    },
    {
      slug: '2026-04-14-broken-image-article',
      title: 'Broken Image Article',
      summary: 'Article with broken heroImage',
      date: '2026-04-14',
      tags: ['testing'],
      project: 'logex',
      heroImage: 'https://invalid-host-that-does-not-exist.example/missing.png',
      path: '2026/04/14/2026-04-14-broken-image-article.json',
    },
  ],
  lastUpdated: '2026-04-15',
}

const MOCK_ARTICLE_RICH = {
  slug: '2026-04-15-rich-stats-article',
  title: 'Rich Stats Article',
  summary: 'Article with full stats',
  body: '## Introduction\n\nThis session generated many tokens.',
  date: '2026-04-15',
  tags: ['opc', 'testing', 'playwright'],
  project: 'opc',
  sessionId: 'session-rich-stats',
  duration: '4h 27min',
  stats: {
    entries: 120,
    messages: 80,
    chunks: 40,
    tokens: { total: 54000, input: 30000, output: 24000 },
    llmCalls: 42,
    toolCalls: { total: 150 },
    costEstimate: { total_cost: 1.23 },
  },
  heroImage: null,
}

const MOCK_ARTICLE_BROKEN_IMG = {
  slug: '2026-04-14-broken-image-article',
  title: 'Broken Image Article',
  summary: 'Article with broken heroImage',
  body: '## Body\n\nThis article has a broken hero image.',
  date: '2026-04-14',
  tags: ['testing'],
  project: 'logex',
  sessionId: 'session-broken-img',
  duration: '1h 0min',
  stats: { entries: 10, messages: 20, chunks: 5 },
  heroImage: 'https://invalid-host-that-does-not-exist.example/missing.png',
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX_RICH) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-rich-stats-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_RICH) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/14/2026-04-14-broken-image-article.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_BROKEN_IMG) })
  )
  // Block the broken image URL so onError fires
  await page.route('https://invalid-host-that-does-not-exist.example/**', (route) =>
    route.abort()
  )
})

test('reader shows token stats when available', async ({ page }) => {
  await page.goto('/#/articles/2026-04-15-rich-stats-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 10000 })

  // Stats section should show tokens
  const statsSection = page.locator('.reader__stats')
  await expect(statsSection).toBeVisible()
  await expect(statsSection).toContainText('tokens')
})

test('reader shows cost pill when costEstimate available', async ({ page }) => {
  await page.goto('/#/articles/2026-04-15-rich-stats-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 10000 })

  // Cost pill should be present
  await expect(page.locator('.reader__stat-pill--cost')).toBeVisible()
  await expect(page.locator('.reader__stat-pill--cost')).toContainText('$')
})

test('reader shows article tags', async ({ page }) => {
  await page.goto('/#/articles/2026-04-15-rich-stats-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 10000 })

  const tags = page.locator('.reader__tags')
  await expect(tags).toBeVisible()
  await expect(tags).toContainText('opc')
  await expect(tags).toContainText('testing')
})

test('reader renders markdown body', async ({ page }) => {
  await page.goto('/#/articles/2026-04-15-rich-stats-article')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 10000 })

  // Markdown should be rendered as HTML (h2 from ## Introduction)
  await expect(page.locator('.reader__body h2')).toBeVisible()
})

test('article card shows gradient fallback when heroImage fails to load', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // Find the card with broken image (second card)
  const brokenCard = page.locator('.article-card').nth(1)

  // route.abort() fires synchronously before React renders — gradient should appear immediately
  // Use explicit waitFor to handle any React state update latency
  await expect(brokenCard.locator('.article-card__hero-gradient')).toBeVisible({ timeout: 8000 })
  await expect(brokenCard.locator('.article-card__hero-img')).not.toBeVisible()
})

test('card without heroImage never shows img element', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // First card has no heroImage — should show gradient, no img element
  const firstCard = page.locator('.article-card').first()
  await expect(firstCard.locator('.article-card__hero-gradient')).toBeVisible()
  await expect(firstCard.locator('.article-card__hero-img')).not.toBeVisible()
})

test('article card shows token stats pill when tokens available', async ({ page }) => {
  // Navigate to rich article — first card in mock index
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // First card has tokens: { total: 54000 } → should show "54K tokens"
  const firstCard = page.locator('.article-card').first()
  const statPill = firstCard.locator('.article-card__stat-pill').first()
  await expect(statPill).toBeVisible()
  await expect(statPill).toContainText('tokens')
})

test('article card shows cost pill with formatted price', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.article-card').first()).toBeVisible({ timeout: 10000 })

  // First card has costEstimate: { total_cost: 1.23 } → "$1.23"
  const firstCard = page.locator('.article-card').first()
  await expect(firstCard.locator('.article-card__stat-pill--cost')).toBeVisible()
  await expect(firstCard.locator('.article-card__stat-pill--cost')).toContainText('$1.23')
})
