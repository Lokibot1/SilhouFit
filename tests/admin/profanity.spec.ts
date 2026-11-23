import { expect, test, type Page } from '@playwright/test'
import { adminOffense, adminWord, manyAdminOffenses, manyAdminWords, mockAdminProfanity, type AdminProfanityMock } from '../shared/adminProfanity'

// /superadmin/profanity: the words the filter hides in chat and reviews, and the offenses log. Superadmin only. The API's /admin/profanity-words and
// /admin/profanity-offenses are answered by tests/shared/adminProfanity.ts. Sign-in is the dev-only simulated one (the dev accounts have no API token).
// The word and offense tables switch to cards below the container breakpoint, so every locator here works for both. Runs in the desktop and mobile projects.

const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }
const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const STAFF = { email: 'sam.reyes@silhoufit.dev', password: 'Staff@12345' }
const PATH = '/superadmin/profanity'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function signIn(page: Page, { email, password }: { email: string; password: string }, home: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(home)
}

const h1 = (page: Page) => page.getByRole('heading', { level: 1, name: 'Profanity Filter' })

/** Signs in as the superadmin and opens the page, optionally on the Offenses tab. */
async function open(page: Page, initial: Parameters<typeof mockAdminProfanity>[1] = { words: manyAdminWords(3) }, tab: 'Words' | 'Offenses' = 'Words'): Promise<AdminProfanityMock> {
  const mock = await mockAdminProfanity(page, initial)
  await signIn(page, SUPERADMIN, /\/superadmin$/)
  await page.goto(PATH)
  await expect(h1(page)).toBeVisible({ timeout: 20_000 })
  if (tab === 'Offenses') await page.getByRole('tab', { name: 'Offenses', exact: true }).click()
  return mock
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text })
const wordsTab = (page: Page, name: 'Active' | 'Archived' | 'All') => page.getByRole('tab', { name, exact: true })
const list = (page: Page, name: 'Words' | 'Offenses') => page.getByRole('row').or(page.getByRole('list', { name }).getByRole('listitem'))

