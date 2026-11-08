import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { choiceOf, sizesFor, type Product } from '../../data/products'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { formatPeso } from '../../utils/format'
import { BagIcon, CartIcon, FilterIcon, HashIcon, MinusIcon, PaletteIcon, PlusIcon, RulerIcon } from '../form/icons'
import { Modal } from '../ui/Modal'
import { KRAL_PRIMARY, KRAL_SECONDARY, SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'

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
  /** 'kral' sets the sheet in the KRAL style: square chips and buttons, mono labels, display-font name. */
  tone?: 'kral'
}

const SIZE_ERROR = 'Choose a size to continue.'
const COLOR_ERROR = 'Choose a colour to continue.'
const LEGEND = 'font-ui text-xs font-semibold tracking-[0.12em] text-fg uppercase'
const LEGEND_ICON = 'mr-2 -mt-0.5 inline align-middle'
const KRAL_LEGEND = 'font-kral-mono text-xs font-medium tracking-[0.08em] text-kral-fg uppercase'
export const KRAL_OPTION =
  'kral-focus font-kral-mono flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-none border border-kral-muted px-3 text-base font-medium text-kral-fg uppercase transition-colors duration-150 ease-out hover:border-kral-fg hover:bg-kral-fg/10 data-[checked=true]:border-kral-fg data-[checked=true]:bg-kral-fg data-[checked=true]:text-kral-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-kral-red-ink motion-reduce:transition-none md:text-xs md:tracking-[0.08em]'
export const OPTION_BASE =
  'skeuo font-ui flex min-h-8 pointer-coarse:min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong'

