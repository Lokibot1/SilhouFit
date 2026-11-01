import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { choiceOf, sizesFor, type Product } from '../../data/products'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { formatPeso } from '../../utils/format'
import { BagIcon, CartIcon, FilterIcon, HashIcon, MinusIcon, PaletteIcon, PlusIcon, RulerIcon } from '../form/icons'
import { Modal } from '../ui/Modal'
import { SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'

export interface Choice {
  size: string
  color: string
  qty: number
  /** The variant the size and colour come to. */
  variantId: string
}

interface SpecSheetProps {
  open: boolean
  onClose: () => void
  product: Product
  action: 'cart' | 'buy'
  /** Pieces of a variant already in the cart: Add can only take what is left. */
  inCart: (variantId: string | undefined) => number
  onConfirm: (choice: Choice) => void
  /** Not signed in: Buy now says they will sign in before paying. */
  guest?: boolean
  /** Choosing for several pieces in turn (the wishlist): which one this is. */
  step?: { index: number; total: number }
}

const SIZE_ERROR = 'Choose a size to continue.'
const COLOR_ERROR = 'Choose a colour to continue.'
const LEGEND = 'font-ui text-xs font-semibold tracking-[0.12em] text-fg uppercase'
const LEGEND_ICON = 'mr-2 -mt-0.5 inline align-middle'
export const OPTION_BASE =
  'skeuo font-ui flex min-h-8 pointer-coarse:min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong'

/** Pick the specs (colour, size, quantity) for Add to cart or Buy now, with the price following the choice. */
export function SpecSheet({ open, onClose, product, action, inCart, onConfirm, guest = false, step }: SpecSheetProps) {
  const sizes = sizesFor(product)
  const reduced = useReducedMotion()
  const drift = reduced ? 0 : 24
  const [color, setColor] = useState(product.colors.length === 1 ? product.colors[0].name : '')
  const [size, setSize] = useState('')
  const { variant, stock, price: unit } = choiceOf(product, size, color)
  const left = action === 'cart' ? stock - inCart(variant?.id) : stock
  const [qty, setQty] = useState(1)
  const [error, setError] = useState('')
  const sizeGroup = useRef<HTMLFieldSetElement>(null)
  const colorGroup = useRef<HTMLFieldSetElement>(null)

  // Each opening, and each next piece in a sequence, starts fresh.
  const resetKey = `${open}|${product.id}`
  const [wasKey, setWasKey] = useState(resetKey)
  if (resetKey !== wasKey) {
    setWasKey(resetKey)
    if (open) {
      setColor(product.colors.length === 1 ? product.colors[0].name : '')
      setSize('')
      setQty(1)
      setError('')
    }
  }

  const last = !step || step.index === step.total
  const verb = !last ? 'Next piece' : action === 'cart' ? 'Add to cart' : 'Buy now'

  function confirm() {
    if (!size && sizes.length > 0) {
      setError(SIZE_ERROR)
      sizeGroup.current?.querySelector('input')?.focus()
      return
    }
    if (!color && product.colors.length > 0) {
      setError(COLOR_ERROR)
      colorGroup.current?.querySelector('input')?.focus()
      return
    }
    onConfirm({ size, color, qty, variantId: variant!.id })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step && step.total > 1 ? `Choose options (${step.index} of ${step.total})` : 'Choose options'}
      icon={<FilterIcon />}
      variant="sheet"
      footer={
        <div className="space-y-2">
          {guest && action === 'buy' && last && <p className="text-center text-sm text-fg-muted">You&apos;ll sign in before you pay.</p>}
          <button type="button" onClick={confirm} disabled={left <= 0} className={`${SHOP_PRIMARY} min-h-14! w-full text-lg!`}>
            {action === 'cart' ? <CartIcon /> : <BagIcon />}
            {verb}
          </button>
        </div>
      }
    >
      {/* Moving to the next piece: the old one eases out to the left, the next eases in from the right. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={product.id}
          initial={{ opacity: 0, x: drift }}
          animate={{ opacity: 1, x: 0, transition: { duration: DURATION.shift, ease: EASE_OUT } }}
          exit={{ opacity: 0, x: -drift, transition: { duration: DURATION.state, ease: EASE_OUT } }}
          className="space-y-6 pb-6"
        >
        <div className="flex gap-4 rounded-xl border border-line bg-fg/5 p-3">
          <img
            src={product.image}
            alt={product.alt}
            className="photo-mono h-48 w-36 shrink-0 rounded-md border border-line object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="font-ui truncate text-[11px] tracking-[0.16em] text-fg-muted uppercase">
              {[product.category, product.boutique].filter(Boolean).join(' · ')}
            </p>
            <h3 className="mt-1 text-2xl leading-tight font-semibold text-fg">{product.name}</h3>
            <p className="mt-3 flex flex-wrap gap-x-2 text-lg font-semibold text-fg tabular-nums">
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

        <fieldset ref={colorGroup} hidden={product.colors.length === 0} aria-describedby={error === COLOR_ERROR ? 'spec-error' : undefined}>
          <legend className={LEGEND}>
            <PaletteIcon size={16} className={LEGEND_ICON} />
            Colour
            {color ? (
              <span className="font-normal text-fg-muted">: {color}</span>
            ) : (
              product.colors.length > 1 && <span className="font-normal text-fg-muted"> (required)</span>
            )}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
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
                    className="size-3 rounded-full border border-fg-muted"
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

        <fieldset ref={sizeGroup} hidden={sizes.length === 0} aria-describedby={error === SIZE_ERROR ? 'spec-error' : undefined}>
          <legend className={LEGEND}>
            <RulerIcon size={16} className={LEGEND_ICON} />
            Size{size ? <span className="font-normal text-fg-muted">: {size}</span> : <span className="font-normal text-fg-muted"> (required)</span>}
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
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
                <span data-checked={size === s} className={`${OPTION_BASE} min-w-8 pointer-coarse:min-w-11 max-lg:min-h-11 max-lg:min-w-11 tabular-nums`}>
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
            <HashIcon size={16} className={LEGEND_ICON} />
            Quantity
          </p>
          {left <= 0 ? (
            <p className="mt-2 text-sm text-fg-muted">
              {stock === 0 ? 'This size and colour is sold out.' : `All ${stock} in stock are already in your cart, so no more can be added.`}
            </p>
          ) : (
            <div role="group" aria-labelledby="spec-qty-label" className="mt-3 flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
                className={`${SHOP_SECONDARY} size-8 pointer-coarse:size-11 max-lg:size-11 px-0`}
              >
                <MinusIcon />
              </button>
              <output aria-live="polite" className="font-ui min-w-6 text-center text-sm font-semibold text-fg tabular-nums">
                {qty}
              </output>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={qty >= left}
                onClick={() => setQty(qty + 1)}
                className={`${SHOP_SECONDARY} size-8 pointer-coarse:size-11 max-lg:size-11 px-0`}
              >
                <PlusIcon />
              </button>
              <span className="font-ui text-xs text-fg-muted tabular-nums">
                {left <= 5 ? `Only ${left} available` : `${left} available`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-4 rounded-xl border border-line bg-fg/5 px-4 py-3">
          <span className="font-ui text-sm text-fg-muted tabular-nums">
            {formatPeso(unit)} × {qty}
          </span>
          <span className="text-right text-xl font-semibold text-fg tabular-nums">
            <span className="sr-only">Total </span>
            {formatPeso(unit * qty)}
          </span>
        </div>
        </motion.div>
      </AnimatePresence>
    </Modal>
  )
}