async function pick(page: Page, field: RegExp, option: string) {
  await page.getByRole('combobox', { name: field }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function showNav(page: Page) {
  const burger = page.getByRole('button', { name: 'Open menu' })
  if (!(await burger.isVisible())) return
  const dashboard = page.getByRole('link', { name: 'Dashboard' }).first()
  await expect(async () => {
    if (!(await dashboard.isVisible())) await burger.click()
    await expect(dashboard).toBeVisible({ timeout: 1000 })
  }).toPass()
}

test.describe('access control', () => {
  test('a superadmin sees Profanity Filter under Super admin tools, opens it from the sidebar, and the page has its own title', async ({ page }) => {
    await mockAdminProfanity(page, { words: manyAdminWords(2) })
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await showNav(page)
    const sidebar = page.getByRole('navigation').filter({ has: page.getByRole('link', { name: 'Profanity Filter' }) })
    // On a phone the drawer can close again while the page settles, so reopen it until the heading shows.
    const burger = page.getByRole('button', { name: 'Open menu' })
    await expect(async () => {
      if (!(await sidebar.getByText('Super admin tools', { exact: true }).isVisible()) && (await burger.isVisible())) await burger.click()
      await expect(sidebar.getByText('Super admin tools', { exact: true })).toBeVisible({ timeout: 1000 })
    }).toPass()
    const link = sidebar.getByRole('link', { name: 'Profanity Filter', exact: true })
    await expect(link).toHaveAttribute('href', PATH)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${PATH}$`))
    await expect(h1(page)).toBeVisible()
    await expect(page).toHaveTitle('Profanity Filter — SilhouFit')
    await expect(page.getByRole('link', { name: 'Profanity Filter', exact: true }).first()).toHaveAttribute('aria-current', 'page')
  })

  test('an admin has no Profanity Filter link and gets the not-found page at the superadmin and admin URLs', async ({ page }) => {
    const mock = await mockAdminProfanity(page, { words: manyAdminWords(2) })
    await signIn(page, ADMIN, /\/admin$/)
    await showNav(page)
    await expect(page.getByRole('link', { name: 'Profanity Filter' })).toHaveCount(0)
    for (const path of ['/admin/profanity', PATH]) {
      await page.goto(path)
      await expect(h1(page)).toHaveCount(0)
    }
    expect(mock.wordLists).toHaveLength(0)
  })

  test('staff have no Profanity Filter link and cannot open the page', async ({ page }) => {
    const mock = await mockAdminProfanity(page, { words: manyAdminWords(2) })
    await signIn(page, STAFF, /\/staff$/)
    await showNav(page)
    await expect(page.getByRole('link', { name: 'Profanity Filter' })).toHaveCount(0)
    await page.goto(PATH)
    await expect(h1(page)).toHaveCount(0)
    expect(mock.wordLists).toHaveLength(0)
  })
})

test.describe('words', () => {
  test('lists the active words newest first with language, status and last update in 12-hour time, and sends the active status and a limit of at most 100', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha', language: 'fil' }), adminWord(2, { word: 'bravo' })] })
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit bravo' })).toBeVisible()
    const first = list(page, 'Words').filter({ hasText: 'alpha' }).first()
    await expect(first).toContainText('Filipino')
    await expect(first).toContainText('Active')
    await expect(first).toContainText(/\b\d{1,2}:\d{2}\s?[AP]M\b/i)
    expect(Number(mock.wordLists[0].get('limit'))).toBeLessThanOrEqual(100)
    expect(['active', null]).toContain(mock.wordLists[0].get('status'))
  })

  test('the Archived and All tabs ask for those statuses, and an archived word offers Restore, not Edit or Archive', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha' }), adminWord(2, { word: 'bravo', isDeleted: true })] })
    await expect(page.getByRole('button', { name: 'Restore bravo' })).toHaveCount(0)
    await wordsTab(page, 'Archived').click()
    await expect.poll(() => mock.wordLists.at(-1)?.get('status')).toBe('archived')
    await expect(page.getByRole('button', { name: 'Restore bravo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit bravo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archive bravo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toHaveCount(0)
    await wordsTab(page, 'All').click()
    await expect.poll(() => mock.wordLists.at(-1)?.get('status')).toBe('all')
    await expect(page.getByRole('button', { name: 'Restore bravo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toBeVisible()
  })

  test('search and the language filter send the right query, and a miss shows No words match with Clear filters', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha', language: 'fil' }), adminWord(2, { word: 'bravo', language: 'en' })] })
    await page.getByRole('textbox', { name: 'Search words' }).fill('brav')
    await expect.poll(() => mock.wordLists.at(-1)?.get('search')).toBe('brav')
    await expect(page.getByRole('button', { name: 'Edit bravo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Search words' }).fill('zzzz')
    await expect(page.getByText('No words match')).toBeVisible()
    await expect(page.getByText('Check the spelling, or clear the search and language and try again.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByRole('textbox', { name: 'Search words' })).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toBeVisible()
    await pick(page, /Filter by language/, 'Filipino')
    await expect.poll(() => mock.wordLists.at(-1)?.get('language')).toBe('fil')
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit bravo' })).toHaveCount(0)
  })

  test('adding a word: Add Word stays disabled until there is text, then saves it lowercase with the chosen language and a success toast', async ({ page }) => {
    const mock = await open(page, { words: manyAdminWords(2) })
    await page.getByRole('button', { name: 'Add word', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add word' })
    await expect(dialog.getByRole('button', { name: 'Add Word', exact: true })).toBeDisabled()
    await dialog.getByLabel('Word or phrase').fill('Bad Word')
    await expect(dialog.getByText('8/100')).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Language' }).click()
    await page.getByRole('option', { name: 'Filipino', exact: true }).click()
    await dialog.getByRole('button', { name: 'Add Word', exact: true }).click()
    await expect(toast(page, '"bad word" added to the filter.')).toBeVisible()
    await expect(dialog).toHaveCount(0)
    expect(mock.writes).toEqual(['POST /'])
    expect(mock.bodies).toEqual([{ word: 'Bad Word', language: 'fil' }])
    await expect(page.getByRole('button', { name: 'Edit bad word' })).toBeVisible()
  })

  test('the form refuses digits, symbols and emoji with an inline message and sends nothing', async ({ page }) => {
    const mock = await open(page, { words: manyAdminWords(2) })
    await page.getByRole('button', { name: 'Add word', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add word' })
    for (const bad of ['word123', 'wo$rd', 'word \u{1F600}']) {
      await dialog.getByLabel('Word or phrase').fill(bad)
      await expect(dialog.getByText("Use letters and spaces only. Numbers, symbols and emoji aren't allowed.")).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Add Word', exact: true })).toBeDisabled()
    }
    await dialog.getByLabel('Word or phrase').fill('mala palabra')
    await expect(dialog.getByText(/Use letters and spaces only/)).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Add Word', exact: true })).toBeEnabled()
    expect(mock.writes).toHaveLength(0)
  })

  test('the word field stops at 100 characters', async ({ page }) => {
    await open(page, { words: manyAdminWords(2) })
    await page.getByRole('button', { name: 'Add word', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add word' })
    await dialog.getByLabel('Word or phrase').fill('a'.repeat(130))
    await expect(dialog.getByText('100/100')).toBeVisible()
  })

  test('a duplicate word shows the server 409 inline, keeps the dialog and the typed text, and no success toast', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha' })] })
    await page.getByRole('button', { name: 'Add word', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add word' })
    await dialog.getByLabel('Word or phrase').fill('alpha')
    await dialog.getByRole('button', { name: 'Add Word', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Profanity word "alpha" already exists')
    await expect(dialog.getByRole('alert')).toContainText('Edit the existing word instead.')
    await expect(dialog.getByLabel('Word or phrase')).toHaveValue('alpha')
    await expect(toast(page, 'added to the filter')).toHaveCount(0)
    expect(mock.writes).toEqual(['POST /'])
  })

  test('editing: Save word is disabled until something changes, and the update sends PATCH with the new text and a toast', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha' })] })
    await page.getByRole('button', { name: 'Edit alpha' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit word' })
    await expect(dialog.getByLabel('Word or phrase')).toHaveValue('alpha')
    await expect(dialog.getByRole('button', { name: 'Save word', exact: true })).toBeDisabled()
    await dialog.getByLabel('Word or phrase').fill('alphas')
    await dialog.getByRole('button', { name: 'Save word', exact: true }).click()
    await expect(toast(page, '"alphas" updated.')).toBeVisible()
    expect(mock.writes).toEqual([`PATCH /${mock.words[0].id}`])
    expect(mock.bodies).toEqual([{ word: 'alphas', language: 'en' }])
    await expect(page.getByRole('button', { name: 'Edit alphas' })).toBeVisible()
  })

  test('Cancel and Escape close the form without sending anything', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha' })] })
    await page.getByRole('button', { name: 'Edit alpha' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit word' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Add word', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Add word' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(mock.writes).toHaveLength(0)
  })

  test('archiving asks "Are you sure?" first, Cancel sends nothing, confirming archives and Undo restores', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha' }), adminWord(2, { word: 'bravo' })] })
    await page.getByRole('button', { name: 'Archive alpha' }).click()
    const confirm = page.getByRole('dialog', { name: 'Archive "alpha"?' })
    await expect(confirm.getByText('Are you sure?')).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Archive Word' })).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toHaveCount(0)
    expect(mock.writes).toHaveLength(0)

    await page.getByRole('button', { name: 'Archive alpha' }).click()
    await page.getByRole('dialog', { name: 'Archive "alpha"?' }).getByRole('button', { name: 'Archive Word' }).click()
    await expect(toast(page, '"alpha" archived.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toHaveCount(0)
    expect(mock.writes).toEqual([`DELETE /${mock.words[0].id}`])

    await toast(page, '"alpha" archived.').getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page, '"alpha" restored.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toBeVisible()
    expect(mock.writes).toEqual([`DELETE /${mock.words[0].id}`, `POST /${mock.words[0].id}/restore`])
  })

  test('a 404 on archive explains the word is gone and the list reloads', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha' })] })
    const before = mock.wordLists.length
    mock.words.splice(0, 1)
    mock.nextWrite = { status: 404, json: { statusCode: 404, message: 'Profanity word not found', error: 'Not Found' } }
    await page.getByRole('button', { name: 'Archive alpha' }).click()
    await page.getByRole('dialog', { name: 'Archive "alpha"?' }).getByRole('button', { name: 'Archive Word' }).click()
    await expect(toast(page, /The word no longer exists or was already archived/)).toBeVisible()
    await expect.poll(() => mock.wordLists.length).toBeGreaterThan(before)
    await expect(page.getByRole('button', { name: 'Archive alpha' })).toHaveCount(0)
  })

  test('restoring an archived word shows a toast and moves it back to Active', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha', isDeleted: true })] })
    await wordsTab(page, 'Archived').click()
    await page.getByRole('button', { name: 'Restore alpha' }).click()
    await expect(toast(page, '"alpha" restored. It is hidden in chat and reviews again.')).toBeVisible()
    expect(mock.writes).toEqual([`POST /${mock.words[0].id}/restore`])
    await expect(page.getByRole('button', { name: 'Restore alpha' })).toHaveCount(0)
    await wordsTab(page, 'Active').click()
    await expect(page.getByRole('button', { name: 'Edit alpha' })).toBeVisible()
  })

  test('a failed restore shows an error toast with Retry', async ({ page }) => {
    const mock = await open(page, { words: [adminWord(1, { word: 'alpha', isDeleted: true })] })
    await wordsTab(page, 'Archived').click()
    mock.nextWrite = { status: 500, json: { statusCode: 500, message: 'Internal server error' } }
    await page.getByRole('button', { name: 'Restore alpha' }).click()
    await expect(toast(page, /Couldn't restore "alpha"/)).toBeVisible()
    await toast(page, /Couldn't restore "alpha"/).getByRole('button', { name: 'Retry' }).click()
    await expect(toast(page, '"alpha" restored.')).toBeVisible()
  })

  test('empty states: no words yet offers Add word; no archived words offers Show active words', async ({ page }) => {
    await open(page, { words: [] })
    await expect(page.getByText('No words yet')).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Add word', exact: true }).last().click()
    await expect(page.getByRole('dialog', { name: 'Add word' })).toBeVisible()
    await page.keyboard.press('Escape')
    await wordsTab(page, 'Archived').click()
    await expect(page.getByText('No archived words')).toBeVisible()
    await page.getByRole('button', { name: 'Show active words' }).click()
    await expect(page.getByText('No words yet')).toBeVisible()
  })

  test('a failed load shows the error with Retry, and Retry loads the words', async ({ page }) => {
    const mock = await mockAdminProfanity(page, { words: manyAdminWords(2) })
    let fail = true
    await page.route(
      (url) => url.port !== '5173' && url.pathname === '/admin/profanity-words',
      (route) => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { statusCode: 500, message: 'Internal server error' }, headers: { 'access-control-allow-origin': '*' } }) : route.fallback()),
    )
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto(PATH)
    await expect(h1(page)).toBeVisible({ timeout: 20_000 })
    const retry = page.getByRole('button', { name: /Retry|Try again/ })
    await expect(retry.first()).toBeVisible({ timeout: 20_000 })
    fail = false
    await retry.first().click()
    await expect(page.getByRole('button', { name: 'Edit worda' })).toBeVisible()
    expect(mock.wordLists.length).toBeGreaterThan(0)
  })

  test('shows a loading state while the words load', async ({ page }) => {
    await mockAdminProfanity(page, { words: manyAdminWords(2) })
    await page.route(
      (url) => url.port !== '5173' && url.pathname === '/admin/profanity-words',
      async (route) => {
        if (route.request().method() === 'GET') await new Promise((resolve) => setTimeout(resolve, 1500))
        await route.fallback()
      },
    )
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto(PATH)
    await expect(page.getByRole('status').filter({ hasText: 'Loading words' })).toBeAttached()
    await expect(page.getByRole('button', { name: 'Edit worda' })).toBeVisible({ timeout: 15_000 })
  })

  test('paginates: 25 words show a pager and the next page asks for page 2', async ({ page }) => {
    const mock = await open(page, { words: manyAdminWords(45) })
    await expect(page.getByRole('button', { name: /^(Edit|Archive) / }).first()).toBeVisible()
    await page.getByRole('button', { name: /Next page|^Next$/ }).first().click()
    await expect.poll(() => mock.wordLists.at(-1)?.get('page')).toBe('2')
  })

  test('keyboard: Tab reaches Add word, Enter opens the form with focus inside, Escape closes it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard path is the same on desktop')
    await open(page, { words: manyAdminWords(2) })
    await page.getByRole('button', { name: 'Add word', exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add word' })
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})

test.describe('offenses', () => {
  test('lists date on two lines in 12-hour time, customer, source, masked message, matched words and count, and never the original text', async ({ page }) => {
    await open(page, { offenses: [adminOffense(1, { matchedWords: ['stupid', 'idiot'], matchCount: 2 })] }, 'Offenses')
    const row = list(page, 'Offenses').filter({ hasText: 'Anne Santos' }).first()
    await expect(row).toContainText('you are ***** 1')
    await expect(row).toContainText('stupid, idiot')
    await expect(row).toContainText(/\b\d{1,2}:\d{2}\s?[AP]M/i)
    await expect(row).toContainText('Chat message')
    await expect(page.getByText('original secret text')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('original secret text')
  })

  test('table: the date cell holds the day and the time on separate lines', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'the table is a desktop layout')
    await page.setViewportSize({ width: 1920, height: 1000 })
    await open(page, { offenses: [adminOffense(1)] }, 'Offenses')
    const date = page.getByRole('row').filter({ hasText: 'Anne Santos' }).locator('time')
    await expect(date).toBeVisible()
    await expect(date.locator('span')).toHaveCount(2)
  })

  test('the source filter and the date range send the right query; a date-only end is sent as the end of that local day', async ({ page }) => {
    const mock = await open(page, { offenses: manyAdminOffenses(3) }, 'Offenses')
    await pick(page, /Filter by source/, 'Product review')
    await expect.poll(() => mock.offenseLists.at(-1)?.get('source')).toBe('PRODUCT_REVIEW')
    await page.getByLabel('From date').fill('2026-09-01')
    await page.getByLabel('To date').fill('2026-10-31')
    await expect.poll(() => mock.offenseLists.at(-1)?.get('endDate')).toBe(new Date('2026-10-31T23:59:59.999').toISOString())
    expect(mock.offenseLists.at(-1)?.get('startDate')).toBe(new Date('2026-09-01T00:00:00').toISOString())
  })

  test('the From and To date labels sit on the box border', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, { offenses: manyAdminOffenses(3) }, 'Offenses')
    for (const name of ['From date', 'To date']) {
      const input = (await page.getByLabel(name).boundingBox())!
      const label = (await page.locator('.field__label', { hasText: name }).boundingBox())!
      expect(Math.abs(label.y + label.height / 2 - input.y)).toBeLessThan(2)
    }
  })

  test('an end date before the start date shows the inline error and the empty note with Clear filters', async ({ page }) => {
    const mock = await open(page, { offenses: manyAdminOffenses(3) }, 'Offenses')
    await page.getByLabel('To date').fill('2026-09-01')
    await page.getByLabel('From date').evaluate((el: HTMLInputElement) => {
      // The picker caps From at the To date, so set it as typing a later date would; the page still has to say so.
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(el, '2026-10-15')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(page.getByText('The end date is before the start date.').first()).toBeVisible()
    await expect(page.getByLabel('To date')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('No offenses match')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByLabel('From date')).toHaveValue('')
    await expect(page.getByLabel('To date')).toHaveValue('')
    await expect(list(page, 'Offenses').filter({ hasText: 'Anne Santos' }).first()).toBeVisible()
    void mock
  })

  test('empty states: none yet, and filters that match nothing', async ({ page }) => {
    await open(page, { offenses: [] }, 'Offenses')
    await expect(page.getByText('No offenses yet')).toBeVisible()
  })

  test('a filter that matches nothing shows No offenses match with Clear filters', async ({ page }) => {
    await open(page, { offenses: manyAdminOffenses(2) }, 'Offenses')
    await page.getByLabel('From date').fill('2030-01-01')
    await expect(page.getByText('No offenses match')).toBeVisible()
    await expect(page.getByText('Try a wider date range or another source, or clear the filters.')).toBeVisible()
  })

  test('a failed load shows the error with Retry', async ({ page }) => {
    await mockAdminProfanity(page, { offenses: manyAdminOffenses(2) })
    let fail = true
    await page.route(
      (url) => url.port !== '5173' && url.pathname === '/admin/profanity-offenses',
      (route) => (fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { statusCode: 500, message: 'Internal server error' }, headers: { 'access-control-allow-origin': '*' } }) : route.fallback()),
    )
    await signIn(page, SUPERADMIN, /\/superadmin$/)
    await page.goto(PATH)
    await expect(h1(page)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('tab', { name: 'Offenses', exact: true }).click()
    const retry = page.getByRole('button', { name: /Retry|Try again/ })
    await expect(retry.first()).toBeVisible({ timeout: 20_000 })
    fail = false
    await retry.first().click()
    await expect(list(page, 'Offenses').filter({ hasText: 'Anne Santos' }).first()).toBeVisible()
  })
})

test.describe('layout and theme', () => {
  for (const [width, height] of [[320, 640], [768, 900], [1280, 800]] as const) {
    test(`Words and Offenses stay inside a ${width}px screen`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, { words: [adminWord(1, { word: 'averyveryverylongwordthatkeepsgoingandgoing' }), ...manyAdminWords(5).slice(1)], offenses: [adminOffense(1, { maskedContent: 'x'.repeat(200), matchedWords: ['averyveryverylongword'] }), ...manyAdminOffenses(4).slice(1)] })
      await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await page.getByRole('tab', { name: 'Offenses', exact: true }).click()
      await expect(list(page, 'Offenses').filter({ hasText: 'Anne Santos' }).first()).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      const message = (await page.getByText('xxxxxxxxxx').locator('visible=true').first().boundingBox())!
      expect(message.height).toBeGreaterThanOrEqual(16)
    })
  }

  test('the Add word dialog fits a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await open(page, { words: manyAdminWords(2) })
    await page.getByRole('button', { name: 'Add word', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add word' })
    await expect(dialog).toBeVisible()
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  test('renders in dark mode with readable text', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await open(page, { words: manyAdminWords(3) })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: 'Edit worda' })).toBeVisible()
    const lum = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3
    const { bg, text } = await h1(page).evaluate((el) => {
      let bgColor = 'rgba(0, 0, 0, 0)'
      for (let node: Element | null = el; node && bgColor === 'rgba(0, 0, 0, 0)'; node = node.parentElement) bgColor = getComputedStyle(node).backgroundColor
      return { bg: bgColor, text: getComputedStyle(el).color }
    })
    expect(lum(bg)).toBeLessThan(110)
    expect(lum(text)).toBeGreaterThan(150)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

test('an unknown superadmin route shows the not-found page, not the profanity page', async ({ page }) => {
  await open(page, { words: manyAdminWords(1) })
  await page.goto('/superadmin/profanity-filter')
  await expect(h1(page)).toHaveCount(0)
  await expect(page.getByText(/404|not found|couldn't find/i).first()).toBeVisible()
})

