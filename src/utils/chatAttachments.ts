import { UPLOAD_EXTENSIONS } from '../service/uploadAvatar'

export const CHAT_MAX_FILES = 5
export const CHAT_MAX_BYTES = 25 * 1024 * 1024
export const CHAT_ACCEPT = Object.keys(UPLOAD_EXTENSIONS).join(',') + ',.jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.webm,.mov'
const EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$/i
const COMPRESS_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const COMPRESS_OVER_BYTES = 1024 * 1024
const MAX_EDGE = 2048
const WEBP_QUALITY = 0.85

/** Why a chosen file can't be attached, or null. `count` is how many are already attached. The server checks again. */
export function checkChatFile(file: { name: string; type: string; size: number }, count: number): string | null {
  if (count >= CHAT_MAX_FILES) return `${file.name} wasn't added. A message holds ${CHAT_MAX_FILES} files at most, so remove one or send this in a new message.`
  if (!UPLOAD_EXTENSIONS[file.type] || !EXTENSIONS.test(file.name))
    return `${file.name} wasn't added. Only JPG, PNG, WebP, GIF, AVIF, MP4, WebM or MOV files work, so choose a different file.`
  if (file.size > CHAT_MAX_BYTES)
    return `${file.name} wasn't added. It is ${(file.size / 1024 / 1024).toFixed(1)} MB and the limit is 25 MB, so choose a smaller file or compress it.`
  return null
}

/** A JPEG, PNG or WebP over 1 MB, scaled to 2048px on its long edge and saved as WebP; anything else, or a result that is not smaller, comes back unchanged. */
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESS_TYPES.includes(file.type) || file.size <= COMPRESS_OVER_BYTES || typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY))
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
  } catch {
    return file
  }
}
