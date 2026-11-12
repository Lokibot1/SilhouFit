import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as service from '../../src/service/orderReviews'

const NOW = { delayMs: 0 }
const photo = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' })
const video = (name = 'a.mp4') => new File(['x'], name, { type: 'video/mp4' })
const input = (over: Partial<service.ReviewInput> = {}): service.ReviewInput => ({ rating: 4, text: 'Fits very well, fast delivery.', files: [], ...over })

const revoke = vi.fn()
let counter = 0
beforeEach(() => {
  localStorage.clear()
  revoke.mockClear()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:test/${++counter}`, revokeObjectURL: revoke }))
  service.setOrderReviews([])
})

describe('order reviews', () => {
  it('creates, reads, updates and deletes a review', async () => {
    expect(await service.getOrderReview('o1', NOW)).toBeNull()
    const created = await service.createOrderReview('o1', input({ files: [photo()] }), NOW)
    expect(created.media).toHaveLength(1)
    expect(created.createdAt).toBe(created.updatedAt)
    expect(await service.getOrderReview('o1', NOW)).toEqual(created)
    expect(service.mediaUrl(created.media[0].id)).toMatch(/^blob:/)

    const saved = await service.updateOrderReview('o1', input({ rating: 2, text: 'Changed my mind about it.', keepIds: [created.media[0].id], files: [video()] }), NOW)
    expect(saved).toMatchObject({ rating: 2, text: 'Changed my mind about it.', createdAt: created.createdAt })
    expect(saved.media.map((m) => m.kind)).toEqual(['photo', 'video'])

    await service.deleteOrderReview('o1', NOW)
    expect(await service.getOrderReview('o1', NOW)).toBeNull()
  })

  it('keeps only metadata in storage, never the bytes or the object URL', async () => {
    const created = await service.createOrderReview('o1', input({ files: [photo()] }), NOW)
    const stored = localStorage.getItem(service.ORDER_REVIEWS_KEY)!
    expect(stored).not.toContain('blob:')
    expect(JSON.parse(stored)[0].media[0]).toEqual({ id: created.media[0].id, kind: 'photo', name: 'a.jpg', type: 'image/jpeg', size: 1 })
  })

  it('refuses a second review for one order', async () => {
    await service.createOrderReview('o1', input(), NOW)
    await expect(service.createOrderReview('o1', input(), NOW)).rejects.toMatchObject({ kind: 'conflict' })
  })

  it('checks the rules again where it saves, naming the field', async () => {
    await expect(service.createOrderReview('o1', input({ rating: 0 }), NOW)).rejects.toMatchObject({ kind: 'validation', field: 'rating' })
    await expect(service.createOrderReview('o1', input({ text: 'short' }), NOW)).rejects.toMatchObject({ kind: 'validation', field: 'text' })
    await expect(service.createOrderReview('o1', input({ files: [new File(['x'], 'a.gif', { type: 'image/gif' })] }), NOW)).rejects.toMatchObject({ kind: 'validation', field: 'media' })
    expect(await service.getOrderReview('o1', NOW)).toBeNull()
  })

  it('revokes the object URLs of removed media on update and of all media on delete', async () => {
    const created = await service.createOrderReview('o1', input({ files: [photo('a.jpg'), photo('b.jpg')] }), NOW)
    const [a, b] = created.media
    await service.updateOrderReview('o1', input({ keepIds: [b.id] }), NOW)
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(service.mediaUrl(a.id)).toBeUndefined()
    await service.deleteOrderReview('o1', NOW)
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(service.mediaUrl(b.id)).toBeUndefined()
  })

  it('reads corrupt storage as no reviews and drops bad rows', async () => {
    vi.resetModules()
    localStorage.setItem(service.ORDER_REVIEWS_KEY, '{not json')
    expect(await (await import('../../src/service/orderReviews')).getOrderReview('o1', NOW)).toBeNull()

    vi.resetModules()
    const good = { orderId: 'o1', rating: 5, text: 'Great', media: [], createdAt: 'x', updatedAt: 'x' }
    localStorage.setItem(service.ORDER_REVIEWS_KEY, JSON.stringify([good, { orderId: 'o2', rating: 9, text: 'bad' }, null]))
    const fresh = await import('../../src/service/orderReviews')
    expect(await fresh.getOrderReview('o1', NOW)).toMatchObject({ rating: 5 })
    expect(await fresh.getOrderReview('o2', NOW)).toBeNull()
  })

  it('tells subscribers about a change in this tab and in another tab', async () => {
    const listener = vi.fn()
    const stop = service.subscribeOrderReviews(listener)
    await service.createOrderReview('o1', input(), NOW)
    expect(listener).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: service.ORDER_REVIEWS_KEY }))
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    await service.deleteOrderReview('o1', NOW)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
