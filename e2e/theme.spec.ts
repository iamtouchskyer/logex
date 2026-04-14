import { test, expect } from '@playwright/test'

test('default theme is dark or matches system preference', async ({ page }) => {
  await page.goto('/')

  const theme = await page.locator('html').getAttribute('data-theme')
  expect(['dark', 'light']).toContain(theme)
})

test('toggle switches theme', async ({ page }) => {
  await page.goto('/')

  const html = page.locator('html')
  const initialTheme = await html.getAttribute('data-theme')

  // Find and click theme toggle
  const toggle = page.getByRole('button', { name: /theme/i }).or(page.locator('[class*="theme-toggle"]'))
  await toggle.click()

  const newTheme = await html.getAttribute('data-theme')
  expect(newTheme).not.toBe(initialTheme)

  // Should be the opposite
  if (initialTheme === 'dark') {
    expect(newTheme).toBe('light')
  } else {
    expect(newTheme).toBe('dark')
  }
})

test('theme persists on reload', async ({ page }) => {
  await page.goto('/')

  // Get initial theme
  const initialTheme = await page.locator('html').getAttribute('data-theme')

  // Toggle to the other theme
  const toggle = page.getByRole('button', { name: /theme/i }).or(page.locator('[class*="theme-toggle"]'))
  await toggle.click()

  const toggledTheme = await page.locator('html').getAttribute('data-theme')
  expect(toggledTheme).not.toBe(initialTheme)

  // Reload and verify persistence
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const persistedTheme = await page.locator('html').getAttribute('data-theme')
  expect(persistedTheme).toBe(toggledTheme)
})
