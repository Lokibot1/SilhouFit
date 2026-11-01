import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VariantSheet } from '../../src/components/staff/inventory/VariantSheet'
import { ProductListError, type Measurements, type ProductVariant } from '../../src/service/fetchProductList'
import { createVariant, saveVariant, uploadImage } from '../../src/service/inventoryActions'
import { fetchCategoryMeasurements, type SizeMeasurement } from '../../src/service/sizeMeasurements'

vi.mock('../../src/service/inventoryActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/inventoryActions')>()),
  createVariant: vi.fn(),
  saveVariant: vi.fn(),
  uploadImage: vi.fn(),
}))

vi.mock('../../src/service/sizeMeasurements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/sizeMeasurements')>()),
  fetchCategoryMeasurements: vi.fn(),
}))

const NONE: Measurements = { chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, totalLengthCm: null, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null }
const baseRow = (size: string, values: Partial<Measurements>): SizeMeasurement => ({ id: `h-${size}`, category: 'Hoodie', size, ...NONE, ...values, isActive: true, createdAt: '', updatedAt: '' })
const HOODIE_BASE = [baseRow('M', { chestWidthCm: 55, totalLengthCm: 70, shoulderWidthCm: 48, sleeveLengthCm: 62, neckCm: 38 }), baseRow('L', { chestWidthCm: 58 })]

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
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchCategoryMeasurements).mockResolvedValue([])
})

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

describe('VariantSheet measurements by category', () => {
  const has = (sheet: HTMLElement, name: string) => within(sheet).queryByRole('textbox', { name }) !== null

  it('asks only for the measurements that apply to the category', () => {
    const { sheet } = setup({ category: 'Pants' })
    for (const name of ['Waist width', 'Hip width', 'Inseam', 'Thigh', 'Total length']) expect(has(sheet, name)).toBe(true)
    for (const name of ['Sleeve length', 'Chest width', 'Shoulder width', 'Neck']) expect(has(sheet, name)).toBe(false)
  })

  it('leaves out inseam and thigh for a hoodie', () => {
    const { sheet } = setup({ category: 'Hoodie' })
    expect(has(sheet, 'Sleeve length')).toBe(true)
    expect(has(sheet, 'Inseam')).toBe(false)
    expect(has(sheet, 'Thigh')).toBe(false)
  })

  it('keeps a measurement the variant already has, even if the category does not use it', () => {
    const { sheet } = setup({ mode: 'edit', category: 'Pants', variant: { ...VARIANT, measurements: { ...Object.fromEntries(['chestWidthCm', 'waistWidthCm', 'hipWidthCm', 'totalLengthCm', 'inseamCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm', 'thighCm'].map((k) => [k, null])), sleeveLengthCm: 60 } as ProductVariant['measurements'] } })
    expect(has(sheet, 'Sleeve length')).toBe(true)
    expect(has(sheet, 'Chest width')).toBe(false)
  })

  it('shows all nine when the category is not known', () => {
    const { sheet } = setup()
    expect(has(sheet, 'Sleeve length')).toBe(true)
    expect(has(sheet, 'Inseam')).toBe(true)
  })
})

