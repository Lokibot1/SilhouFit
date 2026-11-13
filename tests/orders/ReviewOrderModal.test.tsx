import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewOrderModal } from '../../src/components/orders/ReviewOrderModal'

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
    <ReviewOrderModal open productName="Heritage Polo" orderNumber="SHF-1" pending={false} progress={null} error={null} onClose={onClose} onSubmit={onSubmit} {...p} />
  )
  const view = render(ui(props))
  return { user, onSubmit, onClose, view, rerender: (p: Partial<Parameters<typeof ReviewOrderModal>[0]>) => view.rerender(ui({ ...props, ...p })) }
}
const upload = () => screen.getByLabelText('Choose photo files')

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
    expect(onSubmit).toHaveBeenCalledWith({ rating: 5, text: TEXT, keptImages: [], files: [file], orderItemId: undefined })
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
    expect(screen.getByRole('button', { name: 'Add photos' })).toHaveFocus()
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

  it('names the product in the title', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Review Heritage Polo' })).toBeInTheDocument()
  })

  it('opens an edit pre-filled with the saved review and hands back the photos kept', async () => {
    const images = [
      { id: 'i-1', url: 'https://img/a.jpg' },
      { id: 'i-2', url: 'https://img/b.jpg' },
    ]
    const { user, onSubmit } = setup({ initial: { rating: 3, text: TEXT, images } })
    expect(screen.getByRole('dialog', { name: 'Edit review: Heritage Polo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3 stars: Good' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Your review' })).toHaveValue(TEXT)
    expect(screen.getByAltText('Photo 1: Saved photo 1')).toHaveAttribute('src', 'https://img/a.jpg')
    await user.click(screen.getByRole('button', { name: 'Remove Saved photo 1' }))
    await user.click(screen.getByRole('button', { name: 'Save review' }))
    expect(onSubmit).toHaveBeenCalledWith({ rating: 3, text: TEXT, keptImages: [images[1]], files: [], orderItemId: undefined })
  })

  it('rejects a video and a sixth photo, with only photos mentioned', async () => {
    const { user } = setup()
    expect(screen.getByText(/Up to 5 photos \(JPG, PNG or WebP, 5 MB each\)\./)).toBeInTheDocument()
    await user.upload(upload(), new File(['x'], 'clip.mp4', { type: 'video/mp4' }))
    expect(screen.getByRole('alert')).toHaveTextContent("clip.mp4 wasn't added")
    await user.upload(upload(), [1, 2, 3, 4, 5, 6].map((n) => photo(`p${n}.jpg`)))
    expect(screen.getByRole('alert')).toHaveTextContent('5 photos at most')
    await user.click(screen.getByRole('radio', { name: '5 stars: Excellent' }))
    await user.type(screen.getByRole('textbox', { name: 'Your review' }), TEXT)
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(screen.queryByText(/5 photos at most/)).toBeNull()
  })

  it('offers the variants when the order has several, and sends the chosen order line', async () => {
    const variants = [
      { orderItemId: 'oi-1', label: 'Size M · Black' },
      { orderItemId: 'oi-2', label: 'Size L · Navy' },
    ]
    const { user, onSubmit } = setup({ variants })
    await user.click(screen.getByRole('radio', { name: 'Size L · Navy' }))
    await user.click(screen.getByRole('radio', { name: '5 stars: Excellent' }))
    await user.type(screen.getByRole('textbox', { name: 'Your review' }), TEXT)
    await user.click(screen.getByRole('button', { name: 'Post review' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ orderItemId: 'oi-2' }))
  })

  it('shows the upload progress with its percentage', () => {
    setup({ pending: true, progress: 40 })
    expect(screen.getByRole('progressbar', { name: 'Uploading photos' })).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('shows the photo name instead of a broken image', () => {
    setup({ initial: { rating: 3, text: TEXT, images: [{ id: 'i-1', url: 'https://img/gone.jpg' }] } })
    fireEvent.error(screen.getByAltText('Photo 1: Saved photo 1'))
    expect(screen.getByText('Photo could not load')).toBeInTheDocument()
  })

  it('shows a failure from the last try inside the dialog', () => {
    setup({ error: 'We could not save it.' })
    expect(screen.getByRole('alert')).toHaveTextContent('We could not save it.')
  })
})
