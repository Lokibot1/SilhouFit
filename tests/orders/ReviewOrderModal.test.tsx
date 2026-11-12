import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewOrderModal } from '../../src/components/orders/ReviewOrderModal'
import type { ReviewMedia } from '../../src/service/orderReviews'

const revoke = vi.fn()
let counter = 0
beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 })
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  revoke.mockClear()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:test/${++counter}`, revokeObjectURL: revoke }))
})

const TEXT = 'Fits very well, fast delivery.'
const photo = (name = 'look.jpg') => new File(['x'], name, { type: 'image/jpeg' })

function setup(props: Partial<Parameters<typeof ReviewOrderModal>[0]> = {}) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup({ delay: null, applyAccept: false })
  const ui = (p: Partial<Parameters<typeof ReviewOrderModal>[0]>) => (
    <ReviewOrderModal open orderNumber="SHF-1" pending={false} error={null} onClose={onClose} onSubmit={onSubmit} {...p} />
  )
  const view = render(ui(props))
  return { user, onSubmit, onClose, view, rerender: (p: Partial<Parameters<typeof ReviewOrderModal>[0]>) => view.rerender(ui({ ...props, ...p })) }
}
const upload = () => screen.getByLabelText('Choose photo and video files')

describe('ReviewOrderModal', () => {
  it('moves the rating with the arrow keys and shows a tooltip on keyboard focus', async () => {
    const { user } = setup()
    const group = screen.getByRole('group', { name: 'Your rating' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1 star: Poor' })).toHaveFocus() // the dialog opens on the rating
    await user.tab()
    await user.tab({ shift: true }) // back by keyboard, so the tooltip shows
    const star = document.activeElement as HTMLInputElement
    expect(star.type).toBe('radio')
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^\d stars?: /)
    await user.click(screen.getByRole('radio', { name: '2 stars: Fair' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '3 stars: Good' })).toBeChecked()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: '1 star: Poor' })).toBeChecked()
  })

  it('hovering previews a rating without choosing it', async () => {
    const { user } = setup()
    await user.hover(screen.getByRole('radio', { name: '4 stars: Very good' }).closest('label')!)
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })

  it('counts characters live and keeps emoji and line breaks', async () => {
    const { user } = setup()
    const box = screen.getByRole('textbox', { name: 'Your review' })
    await user.click(box)
    await user.paste('Nice 😍\n\n\n\nfit')
    expect(box).toHaveValue('Nice 😍\n\nfit')
    expect(screen.getByText('12/1000')).toBeInTheDocument()
  })

  it('shows the text error once the box is touched, and every error on submit with focus on the first', async () => {
    const { user, onSubmit } = setup()
    const box = screen.getByRole('textbox', { name: 'Your review' })
    expect(screen.queryByRole('alert')).toBeNull()
    await user.type(box, 'short')
    await user.tab()
    expect(await screen.findByText(/too short/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(screen.getByText('Choose 1 to 5 stars.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1 star: Poor' })).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('sends the rating, text and files when everything is valid', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('radio', { name: '5 stars: Excellent' }))
    await user.type(screen.getByRole('textbox', { name: 'Your review' }), TEXT)
    const file = photo()
    await user.upload(upload(), file)
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(onSubmit).toHaveBeenCalledWith({ rating: 5, text: TEXT, keepIds: [], files: [file] })
  })

  it('lists rejected files in an alert and keeps the good ones', async () => {
    const { user } = setup()
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' })
    await user.upload(upload(), [gif, photo()])
    expect(screen.getByRole('alert')).toHaveTextContent("a.gif wasn't added")
    expect(screen.getByAltText('Photo 1: look.jpg')).toBeInTheDocument()
  })

  it('removes a photo, revokes its URL and returns focus to the add button', async () => {
    const { user } = setup()
    await user.upload(upload(), photo())
    await user.click(screen.getByRole('button', { name: 'Remove look.jpg' }))
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(screen.queryByAltText('Photo 1: look.jpg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add photos or video' })).toHaveFocus()
  })

  it('lets go of unsaved previews when it closes', async () => {
    const { user, rerender } = setup()
    await user.upload(upload(), photo())
    rerender({ open: false })
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1))
  })

  it('disables submit and shows a spinner while pending, and cannot be closed', () => {
    setup({ pending: true })
    const post = screen.getByRole('button', { name: 'Post review' })
    expect(post).toBeDisabled()
    expect(post).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull()
  })

  it('opens an edit pre-filled with the saved review', () => {
    const media: ReviewMedia[] = [{ id: 'rm-1', kind: 'photo', name: 'saved.jpg', type: 'image/jpeg', size: 10 }]
    setup({ initial: { rating: 3, text: TEXT, media } })
    expect(screen.getByRole('dialog', { name: 'Edit review' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3 stars: Good' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Your review' })).toHaveValue(TEXT)
    expect(screen.getByText('Preview not kept in this demo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save review' })).toBeInTheDocument()
  })

  it('shows a failure from the last try inside the dialog', () => {
    setup({ error: 'We could not save it.' })
    expect(screen.getByRole('alert')).toHaveTextContent('We could not save it.')
  })
})
