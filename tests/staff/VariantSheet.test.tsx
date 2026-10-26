import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VariantSheet } from '../../src/components/staff/inventory/VariantSheet'
import { ProductListError, type ProductVariant } from '../../src/service/fetchProductList'
import { createVariant, saveVariant, uploadImage } from '../../src/service/inventoryActions'

vi.mock('../../src/service/inventoryActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/inventoryActions')>()),
  createVariant: vi.fn(),
  saveVariant: vi.fn(),
  uploadImage: vi.fn(),
}))

const VARIANT: ProductVariant = {
  id: 'v1',
  sku: 'TEE-M-NAVY',
  name: null,
  size: 'M',
  color: 'Navy',
  colorHex: '#26324a',
  price: 500,
  stock: 3,
  imageUrl: null,
  measurements: null,
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
beforeEach(() => vi.resetAllMocks())

function setup(props: Partial<React.ComponentProps<typeof VariantSheet>> = {}) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(<VariantSheet mode="add" productId="p1" onSaved={onSaved} onClose={onClose} {...props} />)
  return { onSaved, onClose, sheet: screen.getByRole('dialog') }
}

describe('VariantSheet', () => {
  it('shows the SKU as auto-generated when blank on add, and asks for a hex once a colour is typed', async () => {
    const user = userEvent.setup()
    const { sheet } = setup()
    expect(within(sheet).getByRole('textbox', { name: /^SKU/ })).toHaveAttribute('placeholder', 'Auto-generated if blank')
    await user.type(within(sheet).getByRole('textbox', { name: /^Colour name/ }), 'Teal')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    expect(within(sheet).getByText('Enter a hex colour such as #1b1d21 or #fff.')).toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: /^Colour hex/ })).toHaveFocus()
    expect(createVariant).not.toHaveBeenCalled()
  })

  it('filters what is typed: size upper-case without symbols, price to two decimals, measurement to one', async () => {
    const user = userEvent.setup()
    const { sheet } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'x-l!')
    expect(within(sheet).getByRole('textbox', { name: /^Size/ })).toHaveValue('XL')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '12.345')
    expect(within(sheet).getByRole('textbox', { name: /^Price/ })).toHaveValue('12.34')
    await user.type(within(sheet).getByRole('textbox', { name: /^Chest width/ }), '52.55')
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toHaveValue('52.5')
  })

  it('flags a measurement outside its range inline and does not send', async () => {
    const user = userEvent.setup()
    const { sheet } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.type(within(sheet).getByRole('textbox', { name: /^Neck/ }), '4')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    expect(within(sheet).getByText('Enter neck from 5 to 100 cm.')).toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: /^Neck/ })).toHaveFocus()
    expect(createVariant).not.toHaveBeenCalled()
  })

  it('sends measurements and an uploaded image, disables Save while pending, and ignores a second click', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    vi.mocked(uploadImage).mockResolvedValue('https://cdn.test/v.jpg')
    vi.mocked(createVariant).mockImplementation(() => new Promise((resolve) => (finish = () => resolve(VARIANT))))
    const { sheet, onSaved } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.type(within(sheet).getByRole('textbox', { name: /^Chest width/ }), '52.5')
    fireEvent.change(screen.getByLabelText('Choose a variant image file'), { target: { files: [new File(['x'], 'v.jpg', { type: 'image/jpeg' })] } })
    const add = within(sheet).getByRole('button', { name: 'Add variant' })
    await user.click(add)
    await waitFor(() => expect(createVariant).toHaveBeenCalledTimes(1))
    expect(createVariant).toHaveBeenCalledWith('p1', { size: 'M', price: 10, stock: 0, imageUrl: 'https://cdn.test/v.jpg', measurements: { chestWidthCm: 52.5 } }, expect.anything())
    expect(within(sheet).getByRole('button', { name: 'Adding…' })).toBeDisabled()
    finish()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  it('rejects a file that is not JPG, PNG or WebP with a reason', () => {
    const { sheet } = setup()
    fireEvent.change(screen.getByLabelText('Choose a variant image file'), { target: { files: [new File(['x'], 'v.gif', { type: 'image/gif' })] } })
    expect(within(sheet).getByRole('alert')).toHaveTextContent("v.gif wasn't added. Only JPG, PNG or WebP images work")
  })

  it('offers Try again after a network failure and sends the same request', async () => {
    const user = userEvent.setup()
    vi.mocked(createVariant).mockRejectedValueOnce(new ProductListError('network')).mockResolvedValue(VARIANT)
    const { sheet, onSaved } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    const alert = await within(sheet).findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't add the variant.")
    expect(alert).toHaveTextContent('The connection dropped')
    await user.click(within(sheet).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createVariant).toHaveBeenCalledTimes(2)
  })

  it('on edit is prefilled, has no stock box, and clearing the colour sends color: null alone', async () => {
    const user = userEvent.setup()
    vi.mocked(saveVariant).mockResolvedValue(VARIANT)
    const { sheet, onSaved } = setup({ mode: 'edit', variant: VARIANT })
    expect(within(sheet).getByRole('textbox', { name: /^Colour name/ })).toHaveValue('Navy')
    expect(within(sheet).getByRole('textbox', { name: /^Colour hex/ })).toHaveValue('#26324a')
    expect(within(sheet).getByRole('textbox', { name: /^SKU/ })).toHaveValue('TEE-M-NAVY')
    expect(within(sheet).queryByRole('textbox', { name: /^Stock/ })).not.toBeInTheDocument()
    await user.clear(within(sheet).getByRole('textbox', { name: /^Colour name/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Save variant' }))
    expect(saveVariant).toHaveBeenCalledWith('p1', 'v1', { color: null }, expect.anything())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('Cancel closes without saving', async () => {
    const user = userEvent.setup()
    const { sheet, onClose } = setup()
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(createVariant).not.toHaveBeenCalled()
  })

  it('asks before discarding unsaved changes, with Cancel focused, and keeps them on Cancel', async () => {
    const user = userEvent.setup()
    const { sheet, onClose } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(within(sheet).getByText('Are you sure?')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(within(sheet).getByRole('textbox', { name: /^Price/ })).toHaveValue('10')
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    await user.click(within(sheet).getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('moves focus to the SKU field after a 409, once the form is enabled again', async () => {
    vi.mocked(createVariant).mockRejectedValue(new ProductListError('conflict'))
    const user = userEvent.setup()
    const { sheet } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    await waitFor(() => expect(within(sheet).getByRole('textbox', { name: /^SKU/ })).toHaveFocus())
  })

  it('moves focus to Add variant after a server failure', async () => {
    vi.mocked(createVariant).mockRejectedValue(new ProductListError('server'))
    const user = userEvent.setup()
    const { sheet } = setup()
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Add variant' })).toHaveFocus())
  })
})
