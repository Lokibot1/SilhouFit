import { useEffect, useRef, useState } from 'react'
import { choiceOf, LOW_STOCK, sizesFor, type Product } from '../../data/products'
import { formatPeso } from '../../utils/format'
import { BagIcon, CameraIcon, CartIcon, MinusIcon, PaletteIcon, PlusIcon, RulerIcon, StarIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'
import { SizeGuideModal } from './SizeGuideModal'
import { PRODUCT_ACTIONS, PRODUCT_PANEL } from './ProductSkeleton'
import { CHANNEL_LABEL, SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'
import { OPTION_BASE, type Choice } from './SpecSheet'

interface ProductPurchasePanelProps {
  product: Product
  /** Pieces of a variant already in the cart: Add can only take what is left. */
  inCart: (variantId: string | undefined) => number
  onAdd: (choice: Choice) => void
  onBuy: (choice: Choice) => void
}

const SIZE_ERROR = 'Choose a size to continue.'
const COLOR_ERROR = 'Choose a colour to continue.'
const LEGEND = 'font-ui text-sm lg:text-xs font-semibold tracking-[0.12em] text-fg uppercase'
const LEGEND_ICON = 'mr-2 -mt-0.5 inline align-middle'
// The Tooltip wraps its control in an inline span; these make the span and the button fill the row slot.
const SLOT = 'flex [&>span]:w-full [&>span>button]:w-full'
// Below lg the pills and steppers are 44px tall and 16px, on any pointer.
const TOUCH = 'max-lg:min-h-11! max-lg:text-base!'
// Roughly three lines of the panel; longer copy is clamped behind "View more".
const DESCRIPTION_PREVIEW = 200
const ACTION = 'min-h-12! w-full text-base! max-lg:min-h-11!'

export function ProductPurchasePanel({ product, inCart, onAdd, onBuy }: ProductPurchasePanelProps) {
  const { name, salePrice } = product
  const sizes = sizesFor(product)
  const [color, setColor] = useState(product.colors.length === 1 ? product.colors[0].name : '')
  const [size, setSize] = useState('')
  // Once size and colour are chosen, stock and price are those of that variant.
  const { variant, stock, price: unit } = choiceOf(product, size, color)
  const left = stock - inCart(variant?.id)
  const soldOut = left <= 0
  const [wanted, setWanted] = useState(1)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const longDescription = (product.description?.length ?? 0) > DESCRIPTION_PREVIEW
  const descRef = useRef<HTMLParagraphElement>(null)
  // Below lg the clamp can cut short copy too, so View more also appears when the text is really cut off.
  const [clipped, setClipped] = useState(false)
  const sizeGroup = useRef<HTMLFieldSetElement>(null)
  const colorGroup = useRef<HTMLFieldSetElement>(null)
  // Adding to the cart can lower what is left below the chosen quantity.
  const qty = Math.max(1, Math.min(wanted, left))
  const channel = product.channels.length === 2 ? CHANNEL_LABEL.both : product.channels.length === 1 ? CHANNEL_LABEL[product.channels[0]] : null

  useEffect(() => {
    const el = descRef.current
    if (!el || expanded) return
    const check = () => setClipped(window.innerWidth < 1024 && el.scrollHeight > el.clientHeight + 1)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [expanded, product.description])

  function submit(act: (choice: Choice) => void) {
    if (soldOut) return
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
    act({ size, color, qty, variantId: variant!.id })
  }

  const addButton = (
    <button
      type="button"
      data-tour="product-add"
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
      data-tour="product-buy"
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
    // From lg it fills the screen height: the details scroll, the actions stay pinned, the page never scrolls.
    <div className={PRODUCT_PANEL}>
      <div
        role="region"
        aria-label="Product details"
        tabIndex={0}
        className="flex flex-col gap-2 max-lg:min-h-0 max-lg:overflow-y-auto lg:min-h-0 lg:gap-3 lg:flex-1 lg:[@media(min-height:800px)]:gap-4 lg:[@media(min-height:900px)]:gap-6 lg:overflow-y-auto lg:pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong [&>*]:shrink-0"
      >
      <div className="flex flex-col gap-2 max-lg:flex-row max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-1">
        <p className="font-ui text-sm tracking-[0.16em] text-fg-muted uppercase max-lg:sr-only lg:text-xs">
          {[product.category, product.boutique].filter(Boolean).join(' · ')}
        </p>
        <div className="flex items-start justify-between gap-x-6 gap-y-1 max-lg:basis-full max-sm:flex-wrap">
          <h2 className="min-w-0 text-xl leading-tight lg:text-2xl font-semibold [overflow-wrap:anywhere] text-fg">{name}</h2>
          <p className="flex shrink-0 flex-wrap justify-end gap-x-2 text-xl font-semibold lg:text-2xl text-fg tabular-nums">
            {salePrice !== undefined && (
              <>
                <span className="sr-only">Original price </span>
                <s className="font-normal text-fg-muted">{formatPeso(product.price)}</s>
                <span className="sr-only">Sale price </span>
              </>
            )}
            <span>
              {product.priceMax !== undefined && !variant && 'From '}
              {formatPeso(unit)}
            </span>
          </p>
        </div>
        {product.reviews > 0 && (
          <p className="flex items-center gap-1 text-sm text-fg-muted tabular-nums">
            <StarIcon className="text-fg" />
            <span aria-hidden="true">
              {product.rating.toFixed(1)} · {product.reviews.toLocaleString('en-PH')} reviews
            </span>
            <span className="sr-only">
              Rated {product.rating.toFixed(1)} out of 5 from {product.reviews.toLocaleString('en-PH')} reviews
            </span>
          </p>
        )}
        {(product.stock <= LOW_STOCK || channel) && (
          <p className="font-ui text-sm text-fg-muted">
            {product.stock <= LOW_STOCK && (
              <>
                <span className="font-semibold text-danger">{product.stock === 0 ? 'Sold out' : `Only ${product.stock} left`}</span>
                {channel && ' · '}
              </>
            )}
            {channel}
          </p>
        )}
      </div>

      {product.description && (
        <div className="flex flex-col">
          <p
            ref={descRef}
            id="product-description"
            className={`text-base leading-relaxed whitespace-pre-line text-fg-muted lg:text-sm ${
              expanded ? '' : 'line-clamp-3 max-lg:line-clamp-2 lg:[@media(max-height:799px)]:line-clamp-2'
            }`}
          >
            {product.description}
          </p>
          {(longDescription || clipped || expanded) && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="product-description"
              onClick={() => setExpanded((open) => !open)}
              className="font-ui flex w-fit shrink-0 lg:mt-2 cursor-pointer items-center text-base font-semibold max-lg:min-h-11 lg:text-sm text-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong"
            >
              {expanded ? 'View less' : 'View more'}
            </button>
          )}
        </div>
      )}

      <fieldset ref={colorGroup} hidden={product.colors.length === 0} data-tour="product-options" aria-describedby={error === COLOR_ERROR ? 'product-error' : undefined}>
        <legend className={LEGEND}>
          <PaletteIcon size={16} className={LEGEND_ICON} />
          Colour
          {color ? (
            <span className="font-normal text-fg-muted">: {color}</span>
          ) : (
            <span className="font-normal text-fg-muted"> (required)</span>
          )}
        </legend>
        <div className="mt-1 flex flex-wrap gap-2 lg:mt-2">
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
              <span data-checked={color === c.name} className={`${OPTION_BASE} ${TOUCH} max-lg:px-4`}>
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
          <p id="product-error" role="alert" className="mt-2 text-base text-danger lg:text-sm">
            {error}
          </p>
        )}
      </fieldset>

      <fieldset ref={sizeGroup} hidden={sizes.length === 0} data-tour="product-options" aria-describedby={error === SIZE_ERROR ? 'product-error' : undefined}>
        <legend className={LEGEND}>
          <RulerIcon size={16} className={LEGEND_ICON} />
          Size{size ? <span className="font-normal text-fg-muted">: {size}</span> : <span className="font-normal text-fg-muted"> (required)</span>}
        </legend>
        <div className="mt-1 flex flex-wrap gap-2 lg:mt-2 max-lg:grid max-lg:grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))]">
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
              <span data-checked={size === s} className={`${OPTION_BASE} ${TOUCH} min-w-8 pointer-coarse:min-w-11 max-lg:min-w-11 tabular-nums`}>
                {s}
              </span>
            </label>
          ))}
        </div>
        {error === SIZE_ERROR && (
          <p id="product-error" role="alert" className="mt-2 text-base text-danger lg:text-sm">
            {error}
          </p>
        )}
        {product.variants && product.variants.length > 0 && (
          <>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setGuideOpen(true)}
              className="font-ui mt-2 flex min-h-11 w-fit cursor-pointer items-center gap-2 text-base font-semibold lg:text-sm text-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-strong"
            >
              <RulerIcon size={16} />
              Size guide
            </button>
            <SizeGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} category={product.category} variants={product.variants} selected={size} productId={product.id} />
          </>
        )}
      </fieldset>

      <div className="max-lg:flex max-lg:flex-wrap max-lg:items-center max-lg:gap-x-3">
        <p id="product-qty-label" className={LEGEND}>
          Quantity
        </p>
        {soldOut ? (
          <p className="mt-2 text-base text-fg-muted max-lg:mt-0 lg:text-sm">
            {stock === 0 ? (product.stock === 0 ? 'This piece is sold out.' : 'This size and colour is sold out.') : `All ${stock} in stock are already in your cart, so no more can be added.`}
          </p>
        ) : (
          <div role="group" aria-labelledby="product-qty-label" className="mt-3 flex items-center gap-2 max-lg:mt-0">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={qty <= 1}
              onClick={() => setWanted(qty - 1)}
              className={`${SHOP_SECONDARY} size-8 pointer-coarse:size-11 max-lg:size-11 px-0`}
            >
              <MinusIcon />
            </button>
            <output aria-live="polite" className="font-ui min-w-6 text-center text-base font-semibold lg:text-sm text-fg tabular-nums">
              {qty}
            </output>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={qty >= left}
              onClick={() => setWanted(qty + 1)}
              className={`${SHOP_SECONDARY} size-8 pointer-coarse:size-11 max-lg:size-11 px-0`}
            >
              <PlusIcon />
            </button>
            <span className="font-ui text-sm text-fg-muted tabular-nums lg:text-xs">
              {left <= 5 ? `Only ${left} available` : `${left} available`}
            </span>
          </div>
        )}
      </div>

      </div>

      <div
        // Publishes its height so a toast sits above the bar instead of over the buttons.
        ref={(el) => {
          if (!el) return
          const publish = () => document.documentElement.style.setProperty('--bottom-bar-h', `${el.offsetHeight}px`)
          publish()
          const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
          resize?.observe(el)
          return () => {
            resize?.disconnect()
            document.documentElement.style.removeProperty('--bottom-bar-h')
          }
        }}
        className={PRODUCT_ACTIONS}
      >
        {product.arReady && (
          <div className={`${SLOT} max-lg:order-2`}>
            <Tooltip label="AR try-on isn't available yet">
              <button
                type="button"
                data-tour="product-ar"
                aria-disabled="true"
                aria-label="AR Virtual Try-On"
                className={`${SHOP_SECONDARY} min-h-12! w-full max-lg:min-h-11!`}
              >
                <CameraIcon />
                <span aria-hidden="true">
                  AR <span className="max-sm:hidden">Virtual </span>Try-On
                </span>
              </button>
            </Tooltip>
          </div>
        )}
        <div className="flex flex-col gap-2 max-lg:contents sm:flex-row sm:gap-3">
          <div className={`${SLOT} flex-1 max-lg:order-1 max-lg:col-span-2`}>{soldOut ? <Tooltip label="Sold out">{addButton}</Tooltip> : addButton}</div>
          <div className={`${SLOT} flex-1 max-lg:order-3 ${product.arReady ? '' : 'max-lg:col-span-2'}`}>{soldOut ? <Tooltip label="Sold out">{buyButton}</Tooltip> : buyButton}</div>
        </div>
      </div>
    </div>
  )
}
