import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAT_MAX_BYTES, checkChatFile, compressImage } from '../../src/utils/chatAttachments'

const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type })

describe('checkChatFile', () => {
  it.each([
    ['a.jpg', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.gif', 'image/gif'],
    ['a.avif', 'image/avif'],
    ['a.mp4', 'video/mp4'],
    ['a.webm', 'video/webm'],
    ['a.MOV', 'video/quicktime'],
  ])('accepts %s', (name, type) => expect(checkChatFile(file(name, type), 0)).toBeNull())

  it('refuses a type or an extension off the whitelist, naming the file and the next step', () => {
    expect(checkChatFile(file('a.pdf', 'application/pdf'), 0)).toMatch(/a\.pdf wasn't added.*Only JPG.*choose a different file/)
    expect(checkChatFile(file('a.exe', 'image/png'), 0)).not.toBeNull()
    expect(checkChatFile(file('a.png', 'application/pdf'), 0)).not.toBeNull()
  })

  it('refuses a file over 25 MB, and accepts exactly 25 MB', () => {
    expect(checkChatFile({ name: 'big.mp4', type: 'video/mp4', size: CHAT_MAX_BYTES + 1 }, 0)).toMatch(/limit is 25 MB/)
    expect(checkChatFile({ name: 'ok.mp4', type: 'video/mp4', size: CHAT_MAX_BYTES }, 0)).toBeNull()
  })

  it('refuses a sixth file', () => {
    expect(checkChatFile(file('a.png', 'image/png'), 4)).toBeNull()
    expect(checkChatFile(file('a.png', 'image/png'), 5)).toMatch(/5 files at most/)
  })
})

describe('compressImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  const big = () => file('photo.png', 'image/png', 2 * 1024 * 1024)

  function stubCanvas(blobSize: number, bitmap = { width: 4000, height: 2000 }) {
    const draw = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ ...bitmap, close: vi.fn() })))
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: draw }), toBlob: (cb: (b: Blob) => void) => cb(new Blob([new Uint8Array(blobSize)], { type: 'image/webp' })) }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
    return { canvas, draw }
  }

  it('scales to 2048px on the long edge and re-encodes as WebP', async () => {
    const { canvas } = stubCanvas(1000)
    const out = await compressImage(big())
    expect([canvas.width, canvas.height]).toEqual([2048, 1024])
    expect(out.type).toBe('image/webp')
    expect(out.name).toBe('photo.webp')
  })

  it('keeps the original when the result is not smaller', async () => {
    stubCanvas(3 * 1024 * 1024)
    const original = big()
    expect(await compressImage(original)).toBe(original)
  })

  it('passes through small images, GIF, AVIF and video untouched', async () => {
    const spy = vi.fn()
    vi.stubGlobal('createImageBitmap', spy)
    for (const f of [file('a.png', 'image/png', 500), file('a.gif', 'image/gif', 2e6), file('a.avif', 'image/avif', 2e6), file('a.mp4', 'video/mp4', 2e6)]) expect(await compressImage(f)).toBe(f)
    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps the original when createImageBitmap is missing or throws', async () => {
    const original = big()
    vi.stubGlobal('createImageBitmap', undefined)
    expect(await compressImage(original)).toBe(original)
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')))
    expect(await compressImage(original)).toBe(original)
  })
})
