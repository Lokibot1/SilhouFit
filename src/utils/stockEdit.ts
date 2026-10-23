export const MAX_STOCK = 99999
export const STOCK_ERROR = 'Enter a number from 0 to 99,999.'

/** Live typing filter: digits only, five at most (so never above 99,999). */
export const filterStock = (input: string) => input.replace(/\D/g, '').slice(0, String(MAX_STOCK).length)

/** The number typed in a stock box, or null while it is empty. */
export const parseStock = (text: string): number | null => (text === '' ? null : Number(text))

/** The box text after pressing - or + (an empty box counts as 0), kept within 0 to 99,999. */
export const stepStock = (text: string, delta: 1 | -1) => String(Math.min(MAX_STOCK, Math.max(0, (parseStock(text) ?? 0) + delta)))

/** The variants whose box differs from their saved stock. An empty box counts as a change, so it blocks saving until it is filled in. */
export function editedVariants<T extends { id: string; stock: number }>(variants: T[], draft: Record<string, string>): T[] {
  return variants.filter((v) => draft[v.id] !== undefined && parseStock(draft[v.id]) !== v.stock)
}