/** Pick the specs (colour, size, quantity) for Add to cart or Buy now, with the price following the choice. */
export function SpecSheet({ open, onClose, product, action, inCart, onConfirm, guest = false, step, tone }: SpecSheetProps) {
  const kral = tone === 'kral'
  const optionBase = kral ? KRAL_OPTION : OPTION_BASE
  const legend = kral ? KRAL_LEGEND : LEGEND
  const errorClass = kral ? 'font-kral-mono mt-2 text-sm text-danger' : 'mt-2 text-sm text-danger'
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
      tone={tone}
      footer={
        <div className="space-y-2">
          {guest && action === 'buy' && last && <p className={`text-center text-sm ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>You&apos;ll sign in before you pay.</p>}
          <button type="button" onClick={confirm} disabled={left <= 0} className={kral ? `${KRAL_PRIMARY} w-full` : `${SHOP_PRIMARY} min-h-14! w-full text-lg!`}>
            {!kral && (action === 'cart' ? <CartIcon /> : <BagIcon />)}
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
        <div className={`flex gap-4 p-3 ${kral ? 'border border-kral-rule' : 'rounded-xl border border-line bg-fg/5'}`}>
          <img
            src={product.image}
            alt={product.alt}
            className={`photo-mono h-48 w-36 shrink-0 object-cover ${kral ? '' : 'rounded-md border border-line'}`}
          />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-xs uppercase ${kral ? 'font-kral-mono tracking-[0.08em] text-kral-muted' : 'font-ui tracking-[0.16em] text-fg-muted'}`}>
              {[product.category, product.boutique].filter(Boolean).join(' · ')}
            </p>
            <h3 className={`mt-1 leading-tight ${kral ? 'font-kral-display text-lg font-extrabold text-kral-fg uppercase [overflow-wrap:anywhere]' : 'text-2xl font-semibold text-fg'}`}>{product.name}</h3>
            <p className={`mt-3 flex flex-wrap gap-x-2 text-lg tabular-nums ${kral ? 'font-kral-mono font-medium text-kral-fg' : 'font-semibold text-fg'}`}>
              {product.salePrice !== undefined && (
                <>
                  <span className="sr-only">Original price </span>
                  <s className={`font-normal ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}>{formatPeso(product.price)}</s>
                  <span className="sr-only">Sale price </span>
                </>
              )}
              <span>{formatPeso(unit)}</span>
            </p>
          </div>
        </div>

        <fieldset ref={colorGroup} hidden={product.colors.length === 0} aria-describedby={error === COLOR_ERROR ? 'spec-error' : undefined}>
          <legend className={legend}>
            <PaletteIcon size={16} className={LEGEND_ICON} />
            Colour
            {color ? (
              <span className={`font-normal ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}>: {color}</span>
            ) : (
              product.colors.length > 1 && <span className={`font-normal ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}> (required)</span>
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
                <span data-checked={color === c.name} className={optionBase}>
                  <span
                    aria-hidden="true"
                    className={`size-3 border ${kral ? 'border-kral-muted' : 'rounded-full border-fg-muted'}`}
                    style={{ backgroundColor: c.hex }}
                  />
                  {c.name}
                </span>
              </label>
            ))}
          </div>
          {error === COLOR_ERROR && (
            <p id="spec-error" role="alert" className={errorClass}>
              {error}
            </p>
          )}
        </fieldset>

        <fieldset ref={sizeGroup} hidden={sizes.length === 0} aria-describedby={error === SIZE_ERROR ? 'spec-error' : undefined}>
          <legend className={legend}>
            <RulerIcon size={16} className={LEGEND_ICON} />
            Size{size ? <span className={`font-normal ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}>: {size}</span> : <span className={`font-normal ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}> (required)</span>}
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
                <span data-checked={size === s} className={`${optionBase} min-w-8 pointer-coarse:min-w-11 max-lg:min-h-11 max-lg:min-w-11 tabular-nums`}>
                  {s}
                </span>
              </label>
            ))}
          </div>
          {error === SIZE_ERROR && (
            <p id="spec-error" role="alert" className={errorClass}>
              {error}
            </p>
          )}
        </fieldset>

        <div>
          <p id="spec-qty-label" className={legend}>
            <HashIcon size={16} className={LEGEND_ICON} />
            Quantity
          </p>
          {left <= 0 ? (
            <p className={`mt-2 text-sm ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
              {stock === 0 ? 'This size and colour is sold out.' : `All ${stock} in stock are already in your cart, so no more can be added.`}
            </p>
          ) : (
            <div role="group" aria-labelledby="spec-qty-label" className="mt-3 flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
                className={kral ? `${KRAL_SECONDARY} size-11 px-0` : `${SHOP_SECONDARY} size-8 pointer-coarse:size-11 max-lg:size-11 px-0`}
              >
                <MinusIcon />
              </button>
              <output aria-live="polite" className={`min-w-6 text-center text-sm tabular-nums ${kral ? 'font-kral-mono font-medium text-kral-fg' : 'font-ui font-semibold text-fg'}`}>
                {qty}
              </output>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={qty >= left}
                onClick={() => setQty(qty + 1)}
                className={kral ? `${KRAL_SECONDARY} size-11 px-0` : `${SHOP_SECONDARY} size-8 pointer-coarse:size-11 max-lg:size-11 px-0`}
              >
                <PlusIcon />
              </button>
              <span className={`text-xs tabular-nums ${kral ? 'font-kral-mono text-kral-muted' : 'font-ui text-fg-muted'}`}>
                {left <= 5 ? `Only ${left} available` : `${left} available`}
              </span>
            </div>
          )}
        </div>

        <div className={`flex items-baseline justify-between gap-4 px-4 py-3 ${kral ? 'border border-kral-rule' : 'rounded-xl border border-line bg-fg/5'}`}>
          <span className={`text-sm tabular-nums ${kral ? 'font-kral-mono text-kral-muted' : 'font-ui text-fg-muted'}`}>
            {formatPeso(unit)} × {qty}
          </span>
          <span className={`text-right text-xl tabular-nums ${kral ? 'font-kral-mono font-medium text-kral-fg' : 'font-semibold text-fg'}`}>
            <span className="sr-only">Total </span>
            {formatPeso(unit * qty)}
          </span>
        </div>
        </motion.div>
      </AnimatePresence>
    </Modal>
  )
}
