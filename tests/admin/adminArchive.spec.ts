import { expect, test, type Page } from '@playwright/test'
import { archivedAdmin, SAMPLE_ADMINS, stubAdminApi, type AdminStub } from './adminApiStub'
import { json, stubStaffApi } from './staffApiStub'

// Admin "Archive" and "Restore" on the Admins tab: superadmin only. The question, the pending state, Undo, the Status filter, every failure
// answer and 320px. The API is stubbed (adminApiStub.ts); sign-in is the dev-only simulated one. Runs in the desktop (table) and mobile (cards) projects.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function open(page: Page, who = SUPERADMIN, path = '/superadmin/users?tab=admins') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(who.email)
  await page.getByLabel('Password', { exact: true }).fill(who.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/(admin|superadmin)$/)
  await page.goto(path)
  await expect(page.getByRole('tab', { name: 'Admins', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
}

// The superadmin's summary cards already make the whole page wider than 320px on every tab, so the check is on the tab's own panel.
const panelOverflow = (page: Page) => page.getByRole('tabpanel').evaluate((el) => el.scrollWidth - el.clientWidth)
const visible = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true })
const archiveBtn = (page: Page, name = 'Brian Dijamco') => visible(page, `Archive ${name}`).first()
const restoreBtn = (page: Page, name = 'Alyssa Ferrer') => visible(page, `Restore ${name}`).first()
const resetBtn = (page: Page, name = 'Brian Dijamco') => visible(page, `Reset password for ${name}`)
const dialog = (page: Page, name = 'Brian Dijamco') => page.getByRole('dialog', { name: `Archive ${name}?` })
const confirm = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Archive Admin', exact: true })
const text = (page: Page, copy: string | RegExp) => page.getByText(copy).first()
const row = (page: Page, name: string) => page.getByRole('tabpanel').getByText(name, { exact: true }).filter({ visible: true })

