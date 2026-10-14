import { useRef, useState } from 'react'
import { LOW_STOCK, sizesFor, type Product } from '../../data/products'
import { formatPeso } from '../../utils/format'
import { BagIcon, CameraIcon, CartIcon, MinusIcon, PaletteIcon, PlusIcon, RulerIcon, StarIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'
import { CHANNEL_LABEL, SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'
import { OPTION_BASE, type Choice } from './SpecSheet'

interface ProductPurchasePanelProps {
  product: Product
  /** Pieces of this product already in the cart: Add can only take what is left. */
  inCart: number
  onAdd: (choice: Choice) => void
  onBuy: (choice: Choice) => void
}

const SIZE_ERROR = 'Choose a size to continue.'
const COLOR_ERROR = 'Choose a colour to continue.'
const LEGEND = 'font-ui text-xs font-semibold tracking-[0.12em] text-fg uppercase'
const LEGEND_ICON = 'mr-2 -mt-0.5 inline align-middle'
// The Tooltip wraps its control in an inline span; these make the span and the button fill the row slot.
const SLOT = 'flex [&>span]:w-full [&>span>button]:w-full'
// Roughly three lines of the panel; longer copy is clamped behind "View more".
const DESCRIPTION_PREVIEW = 200
const ACTION ='min-h-12! w-full text-base!'

export function ProductPurchasePanel({ product, inCart, onAdd, onBuy }: ProductPurchasePanelProps) {
  const { name, stock, salePrice } = product
  const sizes = sizesFor(product)
  const left = stock - inCart
  const soldOut = left <= 0
  const unit = salePrice ?? product.price
  const [color, setColor] = useState(product.colors.length === 1 ? product.colors[0].name : '')
  const [size, setSize] = useState('')
  const [wanted, setWanted] = useState(1)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const longDescription = (product.description?.length ?? 0) > DESCRIPTION_PREVIEW
  const sizeGroup = useRef<HTMLFieldSetElement>(null)
  const colorGroup = useRef<HTMLFieldSetElement>(null)
  // Adding to the cart can lower what is left below the chosen quantity.
  const qty = Math.max(1, Math.min(wanted, left))
  const channel = product.channels.length === 2 ? CHANNEL_LABEL.both : CHANNEL_LABEL[product.channels[0]]

  function submit(act: (choice: Choice) => void) {
    if (soldOut) return
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
    act({ size, color, qty })
  }

  const addButton = (
    <button
      type="button"
      aria-disabled={soldOut}
      aria-label={soldOut ? 'Add to cart, sold out' : undefined}
      onClick={() => submit(onAdd)}
      className={`${SHOP_SECONDARY} ${ACTION}`}
    >
      <CartIcon />
      Add to cart
      <span className="tabular-nums">· {formatPeso(unit * qty)}</span>
    </button>
  )
  const buyButton = (
    <button
      type="button"
      aria-disabled={soldOut}
      aria-label={soldOut ? 'Buy now, sold out' : undefined}
      onClick={() => submit(onBuy)}
      className={`${SHOP_PRIMARY} ${ACTION}`}
    >
      <BagIcon />
      Buy now
    </button>
  )

  return (
    // Fills the screen height: the details scroll, the actions stay pinned, the page never scrolls.
    <div className="flex h-full min-h-0 flex-col gap-3 [@media(min-height:800px)]:gap-4 [@media(min-height:900px)]:gap-6">
      <div
        role="region"
        aria-label="Product details"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-3 [@media(min-height:800px)]:gap-4 [@media(min-height:900px)]:gap-6 overflow-y-auto pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong [&>*]:shrink-0"
      >
      <div className="flex flex-col gap-2">
        <p className="font-ui text-xs tracking-[0.16em] text-fg-muted uppercase">
          {product.category} · {product.boutique}
        </p>
        <div className="flex items-start justify-between gap-6">
          <h2 className="text-2xl leading-tight font-semibold text-fg">{name}</h2>
          <p className="flex shrink-0 flex-wrap justify-end gap-x-2 text-2xl font-semibold text-fg tabular-nums">
            {salePrice !== undefined && (
              <>
                <span className="sr-only">Original price </span>
                <s className="font-normal text-fg-muted">{formatPeso(product.price)}</s>
                <span className="sr-only">Sale price </span>
              </>
            )}
            <span>{formatPeso(unit)}</span>
          </p>
        </div>
        <p className="flex items-center gap-1 text-sm text-fg-muted tabular-nums">
          <StarIcon className="text-fg" />
          <span aria-hidden="true">
            {product.rating.toFixed(1)} · {product.reviews.toLocaleString('en-PH')} reviews
          </span>
          <span className="sr-only">
            Rated {product.rating.toFixed(1)} out of 5 from {product.reviews.toLocaleString('en-PH')} reviews
          </span>
        </p>
        <p className="font-ui text-sm text-fg-muted">
          {stock <= LOW_STOCK && (
            <>
              <span className="font-semibold text-danger">{stock === 0 ? 'Sold out' : `Only ${stock} left`}</span>
              {' · '}
            </>
          )}
          {channel}
        </p>
      </div>

      {product.description && (
        <div className="flex flex-col">
          <p
            id="product-description"
            className={`text-sm leading-relaxed whitespace-pre-line text-fg-muted ${
              expanded ? '' : 'line-clamp-3 [@media(max-height:799px)]:line-clamp-2'
            }`}
          >
            {product.description}
          </p>
          {longDescription && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="product-description"
              onClick={() => setExpanded((open) => !open)}
              className="font-ui mt-2 w-fit shrink-0 cursor-pointer text-sm font-semibold text-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong"
            >
              {expanded ? 'View less' : 'View more'}
            </button>
          )}
        </div>
      )}

      <fieldset ref={colorGroup} aria-describedby={error === COLOR_ERROR ? 'product-error' : undefined}>
        <legend className={LEGEND}>
          <PaletteIcon size={16} className={LEGEND_ICON} />
          Colour
          {color ? (
            <span className="font-normal text-fg-muted">: {color}</span>
          ) : (
            <span className="font-normal text-fg-muted"> (required)</span>
          )}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <label key={c.name} className="relative">
              <input
                type="radio"
                name="product-color"
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
          <p id="product-error" role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </fieldset>

      <fieldset ref={sizeGroup} aria-describedby={error === SIZE_ERROR ? 'product-error' : undefined}>
        <legend className={LEGEND}>
          <RulerIcon size={16} className={LEGEND_ICON} />
          Size{size ? <span className="font-normal text-fg-muted">: {size}</span> : <span className="font-normal text-fg-muted"> (required)</span>}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sizes.map((s) => (
            <label key={s} className="relative">
              <input
                type="radio"
                name="product-size"
                value={s}
                checked={size === s}
                onChange={() => {
                  setSize(s)
                  setError('')
                }}
                className="peer sr-only"
              />
              <span data-checked={size === s} className={`${OPTION_BASE} min-w-8 pointer-coarse:min-w-11 tabular-nums`}>
                {s}
              </span>
            </label>
          ))}
        </div>
        {error === SIZE_ERROR && (
          <p id="product-error" role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </fieldset>

      <div>
        <p id="product-qty-label" className={LEGEND}>
          Quantity
        </p>
        {soldOut ? (
          <p className="mt-2 text-sm text-fg-muted">
            {stock === 0 ? 'This piece is sold out.' : `All ${stock} in stock are already in your cart, so no more can be added.`}
          </p>
        ) : (
          <div role="group" aria-labelledby="product-qty-label" className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={qty <= 1}
              onClick={() => setWanted(qty - 1)}
              className={`${SHOP_SECONDARY} size-8 pointer-coarse:size-11 px-0`}
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
              onClick={() => setWanted(qty + 1)}
              className={`${SHOP_SECONDARY} size-8 pointer-coarse:size-11 px-0`}
            >
              <PlusIcon />
            </button>
            <span className="font-ui text-xs text-fg-muted tabular-nums">
              {left <= 5 ? `Only ${left} available` : `${left} available`}
            </span>
          </div>
        )}
      </div>

      </div>

      <div className="flex flex-col gap-3">
        {product.arReady && (
          <div className={SLOT}>
            <Tooltip label="AR try-on isn't available yet">
              <button type="button" aria-disabled="true" className={`${SHOP_SECONDARY} min-h-12! w-full`}>
                <CameraIcon />
                AR Virtual Try-On
              </button>
            </Tooltip>
          </div>
        )}
        <div className="flex gap-3">
          <div className={`${SLOT} flex-1`}>{soldOut ? <Tooltip label="Sold out">{addButton}</Tooltip> : addButton}</div>
          <div className={`${SLOT} flex-1`}>{soldOut ? <Tooltip label="Sold out">{buyButton}</Tooltip> : buyButton}</div>
        </div>
      </div>
    </div>
  )
}
