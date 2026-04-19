/**
 * E2E: SharePage — 4 key states with axe-core a11y scan and screenshots.
 *
 * States covered:
 *   - Public (no password required)
 *   - Password prompt (401 on probe)
 *   - Not found (404)
 *   - Expired (410)
 *
 * Mock boundary: page.route intercepts /api/share/:id ONLY. No router mocks.
 * Runs against the real Vite dev server configured in playwright.config.ts.
 *
 * Screenshots are written to test-results/share-page/*.png so artifacts exist
 * regardless of whether the a11y assertion passes (surfaces pre-existing CSS
 * contrast issues without suppressing evidence).
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import fs from 'node:fs'

const SHOT_DIR = path.resolve(process.cwd(), 'test-results', 'share-page')

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
})

const PUBLIC_ARTICLE = {
  article: { title: 'Public Shared Article', body: '# Hello\n\nThis is a public share.' },
  slug: '2026-04-20-public-share',
}

async function fulfillJson(route: import('@playwright/test').Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function snap(page: import('@playwright/test').Page, name: string, testInfo: import('@playwright/test').TestInfo) {
  const fullPath = path.join(SHOT_DIR, name)
  const buf = await page.screenshot({ path: fullPath, fullPage: true })
  await testInfo.attach(name, { body: buf, contentType: 'image/png' })
}

async function runAxe(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const critical = results.violations.filter((v) => v.impact === 'critical')
  const serious = results.violations.filter((v) => v.impact === 'serious')
  await testInfo.attach('axe-violations.json', {
    body: Buffer.from(JSON.stringify({ critical, serious, allViolations: results.violations }, null, 2)),
    contentType: 'application/json',
  })
  expect(critical, `critical a11y violations: ${JSON.stringify(critical, null, 2)}`).toEqual([])
  expect(serious, `serious a11y violations: ${JSON.stringify(serious, null, 2)}`).toEqual([])
}

test.describe('SharePage E2E + a11y @a11y', () => {
  test('public share renders article + screenshot + axe', async ({ page }, testInfo) => {
    await page.route('**/api/share/**', (route) => fulfillJson(route, 200, PUBLIC_ARTICLE))

    await page.goto('/#/share/public-abc')
    await expect(page.locator('h1.share-page__title')).toHaveText('Public Shared Article', { timeout: 10000 })
    await snap(page, 'share-public.png', testInfo)

    // BUG-2 lock: no broken <img src="">
    const brokenImg = await page.locator('img[src=""]').count()
    expect(brokenImg).toBe(0)

    await runAxe(page, testInfo)
  })

  test('password prompt renders form + screenshot + axe', async ({ page }, testInfo) => {
    await page.route('**/api/share/**', (route) =>
      fulfillJson(route, 401, { error: 'PASSWORD_REQUIRED' }),
    )

    await page.goto('/#/share/locked-abc')
    await expect(page.locator('label[for="share-password"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#share-password')).toBeFocused()

    // Keyboard: typing then Enter — verify keyboard-only interaction works
    await page.keyboard.type('somepass')
    await expect(page.locator('#share-password')).toHaveValue('somepass')

    await snap(page, 'share-password-form.png', testInfo)
    await runAxe(page, testInfo)
  })

  test('404 not found state + screenshot + axe', async ({ page }, testInfo) => {
    await page.route('**/api/share/**', (route) => fulfillJson(route, 404, { error: 'Not found' }))

    await page.goto('/#/share/missing-abc')
    await expect(page.getByText(/share not found/i)).toBeVisible({ timeout: 10000 })
    await snap(page, 'share-notfound.png', testInfo)
    await runAxe(page, testInfo)
  })

  test('410 expired state + screenshot + axe', async ({ page }, testInfo) => {
    await page.route('**/api/share/**', (route) => fulfillJson(route, 410, { error: 'Expired' }))

    await page.goto('/#/share/expired-abc')
    await expect(page.getByText(/share link has expired/i)).toBeVisible({ timeout: 10000 })
    await snap(page, 'share-expired.png', testInfo)
    await runAxe(page, testInfo)
  })
})
