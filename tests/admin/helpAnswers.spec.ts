import { expect, test, type Page } from '@playwright/test'

// The Help Chatbot admin page and what customers get from it. Sign-in is the dev-only simulated one, and the answers and permissions live in
// this browser's localStorage, so one browser context plays every role in turn. Runs in the desktop and mobile projects.

const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

async function signIn(page: Page, { email, password }: { email: string; password: string }, home: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(home)
}

/** Ends the dev session the way a closed tab would, without the UI: the next page load is a visitor. */
const signOut = (page: Page) => page.evaluate(() => localStorage.removeItem('silhoufit-session'))

test('an admin adds and publishes a question, and a visitor gets the new answer from the Help chat', async ({ page }) => {
  await signIn(page, ADMIN, /\/admin$/)
  await page.goto('/admin/chatbot')
  await expect(page.getByRole('heading', { level: 1, name: 'Help Chatbot' })).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Add question' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Add question' })
  await sheet.getByRole('textbox', { name: 'Question', exact: true }).fill('Do you gift wrap orders?')
  await sheet.getByRole('textbox', { name: 'Answer', exact: true }).fill('Gift wrapping is not offered yet, but every order arrives neatly packed.')
  await sheet.getByRole('textbox', { name: /^Keywords/ }).fill('gift, wrap')
  await sheet.locator('label', { hasText: 'Published' }).click()
  await sheet.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.getByText('Question "Do you gift wrap orders?" added')).toBeVisible()

  // Last in the list, so page 2 of 10: search for it.
  await page.getByRole('textbox', { name: 'Search questions' }).fill('gift wrap')
  await expect(page.getByText('Displaying 1–1 of 1')).toBeVisible()
  await expect(page.getByText('Published', { exact: true }).filter({ visible: true }).first()).toBeVisible()

  await signOut(page)
  await page.goto('/shop')
  await page.getByRole('button', { name: 'Ask KRAL Help' }).click()
  const help = page.getByRole('region', { name: 'Chat with KRAL Help' })
  await help.getByRole('textbox', { name: 'Message' }).fill('gift wrapping')
  await help.getByRole('textbox', { name: 'Message' }).press('Enter')
  await expect(help.getByText(/every order arrives neatly packed/)).toBeVisible()
})

test('a draft is not shown to visitors', async ({ page }) => {
  await signIn(page, ADMIN, /\/admin$/)
  await page.goto('/admin/chatbot')
  await expect(page.getByRole('heading', { level: 1, name: 'Help Chatbot' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Add question' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Add question' })
  await sheet.getByRole('textbox', { name: 'Question', exact: true }).fill('Do you sell gift cards?')
  await sheet.getByRole('textbox', { name: 'Answer', exact: true }).fill('Gift cards are being planned and are not on sale yet.')
  await sheet.getByRole('textbox', { name: /^Keywords/ }).fill('voucher')
  await sheet.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.getByText('Question "Do you sell gift cards?" added as a draft')).toBeVisible()

  await signOut(page)
  await page.goto('/shop')
  await page.getByRole('button', { name: 'Ask KRAL Help' }).click()
  const help = page.getByRole('region', { name: 'Chat with KRAL Help' })
  await help.getByRole('textbox', { name: 'Message' }).fill('voucher')
  await help.getByRole('textbox', { name: 'Message' }).press('Enter')
  await expect(help.getByText("I don't have an answer for that yet.")).toBeVisible()
})

test('staff cannot open Help Chatbot until a superadmin turns it on for them', async ({ page }) => {
  await signIn(page, STAFF, /\/staff$/)
  await page.goto('/admin/chatbot')
  await expect(page).toHaveURL(/\/staff$/)
  await expect(page.getByText('That page is turned off for your role.')).toBeVisible()

  await signOut(page)
  await signIn(page, SUPERADMIN, /\/superadmin$/)
  await page.goto('/superadmin/permissions')
  const staffCard = page.getByRole('region', { name: 'Staff', exact: true })
  await expect(staffCard.getByText('Help Chatbot')).toBeVisible({ timeout: 20_000 })
  await staffCard.getByLabel('Help Chatbot').check()
  await staffCard.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Staff permissions saved')).toBeVisible()

  await signOut(page)
  await signIn(page, STAFF, /\/staff$/)
  await page.goto('/admin/chatbot')
  await expect(page.getByRole('heading', { level: 1, name: 'Help Chatbot' })).toBeVisible({ timeout: 20_000 })
})

test('stays inside a 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await signIn(page, ADMIN, /\/admin$/)
  await page.goto('/admin/chatbot')
  await expect(page.getByRole('heading', { level: 1, name: 'Help Chatbot' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Sample data', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
