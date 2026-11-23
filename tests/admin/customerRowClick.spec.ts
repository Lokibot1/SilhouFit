import { expect, test, type Page } from '@playwright/test'
import { stubUsersApi } from './usersApiStub'

// SHF-USR-1: on the Customers tab, clicking anywhere on a customer's row (table row or mobile card) opens the details sheet,
// not only the eye button. Sign-in is the dev-only simulated one.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function openCustomers(page: Page) {
  await stubUsersApi(page)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/users?tab=customers')
}

test.describe('customer row click', () => {
  test('clicking the name opens the customer details', async ({ page }) => {
    await openCustomers(page)
    const row = page.locator('tbody tr, ul[aria-label^="Customers"] > li').filter({ visible: true }).first()
    const name = (await row.getByRole('button', { name: /^View details of / }).getAttribute('aria-label'))!.replace('View details of ', '')
    await row.getByText(name, { exact: true }).click()
    await expect(page.getByRole('dialog', { name: new RegExp(name) })).toBeVisible()
  })

  test('the deactivate button does not also open the details', async ({ page }) => {
    await openCustomers(page)
    const row = page.locator('tbody tr, ul[aria-label^="Customers"] > li').filter({ visible: true }).first()
    const deactivate = row.getByRole('button', { name: /^Deactivate / })
    const label = (await deactivate.getAttribute('aria-label'))!.replace('Deactivate ', '')
    await deactivate.click()
    await expect(page.getByRole('dialog', { name: new RegExp(`^${label}`) })).toHaveCount(0)
  })
})
