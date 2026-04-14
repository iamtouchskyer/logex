import { test, expect } from '@playwright/test'

test('timeline page loads with entries', async ({ page }) => {
  await page.goto('/#/timeline')

  // Wait for timeline content to render
  await expect(page.locator('[class*="timeline"]').first()).toBeVisible()
})

test('timeline entries are grouped by date', async ({ page }) => {
  await page.goto('/#/timeline')

  // Date group headers should be present
  const dateHeaders = page.locator('time, [class*="date-group"], [class*="timeline-date"]')
  await expect(dateHeaders.first()).toBeVisible()

  const count = await dateHeaders.count()
  expect(count).toBeGreaterThanOrEqual(1)
})

test('click timeline entry navigates to detail', async ({ page }) => {
  await page.goto('/#/timeline')

  // Click first clickable entry in timeline
  const entry = page.locator('[class*="timeline"] [role="link"], [class*="timeline"] a, [class*="timeline"] .insight-card').first()
  await expect(entry).toBeVisible()
  await entry.click()

  // Should navigate to detail view
  await expect(page).toHaveURL(/#\/insights\//)
})
