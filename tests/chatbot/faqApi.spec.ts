import { expect, test, type Page, type Request } from '@playwright/test'
import { apiFaq, FAQS, mockFaqs } from '../shared/faqs'

// The Help Chatbot on top of the FAQ API: what the admin page sends, what it does with odd rows and failures, and what a guest's bot gets.
// The API is stubbed (tests/shared/faqs.ts); sign-in is the dev-only simulated one, so one browser context plays the admin and then the guest.

const ADMIN = { email: 'admin@silhoufit.dev', password: 'Admin@12345' }
const PAGE_ORIGIN = 'http://localhost:5173'
const CORS = { 'access-control-allow-origin': '*' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

const isFaqCall = (url: URL) => url.origin !== PAGE_ORIGIN && /^\/faqs(\/|$)/.test(url.pathname)

/** The writes (POST, PATCH, DELETE) the page sends to the FAQ API, in order. */
function recordWrites(page: Page) {
  const writes: { method: string; path: string; body: unknown }[] = []
  page.on('request', (request: Request) => {
    const url = new URL(request.url())
    if (isFaqCall(url) && ['POST', 'PATCH', 'DELETE'].includes(request.method())) writes.push({ method: request.method(), path: url.pathname, body: request.postDataJSON() })
  })
  return writes
}

/** Answers the first GET /faqs calls with a failure, then lets the stub answer. */
async function failReads(page: Page, times: number) {
  let left = times
  await page.route(isFaqCall, (route) => {
    if (route.request().method() !== 'GET' || left-- <= 0) return route.fallback()
    return route.fulfill({ status: 500, json: { message: 'Internal server error' }, headers: CORS })
  })
}

async function signInAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

async function openAdminPage(page: Page) {
  await signInAsAdmin(page)
  await page.goto('/admin/chatbot')
  await expect(page.getByRole('heading', { level: 1, name: 'Help Chatbot' })).toBeVisible({ timeout: 20_000 })
}

/** Ends the dev session the way a closed tab would: the next page load is a guest. */
const becomeGuest = (page: Page) => page.evaluate(() => localStorage.removeItem('silhoufit-session'))

const box = (page: Page) => page.getByRole('region', { name: 'Chat with KRAL Help' })

async function openBot(page: Page) {
  await page.goto('/shop')
  await page.getByRole('button', { name: 'Ask KRAL Help' }).click()
  await expect(box(page)).toBeVisible()
}

async function askBot(page: Page, text: string) {
  const message = box(page).getByRole('textbox', { name: 'Message' })
  await message.fill(text)
  await message.press('Enter')
}

async function addQuestion(page: Page, { question, answer, keywords, topic, link, publish }: { question: string; answer: string; keywords: string; topic?: string; link?: string; publish: boolean }) {
  await page.getByRole('button', { name: 'Add question' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Add question' })
  await sheet.getByRole('textbox', { name: 'Question', exact: true }).fill(question)
  await sheet.getByRole('textbox', { name: 'Answer', exact: true }).fill(answer)
  await sheet.getByRole('textbox', { name: /^Keywords/ }).fill(keywords)
  if (topic) {
    await sheet.getByRole('combobox', { name: 'Topic' }).click()
    await page.getByRole('option', { name: topic, exact: true }).click()
  }
  if (link) {
    await sheet.getByRole('combobox', { name: 'Link page' }).click()
    await page.getByRole('option', { name: link, exact: true }).click()
  }
  if (publish) await sheet.locator('label', { hasText: 'Published' }).click()
  return sheet
}

test('creating a question sends the API its fields, and the bot shows the link button worded from the page', async ({ page }) => {
  await mockFaqs(page, FAQS)
  const writes = recordWrites(page)
  await openAdminPage(page)

  const sheet = await addQuestion(page, {
    question: 'Can I try a coat on in AR?',
    answer: 'Yes, pieces marked AR-ready can be tried on with your camera.',
    keywords: 'coat, try on',
    topic: 'AR fitting',
    link: 'Cart',
    publish: true,
  })
  // The wording of the button comes from the page, so the form has no field for it.
  await expect(sheet.getByRole('textbox', { name: /link text/i })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.getByText('Question "Can I try a coat on in AR?" added')).toBeVisible()

  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    method: 'POST',
    path: '/faqs',
    body: { question: 'Can I try a coat on in AR?', answer: 'Yes, pieces marked AR-ready can be tried on with your camera.', topic: 'ar_fitting', keywords: ['coat', 'try on'], link: '/cart', isActive: true },
  })
  expect(Object.keys(writes[0].body as object).sort()).toEqual(['answer', 'isActive', 'keywords', 'link', 'question', 'topic'])

  await becomeGuest(page)
  await openBot(page)
  await askBot(page, 'Can I try a coat on in AR?')
  await expect(box(page).getByText(/pieces marked AR-ready can be tried on/)).toBeVisible()
  await expect(box(page).getByRole('link', { name: 'Open my cart' })).toHaveAttribute('href', '/cart')
})

test('a draft is sent with isActive false, listed as Draft for the admin, and hidden from a guest', async ({ page }) => {
  await mockFaqs(page, FAQS)
  const writes = recordWrites(page)
  await openAdminPage(page)

  const sheet = await addQuestion(page, { question: 'Do you sell scarves?', answer: 'Scarves are planned for the winter range.', keywords: 'scarf, muffler', publish: false })
  await sheet.getByRole('button', { name: 'Add question', exact: true }).click()
  await expect(page.getByText('Question "Do you sell scarves?" added as a draft')).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0].body).toMatchObject({ question: 'Do you sell scarves?', isActive: false })

  // The admin list still has it, marked Draft (it is last, so search for it).
  await page.getByRole('textbox', { name: 'Search questions' }).fill('scarves')
  await expect(page.getByText('Displaying 1–1 of 1')).toBeVisible()
  await expect(page.getByText('Draft', { exact: true }).filter({ visible: true })).toHaveCount(1)

  await becomeGuest(page)
  await openBot(page)
  await askBot(page, 'scarf muffler')
  await expect(box(page).getByText("I don't have an answer for that yet.")).toBeVisible()
  await expect(box(page).getByText(/Scarves are planned/)).toHaveCount(0)
})

