import { simulateRequest, type RequestOptions } from './simulateRequest'

export interface OrderPayload {
  items: { id: string; size: string; color: string; qty: number }[]
  fulfilment: 'delivery'
  payment: string
  address?: { fullName: string; phone: string; street: string; city: string; postal: string }
  note: string
  total: number
}

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** SF-yymmdd-XXXX, the stub's stand-in for the order number the backend will issue. */
function newOrderId(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const tail = Array.from({ length: 4 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('')
  return `SF-${date}-${tail}`
}

// Stand-in for the real endpoint; nothing is sent or stored. Dev-only failure: open /checkout?...&fail=order.
export async function placeOrder(
  _order: OrderPayload,
  { signal, delayMs = 1200 }: RequestOptions = {},
): Promise<{ orderId: string }> {
  await simulateRequest(delayMs, signal, () => import.meta.env.DEV && new URLSearchParams(location.search).get('fail') === 'order')
  return { orderId: newOrderId() }
}
