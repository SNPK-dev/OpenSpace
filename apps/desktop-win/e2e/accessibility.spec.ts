import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const route of ['/#/onboarding', '/#/onboarding/create-profile', '/#/onboarding/pair-device']) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
  })
}

test('desktop onboarding is keyboard operable at 200% zoom', async ({ page }) => {
  await page.goto('/#/onboarding/create-profile')
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
  await expect(page.locator('#profile-name')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true)
})
