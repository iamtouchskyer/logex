/**
 * E2E: Timeline page — grouping, navigation, error state
 */
import { test, expect } from '@playwright/test'

const MOCK_USER = { user: { login: 'testuser', name: 'Test User', avatar: null } }

const MOCK_INDEX_TIMELINE = {
  articles: [
    {
      slug: '2026-04-15-article-one',
      title: 'Article One',
      summary: 'First article on April 15',
      date: '2026-04-15',
      tags: ['opc'],
      project: 'opc',
      heroImage: null,
      path: '2026/04/15/2026-04-15-article-one.json',
    },
    {
      slug: '2026-04-15-article-two',
      title: 'Article Two',
      summary: 'Second article on April 15',
      date: '2026-04-15',
      tags: [],
      project: 'session-brain',
      heroImage: null,
      path: '2026/04/15/2026-04-15-article-two.json',
    },
    {
      slug: '2026-04-14-article-three',
      title: 'Article Three',
      summary: 'Article on April 14',
      date: '2026-04-14',
      tags: [],
      project: 'logex',
      heroImage: null,
      path: '2026/04/14/2026-04-14-article-three.json',
    },
  ],
  lastUpdated: '2026-04-15',
}

const MOCK_ARTICLE_ONE = {
  slug: '2026-04-15-article-one',
  title: 'Article One',
  summary: 'First article',
  body: '# Article One\n\nContent.',
  date: '2026-04-15',
  tags: ['opc'],
  project: 'opc',
  sessionId: 'abc',
  duration: '1h 0min',
  stats: { entries: 5, messages: 10, chunks: 3 },
  heroImage: null,
}

const MOCK_ARTICLE_TWO = {
  slug: '2026-04-15-article-two',
  title: 'Article Two',
  summary: 'Second article',
  body: '# Article Two\n\nContent.',
  date: '2026-04-15',
  tags: [],
  project: 'session-brain',
  sessionId: 'abc',
  duration: '2h 0min',
  stats: { entries: 8, messages: 16, chunks: 4 },
  heroImage: null,
}

const MOCK_ARTICLE_THREE = {
  slug: '2026-04-14-article-three',
  title: 'Article Three',
  summary: 'Third article',
  body: '# Article Three\n\nContent.',
  date: '2026-04-14',
  tags: [],
  project: 'logex',
  sessionId: 'def',
  duration: '1h 30min',
  stats: { entries: 3, messages: 6, chunks: 2 },
  heroImage: null,
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INDEX_TIMELINE) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-article-one.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_ONE) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/15/2026-04-15-article-two.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_TWO) })
  )
  await page.route('https://raw.githubusercontent.com/iamtouchskyer/logex-data/main/2026/04/14/2026-04-14-article-three.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTICLE_THREE) })
  )
})

test('timeline page renders grouped entries', async ({ page }) => {
  await page.goto('/#/timeline')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.timeline')).toBeVisible({ timeout: 10000 })
  // 3 articles, 2 distinct dates → 2 groups
  await expect(page.locator('.timeline__group')).toHaveCount(2)
  // 3 total entries
  await expect(page.locator('.timeline__entry')).toHaveCount(3)
})

test('timeline groups articles by date correctly', async ({ page }) => {
  await page.goto('/#/timeline')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.timeline')).toBeVisible({ timeout: 10000 })

  // First group should have 2 entries (both Apr 15 articles)
  const firstGroup = page.locator('.timeline__group').first()
  await expect(firstGroup.locator('.timeline__entry')).toHaveCount(2)
})

test('timeline entry click opens article reader', async ({ page }) => {
  await page.goto('/#/timeline')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.timeline__entry').first()).toBeVisible({ timeout: 10000 })

  await page.locator('.timeline__entry').first().click()

  // Should navigate to reader
  await expect(page).toHaveURL(/#\/articles\//)
  await expect(page.locator('.reader__title')).toBeVisible({ timeout: 5000 })
})

test('nav active link changes on timeline route', async ({ page }) => {
  await page.goto('/#/timeline')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.timeline')).toBeVisible({ timeout: 10000 })

  // Timeline nav link should be active
  await expect(page.locator('a.nav__link--active')).toContainText('Timeline')
})