describe('VariantSheet inherit base measurements', () => {
  const box = (sheet: HTMLElement) => within(sheet).getByRole('checkbox', { name: 'Inherit base measurements' })
  const fillBasics = async (user: ReturnType<typeof userEvent.setup>, sheet: HTMLElement, size: string) => {
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), size)
    await user.type(within(sheet).getByRole('textbox', { name: /^Price/ }), '10')
  }

  beforeEach(() => vi.mocked(fetchCategoryMeasurements).mockResolvedValue(HOODIE_BASE))

  it('is on by default for a size with a base row, shows the values read-only and sends them', async () => {
    const user = userEvent.setup()
    vi.mocked(createVariant).mockResolvedValue(VARIANT)
    const { sheet } = setup({ category: 'Hoodie' })
    await fillBasics(user, sheet, 'M')
    await waitFor(() => expect(box(sheet)).toBeChecked())
    expect(fetchCategoryMeasurements).toHaveBeenCalledTimes(1)
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toBeDisabled()
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toHaveValue('55')
    expect(within(sheet).getByText('Copied from Hoodie M in Base measurements.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    await waitFor(() => expect(createVariant).toHaveBeenCalled())
    expect(createVariant).toHaveBeenCalledWith('p1', expect.objectContaining({ measurements: { chestWidthCm: 55, totalLengthCm: 70, shoulderWidthCm: 48, sleeveLengthCm: 62, neckCm: 38 } }), expect.anything())
  })

  it('re-resolves the values when the size changes while on', async () => {
    const user = userEvent.setup()
    const { sheet } = setup({ category: 'Hoodie' })
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    await waitFor(() => expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toHaveValue('55'))
    await user.clear(within(sheet).getByRole('textbox', { name: /^Size/ }))
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'L')
    expect(box(sheet)).toBeChecked()
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toHaveValue('58')
    expect(within(sheet).getByRole('textbox', { name: /^Neck/ })).toHaveValue('')
  })

  it('off makes the boxes editable, started from the base values, and sends what was typed', async () => {
    const user = userEvent.setup()
    vi.mocked(createVariant).mockResolvedValue(VARIANT)
    const { sheet } = setup({ category: 'Hoodie' })
    await fillBasics(user, sheet, 'M')
    await waitFor(() => expect(box(sheet)).toBeChecked())
    await user.click(box(sheet))
    const chest = within(sheet).getByRole('textbox', { name: /^Chest width/ })
    expect(chest).toBeEnabled()
    expect(chest).toHaveValue('55')
    await user.clear(chest)
    await user.type(chest, '60')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    await waitFor(() => expect(createVariant).toHaveBeenCalled())
    expect(createVariant).toHaveBeenCalledWith('p1', expect.objectContaining({ measurements: expect.objectContaining({ chestWidthCm: 60, neckCm: 38 }) }), expect.anything())
  })

  it('is disabled with a hint when the size has no base row, and manual entry still works', async () => {
    const user = userEvent.setup()
    vi.mocked(createVariant).mockResolvedValue(VARIANT)
    const { sheet } = setup({ category: 'Hoodie' })
    await fillBasics(user, sheet, 'XXL')
    expect(await within(sheet).findByText('No base measurements for Hoodie XXL yet')).toBeInTheDocument()
    expect(box(sheet)).toBeDisabled()
    expect(box(sheet)).not.toBeChecked()
    await user.type(within(sheet).getByRole('textbox', { name: /^Chest width/ }), '50')
    await user.click(within(sheet).getByRole('button', { name: 'Add variant' }))
    await waitFor(() => expect(createVariant).toHaveBeenCalled())
    expect(createVariant).toHaveBeenCalledWith('p1', expect.objectContaining({ measurements: { chestWidthCm: 50 } }), expect.anything())
  })

  it('opens off for a variant that has measurements of its own, and keeps them', async () => {
    const own = { ...NONE, chestWidthCm: 99 }
    const { sheet } = setup({ mode: 'edit', category: 'Hoodie', variant: { ...VARIANT, measurements: own } })
    await waitFor(() => expect(box(sheet)).toBeEnabled())
    expect(box(sheet)).not.toBeChecked()
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toHaveValue('99')
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toBeEnabled()
  })

  it('is unavailable, not broken, when the base measurements fail to load', async () => {
    vi.mocked(fetchCategoryMeasurements).mockRejectedValueOnce(new ProductListError('server'))
    const user = userEvent.setup()
    const { sheet } = setup({ category: 'Hoodie' })
    await user.type(within(sheet).getByRole('textbox', { name: /^Size/ }), 'M')
    expect(await within(sheet).findByText("Base measurements couldn't load. Enter them by hand.")).toBeInTheDocument()
    expect(box(sheet)).toBeDisabled()
    expect(within(sheet).getByRole('textbox', { name: /^Chest width/ })).toBeEnabled()
  })

  it('shows no checkbox and fetches nothing without a category', () => {
    const { sheet } = setup()
    expect(within(sheet).queryByRole('checkbox', { name: 'Inherit base measurements' })).not.toBeInTheDocument()
    expect(fetchCategoryMeasurements).not.toHaveBeenCalled()
  })
})
