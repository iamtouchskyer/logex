import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('home page has no a11y violations @a11y', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    ),
  ).toHaveLength(0)
})

test('detail page has no a11y violations @a11y', async ({ page }) => {
  await page.goto('/')

  // Navigate to first card detail
  const firstCard = page.locator('.insight-card').first()
  await expect(firstCard).toBeVisible()
  await firstCard.click()

  await page.waitForLoadState('networkidle')

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    ),
  ).toHaveLength(0)
})

test('timeline page has no a11y violations @a11y', async ({ page }) => {
  await page.goto('/#/timeline')
  await page.waitForLoadState('networkidle')

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    ),
  ).toHaveLength(0)
})
