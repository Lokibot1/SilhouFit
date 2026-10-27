import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCategoryMeasurements, createSizeMeasurement, fetchCategoryMeasurements, updateSizeMeasurement } from '../../src/service/sizeMeasurements'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const row = { id: 'r1', category: 'Hoodie', size: 'M', chestWidthCm: 55, isActive: true }
let fail = false
beforeEach(() => {
  fail = false
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (fail) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(!init?.method || init.method === 'GET' ? [row] : row), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  clearCategoryMeasurements()
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const gets = () => fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET').length

describe('fetchCategoryMeasurements', () => {
  it('asks once per category and shares the answer', async () => {
    await Promise.all([fetchCategoryMeasurements('Hoodie'), fetchCategoryMeasurements('Hoodie')])
    await fetchCategoryMeasurements('Hoodie')
    await fetchCategoryMeasurements('Pants')
    expect(gets()).toBe(2)
  })

  it('does not keep a failure, so the next opening tries again', async () => {
    fail = true
    await expect(fetchCategoryMeasurements('Hoodie')).rejects.toBeTruthy()
    await Promise.resolve()
    fail = false
    await expect(fetchCategoryMeasurements('Hoodie')).resolves.toHaveLength(1)
  })

  it('is refetched after a staff create or update (archive and restore go through update)', async () => {
    await fetchCategoryMeasurements('Hoodie')
    await createSizeMeasurement({ category: 'Hoodie', size: 'L', chestWidthCm: 58 })
    await fetchCategoryMeasurements('Hoodie')
    await updateSizeMeasurement('r1', { isActive: false })
    await fetchCategoryMeasurements('Hoodie')
    expect(gets()).toBe(3)
  })
})
