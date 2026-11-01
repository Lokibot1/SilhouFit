import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SizeSheet } from '../../src/components/staff/measurements/SizeSheet'
import { MEASUREMENT_KEYS } from '../../src/service/fetchProductList'
import type { SizeMeasurement } from '../../src/service/sizeMeasurements'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

const none = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null]))
const has = (name: string) => screen.queryByRole('textbox', { name }) !== null

describe('SizeSheet measurements by category', () => {
  it('asks only for what applies to the category', () => {
    render(<SizeSheet category="Pants" onSaved={vi.fn()} onClose={vi.fn()} />)
    for (const name of ['Waist width', 'Hip width', 'Inseam', 'Thigh', 'Total length']) expect(has(name)).toBe(true)
    for (const name of ['Sleeve length', 'Chest width', 'Shoulder width', 'Neck']) expect(has(name)).toBe(false)
  })

  it('changes the boxes with the category and drops what was typed in a box that goes away', async () => {
    const user = userEvent.setup()
    render(<SizeSheet category="Hoodie" onSaved={vi.fn()} onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Sleeve length' }), '60')
    await user.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Category' }))
    await user.click(await screen.findByRole('option', { name: 'Pants' }))
    await waitFor(() => expect(has('Inseam')).toBe(true))
    expect(has('Sleeve length')).toBe(false)
    await user.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Category' }))
    await user.click(await screen.findByRole('option', { name: 'Hoodie' }))
    expect(screen.getByRole('textbox', { name: 'Sleeve length' })).toHaveValue('')
  })

  it('keeps a measurement the row already has, even if its category does not use it', () => {
    const row = { id: 'r1', category: 'Pants', size: '32', ...none, sleeveLengthCm: 60, isActive: true, createdAt: '', updatedAt: '' } as SizeMeasurement
    render(<SizeSheet row={row} category="Pants" onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(has('Sleeve length')).toBe(true)
    expect(has('Chest width')).toBe(false)
  })
})
