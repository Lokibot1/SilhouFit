import { expect as baseExpect, test, type Page } from '@playwright/test'
import { mockStaffMe } from '../shared/products'
import { apiReview, mockReviews, reviewId, type ReviewsMock } from '../shared/reviewsApi'
import { DEMO, mockAuth } from '../shared/session'

// Review moderation (/<area>/reviews) against the real /admin/reviews contract, which tests/shared/reviewsApi.ts answers.
// Staff, admin and superadmin each open their own area's page and do the same things: reply, edit, remove a reply, delete with Undo, restore.
// The list is a table from the panel's @4xl and cards below it, so a review is found as a row or a list item.

const expect = baseExpect.configure({ timeout: 10_000 })

const ROLES = ['staff', 'admin', 'superadmin'] as const

let reviews: ReviewsMock

async function open(page: Page, role: (typeof ROLES)[number]) {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  await mockStaffMe(page, role)
  reviews = await mockReviews(page, {
    admin: [
      apiReview(1, { rating: 5 }),
      apiReview(2, { rating: 3, adminReply: 'Thanks for the kind words.', adminRepliedAt: '2026-11-02T03:00:00.000Z' }),
      apiReview(3, { rating: 1, isDeleted: true }),
    ],
  })
  await page.goto(`/login?next=${encodeURIComponent(`/${role}/reviews`)}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Reviews' })).toBeVisible({ timeout: 20_000 })
  await expect(rowOf(page, 1)).toBeVisible()
}

const rowOf = (page: Page, n: number) => page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: `Reviewer Number${n}` })
const toast = (page: Page, text: string) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text })
const last = () => reviews.moderation[reviews.moderation.length - 1]

for (const role of ROLES) {
  test.describe(`${role}`, () => {
    test('opens the reviews page from the sidebar route and lists published reviews only', async ({ page }) => {
      await open(page, role)
      await expect(page).toHaveURL(new RegExp(`/${role}/reviews$`))
      await expect(rowOf(page, 2)).toContainText('Replied')
      await expect(rowOf(page, 3)).toHaveCount(0)
      expect(reviews.adminQueries[0].get('includeDeleted')).toBeNull()
    })

    test('posts a reply', async ({ page }) => {
      await open(page, role)
      await rowOf(page, 1).getByRole('button', { name: "Reply to Reviewer Number1's review" }).click()
      const dialog = page.getByRole('dialog', { name: 'Reply to review' })
      await dialog.getByRole('textbox', { name: 'Your reply' }).fill('Thank you for the feedback!')
      await expect(dialog.getByText('27/2000')).toBeVisible()
      await dialog.getByRole('button', { name: 'Post reply' }).click()
      await expect(toast(page, 'Reply posted.')).toBeVisible()
      await expect(rowOf(page, 1)).toContainText('Replied')
      expect(last()).toMatchObject({ action: 'reply', id: reviewId(1), body: { reply: 'Thank you for the feedback!' } })
    })

    test('edits a reply from its current text', async ({ page }) => {
      await open(page, role)
      await rowOf(page, 2).getByRole('button', { name: "Edit your reply to Reviewer Number2's review" }).click()
      const dialog = page.getByRole('dialog', { name: 'Edit reply' })
      const box = dialog.getByRole('textbox', { name: 'Your reply' })
      await expect(box).toHaveValue('Thanks for the kind words.')
      await box.fill('Thanks, enjoy the shirt.')
      await dialog.getByRole('button', { name: 'Save reply' }).click()
      await expect(toast(page, 'Reply updated.')).toBeVisible()
      expect(last()).toMatchObject({ action: 'reply', id: reviewId(2), body: { reply: 'Thanks, enjoy the shirt.' } })
    })

    test('removes a reply only after confirming', async ({ page }) => {
      await open(page, role)
      await rowOf(page, 2).getByRole('button', { name: "Remove your reply to Reviewer Number2's review" }).click()
      const dialog = page.getByRole('dialog', { name: 'Remove your reply?' })
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      expect(reviews.moderation).toHaveLength(0)
      await rowOf(page, 2).getByRole('button', { name: "Remove your reply to Reviewer Number2's review" }).click()
      await dialog.getByRole('button', { name: 'Remove reply' }).click()
      await expect(toast(page, 'Reply removed.')).toBeVisible()
      await expect(rowOf(page, 2)).not.toContainText('Replied')
      expect(last()).toMatchObject({ action: 'delete-reply', id: reviewId(2) })
    })

    test('deletes a review after confirming, and Undo brings it back', async ({ page }) => {
      await open(page, role)
      await rowOf(page, 1).getByRole('button', { name: "Delete Reviewer Number1's review" }).click()
      await page.getByRole('dialog', { name: "Delete Reviewer Number1's review?" }).getByRole('button', { name: 'Delete review', exact: true }).click()
      await expect(toast(page, "Reviewer Number1's review is deleted.")).toBeVisible()
      await expect(rowOf(page, 1)).toHaveCount(0)
      expect(last()).toMatchObject({ method: 'DELETE', action: 'delete', id: reviewId(1) })
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(toast(page, "Reviewer Number1's review is restored.")).toBeVisible()
      await expect(rowOf(page, 1)).toBeVisible()
      expect(last()).toMatchObject({ method: 'POST', action: 'restore', id: reviewId(1) })
    })

    test('restores a deleted review from the Include deleted view', async ({ page }) => {
      await open(page, role)
      await page.getByText('Include deleted', { exact: true }).click()
      await expect(rowOf(page, 3)).toContainText('Deleted')
      expect(reviews.adminQueries[reviews.adminQueries.length - 1].get('includeDeleted')).toBe('true')
      await rowOf(page, 3).getByRole('button', { name: "Restore Reviewer Number3's review" }).click()
      await expect(toast(page, "Reviewer Number3's review is restored.")).toBeVisible()
      await expect(rowOf(page, 3)).toContainText('Published')
      expect(last()).toMatchObject({ action: 'restore', id: reviewId(3) })
    })
  })
}

test('a failed list shows what happened and Retry loads it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  await mockStaffMe(page, 'staff')
  reviews = await mockReviews(page, { admin: [apiReview(1)] })
  let failed = false
  reviews.on.adminList = () => (failed ? undefined : ((failed = true), { status: 500, json: { statusCode: 500, message: 'boom' } }))
  await page.goto(`/login?next=${encodeURIComponent('/staff/reviews')}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: "We couldn't load the reviews." })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(rowOf(page, 1)).toBeVisible()
})

test('a failed reply keeps the dialog and the text', async ({ page }) => {
  await open(page, 'staff')
  reviews.on.moderate = () => ({ status: 500, json: { statusCode: 500, message: 'boom' } })
  await rowOf(page, 1).getByRole('button', { name: "Reply to Reviewer Number1's review" }).click()
  const dialog = page.getByRole('dialog', { name: 'Reply to review' })
  await dialog.getByRole('textbox', { name: 'Your reply' }).fill('Hello')
  await dialog.getByRole('button', { name: 'Post reply' }).click()
  await expect(dialog.getByRole('alert')).toContainText("We couldn't post the reply.")
  await expect(dialog.getByRole('textbox', { name: 'Your reply' })).toHaveValue('Hello')
})
