export const orderId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A notification as the API sends it: `n` sets the id, the text and the time (higher is newer). */
export const apiNotification = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
  type: 'ORDER_PAID',
  title: `Payment received ${n}`,
  body: `Order SHF-${n} is paid.`,
  data: { orderId: orderId(n) },
  readAt: null as string | null,
  createdAt: new Date(Date.UTC(2026, 0, 1) + n * 3_600_000).toISOString(),
  ...over,
})

export type ApiNotification = ReturnType<typeof apiNotification>
