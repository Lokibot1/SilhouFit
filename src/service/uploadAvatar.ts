import { getSupabase } from './supabase'

export type AvatarUploadErrorKind = 'unauthorized' | 'invalid' | 'rate-limit' | 'network' | 'server'

export class AvatarUploadError extends Error {
  kind: AvatarUploadErrorKind

  constructor(kind: AvatarUploadErrorKind) {
    super(`The avatar upload failed (${kind}).`)
    this.kind = kind
  }
}

const AVATAR_BUCKET = 'avatars'
export const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const UPLOAD_KIND: Record<number, AvatarUploadErrorKind> = { 400: 'invalid', 413: 'invalid', 415: 'invalid', 401: 'unauthorized', 403: 'invalid', 429: 'rate-limit' }

/**
 * Uploads a profile photo to the Supabase `avatars` bucket (or another image `bucket`, like `reviews`) under the user's own folder and
 * answers with its public URL, which is what PATCH /users/me takes as avatarUrl. Sent with XHR because fetch cannot report upload progress.
 */
export async function uploadAvatar(file: File, userId: string, onProgress: (percent: number) => void, signal?: AbortSignal, bucket = AVATAR_BUCKET): Promise<string> {
  let supabase: Awaited<ReturnType<typeof getSupabase>>
  let token: string | undefined
  try {
    supabase = await getSupabase()
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    throw new AvatarUploadError('server')
  }
  signal?.throwIfAborted()
  if (!token) throw new AvatarUploadError('unauthorized')
  const path = `${userId}/${crypto.randomUUID()}.${AVATAR_TYPES[file.type] ?? 'jpg'}`
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', anon)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      // Storage answers a policy rejection as HTTP 400 and puts the real code (403) in the body, so read that first.
      let status = xhr.status
      try {
        status = Number((JSON.parse(xhr.responseText) as { statusCode?: string | number }).statusCode) || status
      } catch {
        // Not JSON; the HTTP status stands.
      }
      reject(new AvatarUploadError(UPLOAD_KIND[status] ?? 'server'))
    }
    xhr.onerror = () => reject(new AvatarUploadError('network'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
  onProgress(100)
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/**
 * Deletes a photo this user uploaded earlier, so replaced and abandoned uploads don't pile up in the bucket. Best effort: a
 * failure only leaves an unused file behind, so it is swallowed. URLs outside the user's own folder are ignored.
 */
export async function deleteAvatar(url: string, userId: string, bucket = AVATAR_BUCKET): Promise<void> {
  const marker = `/${bucket}/${userId}/`
  const at = url.indexOf(marker)
  if (at === -1) return
  const path = url.slice(at + bucket.length + 2).split('?')[0]
  try {
    const supabase = await getSupabase()
    await supabase.storage.from(bucket).remove([path])
  } catch {
    // The file stays in the bucket; nothing the user can act on.
  }
}
