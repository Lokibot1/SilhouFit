import type { RequestOptions } from './simulateRequest'

const TIMEOUT_MS = 8000

/**
 * Feature: System – Health check
 * GET /. Public, no token. Resolves true when the API answers with a 2xx and false when it does not answer in time, drops the connection or answers with an error.
 * An abort by the caller rejects.
 */
export async function checkHealth({ signal }: RequestOptions = {}): Promise<boolean> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/`, { signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal })
    return response.ok
  } catch (error) {
    if (signal?.aborted) throw error
    return false
  } finally {
    clearTimeout(timer)
  }
}
