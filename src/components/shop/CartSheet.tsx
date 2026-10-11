import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sizesFor, type Product } from '../../data/products'
import { lineKey, useCart, type Line } from '../../hooks/useCart'
import { useCatalogue } from '../../hooks/useProducts'
import { resolveCartItems } from '../../utils/checkout'
import { formatPeso } from '../../utils/format'
import { CartIcon, SparkleIcon } from '../form/icons'
import { Modal } from '../ui/Modal'
import { SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'

interface CartSheetProps {
  open: boolean
  onClose: () => void
  /** Not signed in: Checkout says they will sign in before paying. */
  guest?: boolean
}

type Row = { line: Line; product: Product | undefined; problem: string | null }

/** Why a line cannot be bought, or null when it can. */
function problemWith(line: Line, product: Product | undefined) {
  if (!product) return 'No longer in the catalogue'
  if (product.stock === 0) return 'Sold out'
  if (!line.size || !line.color || !sizesFor(product).includes(line.size) || !product.colors.some((c) => c.name === line.color)) {
    return 'Size and colour were not chosen. Remove it and add it again from the shop.'
  }
  return null
}

const REMOVE = 'tap pointer-coarse:min-h-11 pointer-coarse:items-center text-sm font-medium text-fg underline underline-offset-2 hover:text-chrome-strong cursor-pointer'

/** The cart as a drawer: change quantities, remove lines (with an Undo inside the drawer), then check out. */
export function CartSheet({ open, onClose, guest = false }: CartSheetProps) {
  const navigate = useNavigate()
  const cart = useCart()
  const catalogue = useCatalogue()
  // Removed lines wait here for an Undo until the drawer closes. (Toasts sit under the drawer's backdrop.)
  const [removed, setRemoved] = useState<{ line: Line; name: string }[]>([])
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setRemoved([])
  }

  const rows: Row[] = catalogue
    ? cart.lines.map((line) => {
        const product = catalogue.find((p) => p.id === line.id)
        return { line, product, problem: problemWith(line, product) }
      })
    : []
  // The count and subtotal use the same resolution as the navbar badge and the checkout, so all three agree.
  const bought = catalogue ? resolveCartItems(cart.lines, catalogue).items : []
  const count = bought.reduce((sum, item) => sum + item.qty, 0)
  const subtotal = bought.reduce((sum, item) => sum + (item.product.salePrice ?? item.product.price) * item.qty, 0)

  function remove(row: Row) {
    cart.removeLines([lineKey(row.line)])
    // Only a line that could be bought gets an Undo; a broken one is simply cleared.
    if (!row.problem) setRemoved((current) => [...current, { line: row.line, name: row.product!.name }])
  }

  function undo(entry: { line: Line; name: string }) {
    const { line } = entry
    const product = catalogue?.find((p) => p.id === line.id)
    // Back through the stock check, in case the cart changed in the meantime.
    if (product && cart.add({ product, size: line.size, color: line.color, qty: line.qty }) === 'added') {
      setRemoved((current) => current.filter((e) => e !== entry))
    }
  }

  function browseNewArrivals() {
    onClose()
    navigate('/shop?sort=newest')
  }

  function checkout() {
    onClose()
    navigate('/checkout?source=cart')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your cart"
      variant="sheet"
      footer={
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-ui text-sm text-fg-muted tabular-nums">
              Subtotal ({count} {count === 1 ? 'item' : 'items'})
            </span>
            <span className="text-right text-xl font-semibold text-fg tabular-nums">{formatPeso(subtotal)}</span>
          </div>
          {guest && bought.length > 0 && <p className="text-center text-sm text-fg-muted">You&apos;ll sign in before you pay.</p>}
          <button type="button" onClick={checkout} disabled={bought.length === 0} className={`${SHOP_PRIMARY} w-full`}>
            Checkout
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-5">
        {removed.map((entry) => (
          <p key={lineKey(entry.line)} role="status" className="flex items-baseline justify-between gap-3 text-sm text-fg-muted">
            <span className="min-w-0">Removed {entry.name}.</span>
            <button type="button" aria-label={`Undo removing ${entry.name}`} onClick={() => undo(entry)} className={REMOVE}>
              Undo
            </button>
          </p>
        ))}

        {!catalogue && cart.lines.length > 0 && (
          <ul role="status" aria-label="Loading your cart" className="animate-pulse space-y-4">
            {cart.lines.map((line) => (
              <li key={lineKey(line)} className="flex gap-4">
                <div className="h-24 w-18 shrink-0 rounded-xl bg-line-strong" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded-xl bg-line" />
                  <div className="h-5 w-2/3 rounded-xl bg-line" />
                  <div className="h-9 w-full rounded-xl bg-line" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {cart.lines.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <span aria-hidden="true" className="glass-card flex size-14 items-center justify-center rounded-full text-fg">
              <CartIcon />
            </span>
            <h3 className="display mt-4 text-xl text-fg">Your cart is empty</h3>
            <p className="mt-2 max-w-xs text-base leading-relaxed text-fg-muted">
              Pieces you add will wait here until you check out. Start with what just arrived.
            </p>
            <button type="button" onClick={browseNewArrivals} className={`${SHOP_PRIMARY} mt-5 w-full max-w-xs`}>
              <SparkleIcon size={16} />
              Shop new arrivals
            </button>
            <button type="button" onClick={onClose} className={`${SHOP_SECONDARY} mt-2 w-full max-w-xs`}>
              Keep shopping
            </button>
          </div>
        )}

        <ul className="space-y-5">
          {rows.map((row) => {
            const { line, product, problem } = row
            const key = lineKey(line)
            if (problem || !product) {
              return (
                <li key={key} className="rounded-xl border border-line-strong p-3">
                  <p className="text-base font-semibold text-fg">{product?.name ?? 'A piece in your cart'}</p>
                  <p className="mt-1 text-sm text-danger">{problem}</p>
                  <p className="mt-1 text-sm text-fg-muted">It is left out of the subtotal and the count.</p>
                  <button type="button" aria-label={`Remove ${product?.name ?? 'this piece'}`} onClick={() => remove(row)} className={`${REMOVE} mt-1`}>
                    Remove
                  </button>
                </li>
              )
            }
            const unit = product.salePrice ?? product.price
            const room = product.stock - (cart.qtyOfProduct(product.id) - line.qty)
            const qty = Math.min(line.qty, product.stock)
            return (
              <li key={key} className="flex gap-4">
                <img
                  src={product.image}
                  alt={product.alt}
                  className="photo-mono h-24 w-18 shrink-0 rounded-xl border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base leading-snug font-semibold break-words text-fg">{product.name}</h3>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    Size {line.size} · {line.color}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-muted tabular-nums">{formatPeso(unit)} each</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div role="group" aria-label={`Quantity of ${product.name}`} className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        disabled={qty <= 1}
                        onClick={() => cart.setQty(key, qty - 1)}
                        className={`${SHOP_SECONDARY} size-9 pointer-coarse:size-11 px-0`}
                      >
                        −
                      </button>
                      <output aria-live="polite" className="font-ui min-w-6 text-center text-base font-semibold text-fg tabular-nums">
                        {qty}
                      </output>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${product.name}`}
                        disabled={qty >= room}
                        onClick={() => cart.setQty(key, qty + 1)}
                        className={`${SHOP_SECONDARY} size-9 pointer-coarse:size-11 px-0`}
                      >
                        +
                      </button>
                    </div>
                    <p className="text-right text-base font-semibold text-fg tabular-nums">
                      <span className="sr-only">Line total </span>
                      {formatPeso(unit * qty)}
                    </p>
                  </div>
                  <button type="button" aria-label={`Remove ${product.name}`} onClick={() => remove(row)} className={`${REMOVE} mt-1`}>
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
