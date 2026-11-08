import { useEffect, useRef, useState } from 'react'
import { choiceOf, LOW_STOCK, sizesFor, type Product } from '../../data/products'
import { formatPeso } from '../../utils/format'
import { BagIcon, CameraIcon, CartIcon, MinusIcon, PaletteIcon, PlusIcon, RulerIcon, StarIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'
import { SizeGuideModal } from './SizeGuideModal'
import { PRODUCT_ACTIONS, PRODUCT_DETAILS, PRODUCT_PANEL } from './ProductSkeleton'
import { KRAL_PRIMARY, KRAL_SECONDARY } from './shopControls'
import { KRAL_OPTION, type Choice } from './SpecSheet'

interface ProductPurchasePanelProps {
  product: Product
  /** Pieces of a variant already in the cart: Add can only take what is left. */
  inCart: (variantId: string | undefined) => number
  onAdd: (choice: Choice) => void
  onBuy: (choice: Choice) => void
}

const SIZE_ERROR = 'Choose a size to continue.'
const COLOR_ERROR = 'Choose a colour to continue.'
// Mono labels: 16px on phones, the 12px label size from md.
const LEGEND = 'font-kral-mono text-base font-medium text-kral-fg uppercase md:text-xs md:tracking-[0.08em]'
const MUTED = 'font-normal text-kral-muted'
const LINK =
  'kral-focus font-kral-mono flex min-h-11 w-fit shrink-0 cursor-pointer items-center gap-2 text-base font-medium text-kral-fg uppercase underline decoration-1 underline-offset-4 transition-colors duration-150 ease-out hover:decoration-kral-red-ink motion-reduce:transition-none md:text-xs md:tracking-[0.08em]'
/* A fieldset legend sits on the fieldset's top edge, over the divider above it; floating it puts it in the padding like the Quantity label. */
const FIELDSET_LEGEND = `${LEGEND} float-left w-full p-0`
const LEGEND_ICON = 'mr-2 -mt-0.5 inline align-middle'
// The Tooltip wraps its control in an inline span; these make the span and the button fill the row slot.
const SLOT = 'flex [&>span]:w-full [&>span>button]:w-full'
// Roughly three lines of the panel; longer copy is clamped behind "View more".
const DESCRIPTION_PREVIEW = 200
const ACTION = 'w-full whitespace-normal! px-3 text-center'

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
      className={`${KRAL_SECONDARY} ${ACTION}`}
    >
      <CartIcon size={16} />
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
      className={`${KRAL_PRIMARY} ${ACTION}`}
    >
      <BagIcon size={16} />
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
        className={`kral-focus flex flex-col max-lg:min-h-0 max-lg:overflow-y-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2 ${PRODUCT_DETAILS} [&>*]:shrink-0`}
      >
      <div className="flex flex-col gap-2 max-lg:flex-row max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-1">
        <p className="font-kral-mono text-xs tracking-[0.08em] text-kral-muted uppercase max-lg:sr-only">
          {[product.category, product.boutique].filter(Boolean).join(' // ')}
        </p>
        <div className="flex items-start justify-between gap-x-6 gap-y-1 max-lg:basis-full max-sm:flex-wrap">
          <h2 className="font-kral-display min-w-0 text-lg leading-[1.05] font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase lg:text-xl">{name}</h2>
          <p className="font-kral-mono flex shrink-0 flex-wrap justify-end gap-x-2 text-lg font-medium text-kral-fg tabular-nums lg:text-xl">
            {salePrice !== undefined && (
              <>
                <span className="sr-only">Original price </span>
                <s className="font-normal text-kral-muted">{formatPeso(product.price)}</s>
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
          <p className="font-kral-mono flex items-center gap-1 text-base text-kral-muted tabular-nums md:text-sm">
            <StarIcon className="text-kral-fg" />
            <span aria-hidden="true">
              {product.rating.toFixed(1)} · {product.reviews.toLocaleString('en-PH')} reviews
            </span>
            <span className="sr-only">
              Rated {product.rating.toFixed(1)} out of 5 from {product.reviews.toLocaleString('en-PH')} reviews
            </span>
          </p>
        )}
        {product.stock <= LOW_STOCK && (
          <p className="font-kral-mono text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]">
            <span className="font-medium text-danger">{product.stock === 0 ? 'Sold out' : `Only ${product.stock} left`}</span>
          </p>
        )}
      </div>

      {product.description && (
        <div className="flex flex-col">
          <p
            ref={descRef}
            id="product-description"
            className={`font-kral-mono text-base leading-relaxed whitespace-pre-line text-kral-muted lg:text-[15px] ${
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
              className={`${LINK} lg:mt-1`}
            >
              {expanded ? 'View less' : 'View more'}
            </button>
          )}
        </div>
      )}

      <fieldset ref={colorGroup} hidden={product.colors.length === 0} data-tour="product-options" aria-describedby={error === COLOR_ERROR ? 'product-error' : undefined}>
        <legend className={FIELDSET_LEGEND}>
          <PaletteIcon size={16} className={LEGEND_ICON} />
          Colour
          {color ? (
            <span className={MUTED}>: {color}</span>
          ) : (
            <span className={MUTED}> (required)</span>
          )}
        </legend>
        <div className="clear-both flex flex-wrap gap-2 pt-3">
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
              <span data-checked={color === c.name} className={KRAL_OPTION}>
                <span
                  aria-hidden="true"
                  className="size-4 border border-kral-muted"
                  style={{ backgroundColor: c.hex }}
                />
                {c.name}
              </span>
            </label>
          ))}
        </div>
        {error === COLOR_ERROR && (
          <p id="product-error" role="alert" className="font-kral-mono mt-2 text-base text-danger md:text-sm">
            {error}
          </p>
        )}
      </fieldset>

      <fieldset ref={sizeGroup} hidden={sizes.length === 0} data-tour="product-options" aria-describedby={error === SIZE_ERROR ? 'product-error' : undefined}>
        <legend className={FIELDSET_LEGEND}>
          <RulerIcon size={16} className={LEGEND_ICON} />
          Size{size ? <span className={MUTED}>: {size}</span> : <span className={MUTED}> (required)</span>}
        </legend>
        <div className="clear-both flex flex-wrap gap-2 pt-3 max-lg:grid max-lg:grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))]">
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
              <span data-checked={size === s} className={`${KRAL_OPTION} min-w-11 tabular-nums`}>
                {s}
              </span>
            </label>
          ))}
        </div>
        {error === SIZE_ERROR && (
          <p id="product-error" role="alert" className="font-kral-mono mt-2 text-base text-danger md:text-sm">
            {error}
          </p>
        )}
        {product.variants && product.variants.length > 0 && (
          <>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setGuideOpen(true)}
              className={`${LINK} mt-1`}
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
          <p className="font-kral-mono mt-2 text-base text-kral-muted max-lg:mt-0 md:text-sm">
            {stock === 0 ? (product.stock === 0 ? 'This piece is sold out.' : 'This size and colour is sold out.') : `All ${stock} in stock are already in your cart, so no more can be added.`}
          </p>
        ) : (
          <div role="group" aria-labelledby="product-qty-label" className="mt-3 flex flex-wrap items-center gap-2 max-lg:mt-0">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={qty <= 1}
              onClick={() => setWanted(qty - 1)}
              className={`${KRAL_SECONDARY} size-11 px-0`}
            >
              <MinusIcon />
            </button>
            <output aria-live="polite" className="font-kral-mono min-w-6 text-center text-base font-medium text-kral-fg tabular-nums">
              {qty}
            </output>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={qty >= left}
              onClick={() => setWanted(qty + 1)}
              className={`${KRAL_SECONDARY} size-11 px-0`}
            >
              <PlusIcon />
            </button>
            <span className="font-kral-mono text-base text-kral-muted tabular-nums md:text-xs">
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
            <Tooltip tone="kral" label="AR try-on isn't available yet">
              <button
                type="button"
                data-tour="product-ar"
                aria-disabled="true"
                aria-label="AR Virtual Try-On"
                className={`${KRAL_SECONDARY} ${ACTION}`}
              >
                <CameraIcon size={16} />
                <span aria-hidden="true">
                  AR <span className="max-sm:hidden">Virtual </span>Try-On
                </span>
              </button>
            </Tooltip>
          </div>
        )}
        <div className="flex flex-col gap-2 max-lg:contents sm:flex-row sm:gap-3">
          <div className={`${SLOT} flex-1 max-lg:order-1 max-lg:col-span-2`}>{soldOut ? <Tooltip tone="kral" label="Sold out">{addButton}</Tooltip> : addButton}</div>
          <div className={`${SLOT} flex-1 max-lg:order-3 ${product.arReady ? '' : 'max-lg:col-span-2'}`}>{soldOut ? <Tooltip tone="kral" label="Sold out">{buyButton}</Tooltip> : buyButton}</div>
        </div>
      </div>
    </div>
  )
}