async function showStatus(page: Page, label: 'Active' | 'Archived' | 'All') {
  await page.getByRole('combobox', { name: 'Status' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

const [BRIAN, ALYSSA, CARLO] = SAMPLE_ADMINS

test.describe('who sees admin archive', () => {
  test('an admin sees no row actions, even on archived rows, but still has the Status filter', async ({ page }) => {
    await stubAdminApi(page, [BRIAN, archivedAdmin(ALYSSA)])
    await open(page, ADMIN, '/admin/users?tab=admins')
    await expect(row(page, 'Brian Dijamco').first()).toBeVisible({ timeout: 20_000 })
    await showStatus(page, 'All')
    await expect(row(page, 'Alyssa Ferrer').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Reset password|Archive|Restore/ })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0)
  })

  test('a superadmin gets Archive and never calls the staff archive API', async ({ page }) => {
    const staff = await stubStaffApi(page)
    const api = await stubAdminApi(page)
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
    await archiveBtn(page).click()
    await confirm(page).click()
    await expect(text(page, 'Brian Dijamco archived.')).toBeVisible()
    expect(api.archives).toEqual([BRIAN.id])
    expect(staff.archives).toEqual([])
  })
})

test.describe('admin archive: the Active list and the question', () => {
  let api: AdminStub
  test.beforeEach(async ({ page }) => {
    api = await stubAdminApi(page, [BRIAN, ALYSSA, archivedAdmin(CARLO)])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  })

  test('opens on Active: asks the server for active admins, hides archived ones, and offers Reset and Archive as 44px targets', async ({ page }) => {
    expect(api.gets[0].searchParams.get('status')).toBe('active')
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Active')
    await expect(row(page, 'Carlo Mendoza')).toHaveCount(0)
    for (const button of [resetBtn(page).first(), archiveBtn(page)]) {
      const box = await button.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await expect.poll(() => panelOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('asks first with the consequences, names the admin, and sends nothing on Cancel', async ({ page }) => {
    await archiveBtn(page).click()
    const ask = dialog(page)
    await expect(ask).toBeVisible()
    await expect(ask.getByText('Are you sure?')).toBeVisible()
    await expect(ask.getByText("Brian Dijamco will be signed out everywhere and can't sign in until restored. Their account is hidden from the admin list but kept, and you can restore it from the Archived filter.")).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toBeHidden()
    await expect(archiveBtn(page)).toBeFocused()
    expect(api.archives).toEqual([])
  })

  test('has the shared tooltip on hover and focus, never a native title', async ({ page }) => {
    await expect(archiveBtn(page)).not.toHaveAttribute('title', /.+/)
    await archiveBtn(page).focus()
    const tip = page.getByRole('tooltip').filter({ hasText: 'Archive Brian Dijamco' })
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
    await expect(archiveBtn(page, 'Alyssa Ferrer')).toBeEnabled()
    release()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(api.archives).toEqual([BRIAN.id])
  })

  test('success: one POST, the row leaves the Active list, and the toast offers Undo', async ({ page }) => {
    await archiveBtn(page).click()
    await confirm(page).click()
    await expect(text(page, 'Brian Dijamco archived.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(row(page, 'Brian Dijamco')).toHaveCount(0)
    await expect(row(page, 'Alyssa Ferrer').first()).toBeVisible()
    expect(api.archives).toEqual([BRIAN.id])
  })

  test('Undo restores the admin and the row comes back', async ({ page }) => {
    await archiveBtn(page).click()
    await confirm(page).click()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(text(page, 'Archive undone. Brian Dijamco can sign in again.')).toBeVisible()
    await expect(row(page, 'Brian Dijamco').first()).toBeVisible()
    expect(api.restores).toEqual([BRIAN.id])
  })
})

test.describe('admin archive: the Status filter and Restore', () => {
  let api: AdminStub
  test.beforeEach(async ({ page }) => {
    api = await stubAdminApi(page, [BRIAN, archivedAdmin(ALYSSA), archivedAdmin(CARLO)])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  })

  test('Archived lists archived admins with a badge and Restore only: no Reset, no Archive', async ({ page }) => {
    await showStatus(page, 'Archived')
    await expect(restoreBtn(page)).toBeVisible()
    expect(api.gets.at(-1)!.searchParams.get('status')).toBe('archived')
    await expect(page.getByText('Archived', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await expect(row(page, 'Brian Dijamco')).toHaveCount(0)
    await expect(resetBtn(page, 'Alyssa Ferrer')).toHaveCount(0)
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
    await expect(text(page, 'Alyssa Ferrer restored. They can sign in with their current password.')).toBeVisible()
    await expect(row(page, 'Alyssa Ferrer')).toHaveCount(0)
    expect(api.restores).toEqual([ALYSSA.id])
    await showStatus(page, 'Active')
    await expect(row(page, 'Alyssa Ferrer').first()).toBeVisible()
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
    await expect(restoreBtn(page, 'Carlo Mendoza')).toBeEnabled()
    release()
    await expect(text(page, /Alyssa Ferrer restored\./)).toBeVisible()
    expect(api.restores).toHaveLength(1)
  })

  test('with no archived admins, says so and offers a way back', async ({ page }) => {
    api.rows.forEach((r) => Object.assign(r, { status: 'active', archivedAt: null }))
    await showStatus(page, 'Archived')
    await expect(page.getByText('No archived admin accounts', { exact: true })).toBeVisible()
    await expect(page.getByText('Archived accounts show up here and can be restored.')).toBeVisible()
    await page.getByRole('button', { name: 'Show active admins' }).click()
    await expect(row(page, 'Brian Dijamco').first()).toBeVisible()
  })
})

test.describe('admin archive: failures', () => {
  let api: AdminStub
  test.beforeEach(async ({ page }) => {
    api = await stubAdminApi(page, [BRIAN, archivedAdmin(ALYSSA)])
    await open(page)
    await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  })

  for (const [label, status, body, copy, retry, reloads] of [
    ['401', 401, { message: 'Unauthorized' }, /Your session expired\. Sign in again, then retry\./, false, false],
    ['403 forbidden', 403, { code: 'forbidden' }, /Only a superadmin can archive admins, so nothing changed\. Sign in with a superadmin account\./, false, false],
    ['403 not an admin account', 403, { code: 'not_an_admin_account' }, /Brian Dijamco is not an admin account, so it can't be archived here\. The list has been refreshed\./, false, true],
    ['404', 404, { code: 'admin_not_found' }, /This admin account no longer exists.*refreshed/, false, true],
    ['409 already archived', 409, { code: 'already_archived' }, /Brian Dijamco is already archived\. The list was out of date/, false, true],
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
    api.onArchive = (route) => route.abort('failed').then(() => true)
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
    await expect(text(page, 'Brian Dijamco archived.')).toBeVisible()
    expect(api.archives).toHaveLength(2)
  })

  for (const [label, status, body, copy, retry] of [
    ['409 not archived', 409, { code: 'not_archived' }, /Alyssa Ferrer is already active\. The list was out of date/, false],
    ['502 restore_incomplete', 502, { code: 'restore_incomplete' }, /restore for Alyssa Ferrer was only partly applied.*safe to repeat/, true],
    ['503', 503, {}, /Couldn't restore Alyssa Ferrer\. Nothing changed\./, true],
    ['429', 429, {}, /Couldn't restore Alyssa Ferrer\..*Wait a few minutes/, false],
    ['403 forbidden', 403, { code: 'forbidden' }, /Only a superadmin can restore admins/, false],
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

  test('restore: a dropped connection says the result is unknown', async ({ page }) => {
    api.onRestore = (route) => route.abort('failed').then(() => true)
    await showStatus(page, 'Archived')
    await restoreBtn(page).click()
    await expect(text(page, /We couldn't confirm the result\. Retry is safe/)).toBeVisible()
  })

  test('a list that fails to load keeps its own Retry', async ({ page }) => {
    api.onGet = (route) => json(route, 500, {}).then(() => true)
    await showStatus(page, 'Archived')
    await expect(page.getByRole('button', { name: 'Retry', exact: true }).first()).toBeVisible()
  })
})

test('at 320px the actions are 44px targets, the dialog fits and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await stubAdminApi(page, [BRIAN, archivedAdmin(ALYSSA)])
  await open(page)
  await expect(archiveBtn(page)).toBeVisible({ timeout: 20_000 })
  for (const button of [resetBtn(page).first(), archiveBtn(page)]) {
    const box = await button.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  }
  await expect.poll(() => panelOverflow(page)).toBeLessThanOrEqual(0)

  await archiveBtn(page).click()
  const ask = dialog(page)
  await expect(ask).toBeVisible()
  const panel = await ask.boundingBox()
  expect(panel!.x).toBeGreaterThanOrEqual(0)
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(320)
  for (const name of ['Cancel', 'Archive Admin']) {
    await expect.poll(async () => (await ask.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await confirm(page).click()
  await expect(text(page, 'Brian Dijamco archived.')).toBeVisible()
  expect(await panelOverflow(page)).toBeLessThanOrEqual(0)

  await showStatus(page, 'Archived')
  await expect(restoreBtn(page)).toBeVisible()
  await expect(page.getByText('Archived', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
})
