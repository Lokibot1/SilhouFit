import { useRef, useState } from 'react'
import { sizesFor, type Product } from '../../data/products'
import { formatPeso } from '../../utils/format'
import { Modal } from '../ui/Modal'
import { SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'

export interface Choice {
  size: string
  color: string
  qty: number
}

interface SpecSheetProps {
  open: boolean
  onClose: () => void
  product: Product
  action: 'cart' | 'buy'
  /** Pieces of this product already in the cart: Add can only take what is left. */
  inCart: number
  onConfirm: (choice: Choice) => void
  /** Not signed in: Buy now says they will sign in before paying. */
  guest?: boolean
}

const SIZE_ERROR = 'Choose a size to continue.'
const COLOR_ERROR = 'Choose a colour to continue.'
const LEGEND = 'font-ui text-sm font-semibold text-fg'
const OPTION_BASE =
  'skeuo font-ui flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong'

/** Pick the specs (colour, size, quantity) for Add to cart or Buy now, with the price following the choice. */
export function SpecSheet({ open, onClose, product, action, inCart, onConfirm, guest = false }: SpecSheetProps) {
  const sizes = sizesFor(product)
  const left = action === 'cart' ? product.stock - inCart : product.stock
  const [color, setColor] = useState(product.colors.length === 1 ? product.colors[0].name : '')
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [error, setError] = useState('')
  const sizeGroup = useRef<HTMLFieldSetElement>(null)
  const colorGroup = useRef<HTMLFieldSetElement>(null)

  // Each opening starts fresh.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setColor(product.colors.length === 1 ? product.colors[0].name : '')
      setSize('')
      setQty(1)
      setError('')
    }
  }

  const unit = product.salePrice ?? product.price
  const verb = action === 'cart' ? 'Add to cart' : 'Buy now'

  function confirm() {
    if (!size) {
      setError(SIZE_ERROR)
      sizeGroup.current?.querySelector('input')?.focus()
      return
    }
    if (!color) {
      setError(COLOR_ERROR)
      colorGroup.current?.querySelector('input')?.focus()
      return
    }
    onConfirm({ size, color, qty })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose options"
      variant="sheet"
      footer={
        <div className="space-y-2">
          {guest && action === 'buy' && <p className="text-center text-sm text-fg-muted">You&apos;ll sign in before you pay.</p>}
          <button type="button" onClick={confirm} disabled={left <= 0} className={`${SHOP_PRIMARY} w-full`}>
            {verb}
          </button>
        </div>
      }
    >
      <div className="space-y-5 pb-5">
        <div className="flex gap-4">
          <img
            src={product.image}
            alt={product.alt}
            className="photo-mono h-28 w-21 shrink-0 rounded-xl border border-line object-cover"
          />
          <div className="min-w-0">
            <p className="font-ui truncate text-[11px] tracking-[0.16em] text-fg-muted uppercase">
              {product.category} · {product.boutique}
            </p>
            <h3 className="mt-1 text-base leading-snug font-semibold text-fg">{product.name}</h3>
            <p className="mt-1 flex flex-wrap gap-x-2 text-base font-semibold text-fg tabular-nums">
              {product.salePrice !== undefined && (
                <>
                  <span className="sr-only">Original price </span>
                  <s className="font-normal text-fg-muted">{formatPeso(product.price)}</s>
                  <span className="sr-only">Sale price </span>
                </>
              )}
              <span>{formatPeso(unit)}</span>
            </p>
          </div>
        </div>

        <fieldset ref={colorGroup} aria-describedby={error === COLOR_ERROR ? 'spec-error' : undefined}>
          <legend className={LEGEND}>
            Colour
            {color ? (
              <span className="font-normal text-fg-muted">: {color}</span>
            ) : (
              product.colors.length > 1 && <span className="font-normal text-fg-muted"> (required)</span>
            )}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <label key={c.name} className="relative">
                <input
                  type="radio"
                  name="spec-color"
                  value={c.name}
                  checked={color === c.name}
                  onChange={() => {
                    setColor(c.name)
                    setError('')
                  }}
                  className="peer sr-only"
                />
                <span data-checked={color === c.name} className={OPTION_BASE}>
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-full border border-fg-muted"
                    style={{ backgroundColor: c.hex }}
                  />
                  {c.name}
                </span>
              </label>
            ))}
          </div>
          {error === COLOR_ERROR && (
            <p id="spec-error" role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </fieldset>

        <fieldset ref={sizeGroup} aria-describedby={error === SIZE_ERROR ? 'spec-error' : undefined}>
          <legend className={LEGEND}>
            Size{size ? <span className="font-normal text-fg-muted">: {size}</span> : <span className="font-normal text-fg-muted"> (required)</span>}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label key={s} className="relative">
                <input
                  type="radio"
                  name="spec-size"
                  value={s}
                  checked={size === s}
                  onChange={() => {
                    setSize(s)
                    setError('')
                  }}
                  className="peer sr-only"
                />
                <span data-checked={size === s} className={`${OPTION_BASE} min-w-9 pointer-coarse:min-w-11 tabular-nums`}>
                  {s}
                </span>
              </label>
            ))}
          </div>
          {error === SIZE_ERROR && (
            <p id="spec-error" role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </fieldset>

        <div>
          <p id="spec-qty-label" className={LEGEND}>
            Quantity
          </p>
          {left <= 0 ? (
            <p className="mt-2 text-sm text-fg-muted">
              All {product.stock} in stock are already in your cart, so no more can be added.
            </p>
          ) : (
            <div role="group" aria-labelledby="spec-qty-label" className="mt-2 flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
                className={`${SHOP_SECONDARY} size-9 pointer-coarse:size-11 px-0`}
              >
                −
              </button>
              <output aria-live="polite" className="font-ui min-w-8 text-center text-base font-semibold text-fg tabular-nums">
                {qty}
              </output>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={qty >= left}
                onClick={() => setQty(qty + 1)}
                className={`${SHOP_SECONDARY} size-9 pointer-coarse:size-11 px-0`}
              >
                +
              </button>
              <span className="font-ui text-sm text-fg-muted tabular-nums">
                {left <= 5 ? `Only ${left} available` : `${left} available`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
          <span className="font-ui text-sm text-fg-muted tabular-nums">
            {formatPeso(unit)} × {qty}
          </span>
          <span className="text-right text-xl font-semibold text-fg tabular-nums">
            <span className="sr-only">Total </span>
            {formatPeso(unit * qty)}
          </span>
        </div>
      </div>
    </Modal>
  )
}