test('a soft-deleted row never appears in the admin list', async ({ page }) => {
  const reads: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (isFaqCall(url) && request.method() === 'GET') reads.push(url.search)
  })
  await mockFaqs(page, [...FAQS, apiFaq(50, { question: 'Removed question zebra?', answer: 'Removed answer.', isDeleted: true, order: 0 })])
  await openAdminPage(page)
  await expect(page.getByText(FAQS[0].question).filter({ visible: true }).first()).toBeVisible()

  // The admin asks for every row, so the API did send the deleted one; the page leaves it out.
  expect(reads.some((search) => search.includes('status=all'))).toBe(true)
  await expect(page.getByText('Displaying 1–10 of 15')).toBeVisible()
  await page.getByRole('textbox', { name: 'Search questions' }).fill('zebra')
  await expect(page.getByText('No questions match')).toBeVisible()
  await expect(page.getByText('Removed question zebra?')).toHaveCount(0)
})

test('moving a row down sends PATCH with the position of the row below it', async ({ page }) => {
  await mockFaqs(page, FAQS)
  const writes = recordWrites(page)
  await openAdminPage(page)

  await page.getByRole('button', { name: `Move down: ${FAQS[0].question}` }).filter({ visible: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Moved to position 2' })).toBeAttached()
  expect(writes).toEqual([{ method: 'PATCH', path: `/faqs/${FAQS[0].id}`, body: { order: 2 } }])
})

for (const link of ['/admin/users', 'https://x.test']) {
  test(`an answer whose link is ${link} is shown in the bot without any link`, async ({ page }) => {
    await mockFaqs(page, [
      apiFaq(1, { question: 'Where is the staff area?', answer: 'The staff area is for the team only.', keywords: ['staff'], link }),
      apiFaq(2, { question: 'Where is my cart?', answer: 'Your cart lives in the top bar.', keywords: ['cart'], link: '/cart' }),
    ])
    await openBot(page)
    await box(page).getByRole('button', { name: 'Where is the staff area?', exact: true }).click()
    await expect(box(page).getByText('The staff area is for the team only.')).toBeVisible()
    await expect(box(page).getByRole('link')).toHaveCount(0)

    // A listed page on another answer still gets its button.
    await box(page).getByRole('button', { name: 'Where is my cart?', exact: true }).click()
    await expect(box(page).getByText('Your cart lives in the top bar.')).toBeVisible()
    await expect(box(page).getByRole('link', { name: 'Open my cart' })).toBeVisible()
  })
}

test('GET /faqs failing with 500 shows the error state on the admin page, and Retry recovers', async ({ page }) => {
  await mockFaqs(page, FAQS)
  await failReads(page, 1)
  await openAdminPage(page)

  await expect(page.getByText("We couldn't load the help answers.")).toBeVisible()
  await expect(page.getByText('Something went wrong on our side.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText(FAQS[0].question).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText("We couldn't load the help answers.")).toHaveCount(0)
})

test('GET /faqs failing with 500 shows the error state in the bot, and Retry recovers', async ({ page }) => {
  await mockFaqs(page, FAQS)
  await failReads(page, 1)
  await page.goto('/shop')
  await page.getByRole('button', { name: 'Ask KRAL Help' }).click()
  await expect(box(page).getByText("We couldn't load the help answers.")).toBeVisible()
  await box(page).getByRole('button', { name: 'Retry' }).click()
  await expect(box(page).getByRole('button', { name: 'Browse topics' })).toBeVisible()
})

test('a 400 on save whose message starts with "question" is shown by the Question field and keeps what was typed', async ({ page }) => {
  await mockFaqs(page, FAQS)
  await page.route(isFaqCall, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 400, json: { message: ['question already exists'], error: 'Bad Request', statusCode: 400 }, headers: CORS })
  })
  await openAdminPage(page)

  const sheet = await addQuestion(page, { question: 'What is SilhouFit?', answer: 'A second copy of an answer that already exists.', keywords: 'dup', publish: false })
  await sheet.getByRole('button', { name: 'Add question', exact: true }).click()

  const question = sheet.getByRole('textbox', { name: 'Question', exact: true })
  await expect(sheet.getByText('question already exists')).toBeVisible()
  await expect(question).toHaveAttribute('aria-invalid', 'true')
  await expect(question).toBeFocused()
  await expect(question).toHaveValue('What is SilhouFit?')
  await expect(sheet.getByRole('textbox', { name: 'Answer', exact: true })).toHaveValue('A second copy of an answer that already exists.')
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet).toBeVisible()
})

test('an empty API list shows the empty state to the admin and the no-answers box to a guest', async ({ page }) => {
  await mockFaqs(page, [])
  await openAdminPage(page)
  await expect(page.getByText('No questions yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add question' }).first()).toBeVisible()

  await becomeGuest(page)
  await openBot(page)
  await expect(box(page).getByText('No saved answers yet')).toBeVisible()
  await expect(box(page).getByRole('textbox', { name: 'Message' })).toHaveCount(0)
})

test('the admin page stays inside a 390px screen, with a long answer and with the sheet open', async ({ page }) => {
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await mockFaqs(page, [apiFaq(1, { question: 'Q'.repeat(120), answer: 'A'.repeat(300), topic: 'ar_fitting', keywords: ['k'] }), ...FAQS.slice(0, 3)])
  await page.setViewportSize({ width: 390, height: 844 })
  await openAdminPage(page)
  await expect(page.getByText('Q'.repeat(120)).filter({ visible: true }).first()).toBeVisible()
  expect(await overflow()).toBe(0)

  await page.getByRole('button', { name: 'Add question' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Add question' })).toBeVisible()
  expect(await overflow()).toBe(0)
})
