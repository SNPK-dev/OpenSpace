import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const route of ['/onboarding', '/onboarding/create-profile', '/onboarding/pair-device']) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
  })
}

test('create-profile journey is keyboard operable with visible focus', async ({ page }) => {
  await page.goto('/onboarding/create-profile')
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus')
  await expect(focused).toBeVisible()
  const indicator = await focused.evaluate(element => {
    const style = getComputedStyle(element)
    return { outline: style.outlineStyle, shadow: style.boxShadow }
  })
  expect(indicator.outline !== 'none' || indicator.shadow !== 'none').toBe(true)
})

test('critical onboarding routes remain usable at 200% zoom', async ({ page }) => {
  await page.goto('/onboarding/create-profile')
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  await expect(page.locator('#profile-name')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true)
})

test('reduced-motion preference disables meaningful transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/onboarding')
  const duration = await page.locator('.onboarding-card').evaluate(element => getComputedStyle(element).transitionDuration)
  expect(duration === '0s' || duration === '0.001s').toBe(true)
})
