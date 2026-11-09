import { useState } from 'react'
import { useToast } from '../components/toast/useToast'
import { endSession } from './useOrders'
import { cancelOrder, OrdersError, type CustomerOrder } from '../service/ordersApi'

const FAILURE: Partial<Record<OrdersError['kind'], string>> = {
  network: "The order wasn't cancelled because the connection dropped. Check your connection, then try again.",
  'rate-limit': "The order wasn't cancelled because our servers are limiting requests. Wait a minute, then try again.",
}

/**
 * The cancel flow shared by the list and the order page: which order is being asked about, the request, and what to say
 * when it fails. `onChanged` gets the updated order, or null when the order moved on (or is gone) and must be read again.
 */
export function useCancelOrder(onChanged: (order: CustomerOrder | null) => void) {
  const toast = useToast()
  const [target, setTarget] = useState<CustomerOrder | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open(order: CustomerOrder) {
    setError(null)
    setTarget(order)
  }

  function close() {
    if (!pending) setTarget(null)
  }

  async function confirm(reason: string) {
    if (!target || pending) return
    setPending(true)
    setError(null)
    try {
      const updated = await cancelOrder(target.id, reason || undefined)
      setTarget(null)
      toast.show({ kind: 'success', message: `Order ${updated.orderNumber} cancelled. You can buy the items again from your orders.` })
      onChanged(updated)
    } catch (failure) {
      const kind = failure instanceof OrdersError ? failure.kind : 'server'
      if (kind === 'forbidden') {
        setTarget(null)
        endSession()
      } else if (kind === 'not-cancellable' || kind === 'not-found') {
        setTarget(null)
        toast.show({ kind: 'info', message: kind === 'not-found' ? "That order isn't on your account any more." : "This order has already moved on and can't be cancelled." })
        onChanged(null)
      } else {
        setError(FAILURE[kind] ?? "The order wasn't cancelled because something went wrong on our side. Try again in a moment.")
      }
    } finally {
      setPending(false)
    }
  }

  return { target, pending, error, open, close, confirm }
}
