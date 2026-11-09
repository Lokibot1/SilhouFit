import { useCallback, useEffect, useRef, useState } from 'react'
import { UUID } from '../service/fetchProductList'
import { setLoginNotice } from '../service/loginNotice'
import { signOut } from '../service/signOut'
import { fetchOrder, getCachedOrder, getCachedOrders, loadAllOrders, onOrdersChanged, OrdersError, type CustomerOrder } from '../service/ordersApi'

const QUIET_REFETCH_MS = 30_000

const isAbort = (failure: unknown) => failure instanceof DOMException && failure.name === 'AbortError'
const asError = (failure: unknown) => (failure instanceof OrdersError ? failure : new OrdersError('server'))

/** The token was refused: end the session so the page's guard sends the shopper to sign in, back to where they were, with a notice. */
export function endSession() {
  setLoginNotice('session-ended')
  signOut()
}

/** Every order of the signed-in shopper. A failed reload keeps the orders already shown. */
export function useOrders(enabled = true) {
  const cached = enabled ? getCachedOrders() : null
  const [orders, setOrders] = useState<CustomerOrder[]>(cached ?? [])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(cached ? 'ready' : 'loading')
  const [error, setError] = useState<OrdersError | null>(null)
  const controller = useRef<AbortController | null>(null)

  const load = useCallback((force: boolean) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    loadAllOrders({ signal: abort.signal, force }).then(
      (list) => {
        setOrders(list)
        setError(null)
        setStatus('ready')
      },
      (failure: unknown) => {
        if (isAbort(failure)) return
        const problem = asError(failure)
        if (problem.kind === 'forbidden') return endSession()
        setError(problem)
        setStatus('error')
      },
    )
  }, [])

  useEffect(() => {
    if (!enabled) return
    // The state follows the shared cache: a page opened with nothing cached starts from the skeleton.
    load(false)
    const unsubscribe = onOrdersChanged(() => load(true))
    return () => {
      unsubscribe()
      controller.current?.abort()
    }
  }, [enabled, load])

  const retry = useCallback(() => {
    setStatus('loading')
    load(true)
  }, [load])

  /** Reads the orders again without the skeleton. */
  const refresh = useCallback(() => load(true), [load])

  return { status, orders, error, retry, refresh }
}

/** One order. It paints from the cached list at once, then reads the server's copy; coming back to the tab refreshes it (at most every 30 seconds). */
export function useOrder(id: string, signedIn = true) {
  // An id that is not an id cannot be an order: no request goes out.
  const valid = UUID.test(id)
  const enabled = signedIn && valid
  const cached = enabled ? getCachedOrder(id) : null
  const [order, setOrder] = useState<CustomerOrder | null>(cached)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'not-found'>(cached ? 'ready' : valid ? 'loading' : 'not-found')
  const [error, setError] = useState<OrdersError | null>(null)
  const controller = useRef<AbortController | null>(null)
  const lastRead = useRef(0)

  const load = useCallback(
    (quiet: boolean) => {
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      lastRead.current = Date.now()
      fetchOrder(id, { signal: abort.signal }).then(
        (next) => {
          setOrder(next)
          setError(null)
          setStatus('ready')
        },
        (failure: unknown) => {
          if (isAbort(failure)) return
          const problem = asError(failure)
          if (problem.kind === 'forbidden') {
            endSession()
          } else if (problem.kind === 'not-found') {
            setOrder(null)
            setStatus('not-found')
          } else if (!quiet) {
            // A failed quiet refresh keeps the order on screen.
            setError(problem)
            setStatus('error')
          }
        },
      )
    },
    [id],
  )

  useEffect(() => {
    if (!enabled) return
    load(Boolean(getCachedOrder(id)))
    const unsubscribe = onOrdersChanged(() => load(true))
    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRead.current > QUIET_REFETCH_MS) load(true)
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      controller.current?.abort()
    }
  }, [enabled, id, load])

  const retry = useCallback(() => {
    setStatus('loading')
    load(false)
  }, [load])

  /** Puts an order the caller already holds on screen (the answer to a cancel). */
  const update = useCallback((next: CustomerOrder) => {
    setOrder(next)
    setStatus('ready')
  }, [])

  const refresh = useCallback(() => load(true), [load])

  return { status, order, error, retry, refresh, update }
}
