import { expect, test, type Page } from '@playwright/test'
import { archivedRow, json, SAMPLE_STAFF, stubStaffApi, type StaffStub } from './staffApiStub'

// Staff "Archive" and "Restore": the question, the pending state, Undo, the Archived filter, every failure answer, 320px, dark mode,
// keyboard focus, tooltips, and the tabs that must not change. The API is stubbed (staffApiStub.ts); sign-in is the dev-only simulated one.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, who = ADMIN, path = '/admin/users?tab=staff', tab = 'Staff') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
  await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const visible = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true })
const archiveBtn = (page: Page, name = 'Lara Santos') => visible(page, `Archive ${name}`).first()
const restoreBtn = (page: Page, name = 'Miguel Cruz') => visible(page, `Restore ${name}`).first()
const resetBtn = (page: Page, name = 'Lara Santos') => visible(page, `Reset password for ${name}`)
const dialog = (page: Page, name = 'Lara Santos') => page.getByRole('dialog', { name: `Archive ${name}?` })
const confirm = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Archive Staff', exact: true })
const text = (page: Page, copy: string | RegExp) => page.getByText(copy).first()
const row = (page: Page, name: string) => page.getByText(name, { exact: true }).filter({ visible: true })

async function showStatus(page: Page, label: 'Active' | 'Archived' | 'All') {
  await page.getByRole('combobox', { name: 'Status' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

test.describe('staff archive: the Active list and the question', () => {
  let api: StaffStub
  test.beforeEach(async ({ page }) => {
    api = await stubStaffApi(page, [...SAMPLE_STAFF.slice(0, 2), archivedRow(SAMPLE_STAFF[2])])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  })

  test('opens on Active: asks the server for active staff, hides archived ones, and offers Reset and Archive as 44px targets', async ({ page }) => {
    expect(api.gets[0].searchParams.get('status')).toBe('active')
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Active')
    await expect(row(page, 'Nina Reyes')).toHaveCount(0)
    await expect(page.getByText('Active', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    for (const button of [resetBtn(page).first(), archiveBtn(page)]) {
      const box = await button.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('asks first with the consequences, names the person, and sends nothing on Cancel', async ({ page }) => {
    await archiveBtn(page).click()
    const ask = dialog(page)
    await expect(ask).toBeVisible()
    await expect(ask.getByText('Are you sure?')).toBeVisible()
    await expect(ask.getByText("Lara Santos will be signed out everywhere and won't be able to sign in. Their account is hidden from the staff list but kept, and you can restore it from the Archived filter.")).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toBeHidden()
    await expect(archiveBtn(page)).toBeFocused()
    expect(api.archives).toEqual([])
  })

  test('Escape closes the question and focus returns to the Archive button', async ({ page }) => {
    await archiveBtn(page, 'Miguel Cruz').click()
    await expect(dialog(page, 'Miguel Cruz')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page, 'Miguel Cruz')).toBeHidden()
    await expect(archiveBtn(page, 'Miguel Cruz')).toBeFocused()
    expect(api.archives).toEqual([])
  })

  test('Tab stays inside the dialog and Enter on Archive Staff confirms', async ({ page }) => {
    await archiveBtn(page).click()
    await expect(dialog(page)).toBeVisible()
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }
    await confirm(page).focus()
    await page.keyboard.press('Enter')
    await expect(text(page, 'Lara Santos archived.')).toBeVisible()
    expect(api.archives).toHaveLength(1)
  })

  test('has the shared tooltip on hover and focus, never a native title', async ({ page }) => {
    await expect(archiveBtn(page)).not.toHaveAttribute('title', /.+/)
    await archiveBtn(page).focus()
    const tip = page.getByRole('tooltip').filter({ hasText: 'Archive Lara Santos' })
    await expect(tip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tip).toHaveCount(0)
  })

  test('while pending the button waits, a double click sends one request, and only that row is disabled', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    api.onArchive = async () => {
      await gate
    }
    await archiveBtn(page).click()
    await confirm(page).dblclick()
    await expect(confirm(page)).toBeDisabled()
    await expect(confirm(page)).toHaveAttribute('aria-busy', 'true')
    await expect(archiveBtn(page)).toBeDisabled()
    await expect(archiveBtn(page, 'Miguel Cruz')).toBeEnabled()
    release()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(api.archives).toEqual([api.rows[0].id])
  })

  test('success: one POST, the row leaves the Active list, and the toast offers Undo', async ({ page }) => {
    await archiveBtn(page).click()
    await confirm(page).click()
    await expect(text(page, 'Lara Santos archived.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(row(page, 'Lara Santos')).toHaveCount(0)
    await expect(row(page, 'Miguel Cruz').first()).toBeVisible()
    expect(api.archives).toEqual([api.rows[0].id])
  })

  test('Undo restores the account and the row comes back', async ({ page }) => {
    await archiveBtn(page).click()
    await confirm(page).click()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(text(page, 'Archive undone. Lara Santos can sign in again.')).toBeVisible()
    await expect(row(page, 'Lara Santos').first()).toBeVisible()
    expect(api.restores).toEqual([api.rows[0].id])
  })
})

test.describe('staff archive: the Archived filter and Restore', () => {
  let api: StaffStub
  test.beforeEach(async ({ page }) => {
    api = await stubStaffApi(page, [SAMPLE_STAFF[0], archivedRow(SAMPLE_STAFF[1]), archivedRow(SAMPLE_STAFF[2])])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  })

  test('Archived lists archived staff with a badge and Restore only: no Reset, no Archive', async ({ page }) => {
    await showStatus(page, 'Archived')
    await expect(restoreBtn(page)).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.get('status')).toBe('archived')
    await expect(page.getByText('Archived', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(row(page, 'Lara Santos')).toHaveCount(0)
    await expect(resetBtn(page, 'Miguel Cruz')).toHaveCount(0)
    await expect(visible(page, /^Archive /)).toHaveCount(0)
    const box = await restoreBtn(page).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test('All lists both, each with its own actions', async ({ page }) => {
    await showStatus(page, 'All')
    await expect(restoreBtn(page)).toBeVisible()
    await expect(archiveBtn(page)).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.get('status')).toBe('all')
  })

  test('Restore needs no question: one POST, a toast, and the row leaves Archived', async ({ page }) => {
    await showStatus(page, 'Archived')
    await restoreBtn(page).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(text(page, 'Miguel Cruz restored. They can sign in with their current password.')).toBeVisible()
    await expect(row(page, 'Miguel Cruz')).toHaveCount(0)
    expect(api.restores).toEqual([api.rows[1].id])
    await showStatus(page, 'Active')
    await expect(row(page, 'Miguel Cruz').first()).toBeVisible()
  })

  test('Restore waits while pending and sends one request', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    api.onRestore = async () => {
      await gate
    }
    await showStatus(page, 'Archived')
    await restoreBtn(page).dblclick()
    await expect(restoreBtn(page)).toBeDisabled()
    await expect(restoreBtn(page, 'Nina Reyes')).toBeEnabled()
    release()
    await expect(text(page, /Miguel Cruz restored\./)).toBeVisible()
    expect(api.restores).toHaveLength(1)
  })

  test('with no archived staff, says so and offers a way back', async ({ page }) => {
    api.rows.forEach((r) => Object.assign(r, { status: 'active', archivedAt: null }))
    await showStatus(page, 'Archived')
    await expect(page.getByText('No archived staff accounts', { exact: true })).toBeVisible()
    await expect(page.getByText('Archived accounts show up here and can be restored.')).toBeVisible()
    await page.getByRole('button', { name: 'Show active staff' }).click()
    await expect(row(page, 'Lara Santos').first()).toBeVisible()
  })
})

test.describe('staff archive: with no staff at all', () => {
  test('Active still shows the first-account empty state with Add', async ({ page }) => {
    await stubStaffApi(page, [])
    await open(page)
    await expect(page.getByText('No staff accounts yet')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Add staff account' }).filter({ visible: true }).first()).toBeVisible()
  })
})

test.describe('staff archive: failures', () => {
  let api: StaffStub
  test.beforeEach(async ({ page }) => {
    api = await stubStaffApi(page, [SAMPLE_STAFF[0], archivedRow(SAMPLE_STAFF[1])])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  })

  for (const [label, status, body, copy, retry, reloads] of [
    ['401', 401, { message: 'Unauthorized' }, /Your session expired\. Sign in again, then retry\./, false, false],
    ['403', 403, { code: 'forbidden' }, /isn't allowed to archive staff/, false, false],
    ['403 not a staff account', 403, { code: 'not_a_staff_account' }, /Lara Santos is not a staff account, so it can't be archived here\. The list has been refreshed\./, false, true],
    ['404', 404, { code: 'staff_not_found' }, /no longer exists.*refreshed/, false, true],
    ['409 already archived', 409, { code: 'already_archived' }, /Lara Santos is already archived\. The list was out of date/, false, true],
    ['429', 429, {}, /Wait a few minutes/, false, false],
    ['502 archive_incomplete', 502, { code: 'archive_incomplete' }, /blocked from signing in, but the archive did not finish\. Retry now to finish; it is safe to repeat\./, true, false],
    ['502 archive_not_applied', 502, { code: 'archive_not_applied' }, /Nothing changed\./, true, false],
    ['503', 503, {}, /Nothing changed\./, true, false],
    ['500', 500, {}, /We couldn't confirm the result\. Retry is safe, or check the list after a minute\./, true, false],
  ] as const) {
    test(`archive: explains a ${label} answer${retry ? ' and offers Retry' : ''}`, async ({ page }) => {
      api.onArchive = (route) => json(route, status, body).then(() => true)
      const before = api.gets.length
      await archiveBtn(page).click()
      await confirm(page).click()
      await expect(text(page, copy)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(retry ? 1 : 0)
      await expect(page.getByRole('dialog')).toBeHidden()
      if (reloads) await expect.poll(() => api.gets.length).toBeGreaterThan(before)
      else expect(api.gets.length).toBe(before)
    })
  }

  test('archive: a dropped connection says the result is unknown and Retry is safe', async ({ page }) => {
    api.onArchive = async (route) => {
      await route.abort('failed')
      return true
    }
    await archiveBtn(page).click()
    await confirm(page).click()
    await expect(text(page, /We couldn't confirm the result\. Retry is safe/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  })

  test('archive: Retry runs it again without asking and the second attempt succeeds', async ({ page }) => {
    let first = true
    api.onArchive = (route) => {
      if (!first) return false
      first = false
      return json(route, 502, { code: 'archive_incomplete' }).then(() => true)
    }
    await archiveBtn(page).click()
    await confirm(page).click()
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(text(page, 'Lara Santos archived.')).toBeVisible()
    expect(api.archives).toHaveLength(2)
  })

  for (const [label, status, body, copy, retry] of [
    ['409 not archived', 409, { code: 'not_archived' }, /Miguel Cruz is already active\. The list was out of date/, false],
    ['502 restore_incomplete', 502, { code: 'restore_incomplete' }, /restore for Miguel Cruz was only partly applied.*safe to repeat/, true],
    ['503', 503, {}, /Couldn't restore Miguel Cruz\. Nothing changed\./, true],
    ['429', 429, {}, /Couldn't restore Miguel Cruz\..*Wait a few minutes/, false],
  ] as const) {
    test(`restore: explains a ${label} answer${retry ? ' and offers Retry' : ''}`, async ({ page }) => {
      api.onRestore = (route) => json(route, status, body).then(() => true)
      await showStatus(page, 'Archived')
      await restoreBtn(page).click()
      await expect(text(page, copy)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(retry ? 1 : 0)
      await expect(restoreBtn(page)).toBeEnabled()
    })
  }

  test('a list that fails to load keeps its own Retry', async ({ page }) => {
    api.onGet = (route) => json(route, 500, {}).then(() => true)
    await showStatus(page, 'Archived')
    await expect(page.getByRole('button', { name: 'Retry', exact: true }).first()).toBeVisible()
  })
})

test.describe('staff archive: layout and themes', () => {
  test('at 320px both actions are 44px targets inside the screen, the dialog fits and nothing scrolls sideways', async ({ page }) => {
    await stubStaffApi(page, [SAMPLE_STAFF[0], archivedRow(SAMPLE_STAFF[1])])
    await page.setViewportSize({ width: 320, height: 640 })
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
    for (const button of [resetBtn(page).first(), archiveBtn(page)]) {
      const box = await button.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    }
    await expect.poll(() => overflow(page)).toBeLessThanOrEqual(0)

    await archiveBtn(page).click()
    const ask = dialog(page)
    await expect(ask).toBeVisible()
    const panel = await ask.boundingBox()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(320)
    for (const name of ['Cancel', 'Archive Staff']) {
      await expect.poll(async () => (await ask.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await confirm(page).click()
    await expect(text(page, 'Lara Santos archived.')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)

    await showStatus(page, 'Archived')
    await expect(restoreBtn(page)).toBeVisible()
    await expect(page.getByText('Archived', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('dark mode: the dialog, the badge and the toast render and nothing overflows', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await stubStaffApi(page, [SAMPLE_STAFF[0], archivedRow(SAMPLE_STAFF[1])])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
    await archiveBtn(page).click()
    await expect(dialog(page).getByText('Are you sure?')).toBeVisible()
    await confirm(page).click()
    await expect(text(page, 'Lara Santos archived.')).toBeVisible()
    await showStatus(page, 'Archived')
    await expect(restoreBtn(page, 'Lara Santos')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('a superadmin can archive staff on /superadmin/users', async ({ page }) => {
    const api = await stubStaffApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=staff')
    await archiveBtn(page, 'Nina Reyes').click()
    await confirm(page).click()
    await expect(text(page, 'Nina Reyes archived.')).toBeVisible()
    expect(api.archives).toEqual([api.rows[2].id])
  })
})

test.describe('staff archive: other tabs are unchanged', () => {
  test('Customers and Superadmins have no archive or restore action', async ({ page }) => {
    await stubStaffApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=superadmins', 'Superadmins')
    await expect(page.getByRole('tabpanel').getByRole('row').nth(1).or(page.getByRole('tabpanel').getByRole('listitem').first())).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Archive|Restore/ })).toHaveCount(0)
    await page.goto('/superadmin/users?tab=customers')
    await expect(page.getByRole('tabpanel').getByRole('button').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Archive|Restore/ })).toHaveCount(0)
  })

  test('Admins keeps its own Archive flow and never calls the staff archive API', async ({ page }) => {
    const api = await stubStaffApi(page)
    await open(page, SUPERADMIN, '/superadmin/users?tab=admins', 'Admins')
    const archive = page.getByRole('button', { name: /^Archive / }).filter({ visible: true }).first()
    await expect(archive).toBeVisible({ timeout: 20_000 })
    await archive.click()
    await expect(page.getByRole('dialog', { name: /^Archive .+\?$/ }).getByRole('button', { name: 'Archive account', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive Staff', exact: true })).toHaveCount(0)
    expect(api.archives).toEqual([])
  })
})
