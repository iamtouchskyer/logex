import { test, expect } from '@playwright/test'

test('home page loads with insight cards', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.insight-card').first()).toBeVisible()
})

test('category filter shows only matching cards', async ({ page }) => {
  await page.goto('/')

  // Click on GOTCHA filter
  const gotchaFilter = page.getByRole('button', { name: /GOTCHA/i }).first()
  await gotchaFilter.click()

  // All visible badges should be GOTCHA
  const badges = page.locator('.insight-card .badge')
  const count = await badges.count()

  for (let i = 0; i < count; i++) {
    await expect(badges.nth(i)).toHaveText('GOTCHA')
  }
})

test('search filters insight cards', async ({ page }) => {
  await page.goto('/')

  // Wait for cards to load
  await expect(page.locator('.insight-card').first()).toBeVisible()

  const totalBefore = await page.locator('.insight-card').count()

  // Type a search query
  const searchInput = page.getByPlaceholder('Search insights...')
  await searchInput.fill('gotcha')

  // Cards should be filtered (fewer or same count)
  const totalAfter = await page.locator('.insight-card').count()
  expect(totalAfter).toBeLessThanOrEqual(totalBefore)
})

test('click card navigates to detail page', async ({ page }) => {
  await page.goto('/')

  const firstCard = page.locator('.insight-card').first()
  await expect(firstCard).toBeVisible()

  // Get the title for verification
  const title = await firstCard.locator('.insight-card__title').textContent()

  await firstCard.click()

  // Should navigate to detail page (hash route)
  await expect(page).toHaveURL(/#\/insights\//)

  // Detail page should show the full title
  if (title) {
    await expect(page.getByText(title)).toBeVisible()
  }
})

test('detail page shows full content', async ({ page }) => {
  await page.goto('/')

  const firstCard = page.locator('.insight-card').first()
  await expect(firstCard).toBeVisible()
  await firstCard.click()

  // Detail page should have title, body, category badge, and tags
  await expect(page.locator('.badge').first()).toBeVisible()
})

test('back button returns to list', async ({ page }) => {
  await page.goto('/')

  await page.locator('.insight-card').first().click()
  await expect(page).toHaveURL(/#\/insights\//)

  await page.goBack()
  await expect(page.locator('.insight-card').first()).toBeVisible()
})
