export interface RequestOptions {
  signal?: AbortSignal
  delayMs?: number
}

// Shared by the sign-up stubs: resolves after a delay, rejects on `shouldFail`, honours abort.
export function simulateRequest(
  delayMs: number,
  signal: AbortSignal | undefined,
  shouldFail: () => boolean,
): Promise<{ ok: true }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      if (shouldFail()) {
        reject(new Error('network'))
        return
      }
      resolve({ ok: true })
    }, delayMs)

    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
