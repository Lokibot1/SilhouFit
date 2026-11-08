import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { LOW_STOCK, productImages, type Product } from '../../data/products'
import { BagIcon, CartIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, HeartIcon, StarIcon } from '../form/icons'
import { formatPeso } from '../../utils/format'
import { SilhouetteMark } from '../landing/SilhouetteMark'
import { KRAL_PRIMARY, KRAL_SECONDARY, SHOP_PRIMARY, SHOP_SECONDARY } from './shopControls'

// flex-auto: each button is as wide as its label needs, then they share what is left, so "Add to cart" never wraps.
const BUY_BUTTON = `${SHOP_PRIMARY} min-w-0 flex-auto whitespace-nowrap max-sm:px-2 max-sm:text-xs`
const ADD_BUTTON = `${SHOP_SECONDARY} min-w-0 flex-auto whitespace-nowrap max-sm:px-2 max-sm:text-xs`
// KRAL: no tracking on phones, where 16px mono caps must fit a half-width card.
const KRAL_BUY = `${KRAL_PRIMARY} min-w-0 flex-auto px-2 max-md:tracking-normal`
const KRAL_ADD = `${KRAL_SECONDARY} min-w-0 flex-auto px-2 max-md:tracking-normal`

// Controls fade in on hover or keyboard focus; touch screens have no hover, so they stay visible there.
const REVEAL =
  'opacity-0 transition-[opacity,translate] duration-500 ease-in-out group-hover/img:opacity-100 group-has-focus-visible/img:opacity-100 pointer-coarse:opacity-100'
// The chevrons also drift in from the edge and the dots rise into place, on the same timing.
const KRAL_REVEAL =
  'opacity-0 transition-opacity duration-200 ease-out group-hover/img:opacity-100 group-has-focus-visible/img:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none'
const DRIFT = 'transition-transform duration-500 ease-in-out group-hover/img:translate-x-0 group-has-focus-visible/img:translate-x-0 pointer-coarse:translate-x-0'

const SAVED_ON = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

interface ProductCardProps {
  product: Product
  /** Position in the grid; the first few images load eagerly. */
  index: number
  list?: boolean
  saved: boolean
  onToggleSaved: (product: Product) => void
  onAddToCart: (product: Product) => void
  onBuy: (product: Product) => void
  /** The wishlist page: a checkbox on the photo for acting on several pieces at once. */
  selection?: { selected: boolean; onChange: (selected: boolean) => void }
  /** The wishlist page: when the piece was saved, as an ISO time. */
  savedOn?: string
  /** 'kral' sets the card in the KRAL style: square image tile, display-font name, mono price and tags, no pills or shadows. */
  tone?: 'kral'
}

export function ProductCard({ product, index, list = false, saved, onToggleSaved, onAddToCart, onBuy, selection, savedOn, tone }: ProductCardProps) {
  const kral = tone === 'kral'
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState(0)
  const { name, salePrice, stock } = product
  const soldOut = stock === 0
  const images = productImages(product)
  const multi = images.length > 1
  // Wraps around at both ends. Stops the click so it never reaches the card.
  const step = (by: number) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCurrent((c) => (c + by + images.length) % images.length)
  }
  const href = `/shop/${product.slug ?? product.id}`

  return (
    <article className={`${kral ? 'group/card' : ''} h-full ${list ? 'flex gap-4' : 'flex flex-col'}`}>
      <div
        className={`group/img relative aspect-3/4 shrink-0 overflow-hidden ${
          kral ? 'bg-kral-porcelain dark:bg-kral-graphite' : 'rounded-xl border border-line bg-canvas-sub'
        } ${list ? 'w-28 sm:w-44' : 'w-full'} ${selection?.selected ? (kral ? 'outline-2 outline-kral-fg' : 'ring-2 ring-fg') : ''}`}
      >
        {/* The photo is a second route to the page; the name below is the keyboard one. The controls stay outside the anchor. */}
        <Link to={href} tabIndex={-1} className="block size-full">
        {failed ? (
          <div
            role="img"
            aria-label={`${name} (photo unavailable)`}
            className={`flex size-full flex-col items-center justify-center gap-2 p-3 text-center ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}
          >
            <SilhouetteMark className={`w-10 ${kral ? 'text-kral-muted' : 'text-fg-muted'} [&>path]:[stroke-width:2px] [&>path]:[vector-effect:non-scaling-stroke] [&>path:last-of-type]:hidden`} />
            <span className={`${kral ? 'font-kral-mono uppercase' : 'font-ui'} text-xs`}>{name}</span>
          </div>
        ) : (
          <div
            className="flex size-full transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {images.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={i === 0 ? product.alt : `${product.alt} (view ${i + 1} of ${images.length})`}
                loading={i === 0 && index < 4 ? 'eager' : 'lazy'}
                decoding="async"
                onError={(e) => (i === 0 ? setFailed(true) : (e.currentTarget.style.visibility = 'hidden'))}
                className="photo-mono size-full shrink-0 object-cover"
              />
            ))}
          </div>
        )}
        </Link>

        {product.badges.length > 0 && (
          <ul className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap items-start gap-1">
            {product.badges.map((badge) => (
              <li
                key={badge}
                className={
                  kral
                    ? "font-kral-mono bg-kral-bg px-1.5 py-0.5 text-xs tracking-[0.08em] whitespace-nowrap text-kral-muted uppercase before:content-['('] after:content-[')']"
                    : `skeuo-gloss font-ui rounded-full whitespace-nowrap ${list ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'}`
                }
              >
                {badge}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => onToggleSaved(product)}
          aria-pressed={saved}
          aria-label={`Save ${name} to wishlist`}
          className={`absolute top-0 right-0 flex size-11 items-center justify-center ${kral ? 'kral-focus group/heart text-kral-fg' : 'text-fg'}`}
        >
          <span
            className={`flex size-8 max-sm:size-7 items-center justify-center ${
              kral
                ? 'transition-colors duration-150 ease-out group-hover/heart:bg-kral-fg/10 motion-reduce:transition-none'
                : 'rounded-full bg-canvas'
            }`}
          >
            <HeartIcon filled={saved} />
          </span>
        </button>

        {selection && (
          <label className={`absolute bottom-0 left-0 flex size-11 cursor-pointer items-center justify-center ${kral ? 'text-kral-fg' : 'text-fg'}`}>
            <input
              type="checkbox"
              checked={selection.selected}
              onChange={(e) => selection.onChange(e.target.checked)}
              aria-label={`Select ${name}`}
              className="peer sr-only"
            />
            <span
              className={
                kral
                  ? 'flex size-6 items-center justify-center border-2 border-kral-fg bg-kral-bg peer-checked:bg-kral-fg peer-checked:text-kral-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-kral-red-ink'
                  : 'flex size-6 items-center justify-center rounded-md border-2 border-fg bg-canvas peer-checked:bg-fg peer-checked:text-canvas peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong'
              }
            >
              {selection.selected && <CheckIcon size={16} />}
            </span>
          </label>
        )}

        {multi && (
          <>
            <button
              type="button"
              onClick={step(-1)}
              aria-label="Previous image"
              className={`absolute top-1/2 left-0 flex size-11 max-sm:size-9 max-sm:pointer-coarse:size-11 -translate-y-1/2 cursor-pointer items-center justify-center ${kral ? `kral-focus text-kral-fg ${KRAL_REVEAL}` : `text-fg ${REVEAL}`}`}
            >
              <span className={`flex size-8 max-sm:size-6 items-center justify-center ${kral ? 'bg-kral-bg' : `-translate-x-2 rounded-full bg-canvas ${DRIFT}`}`}>
                <ChevronLeftIcon />
              </span>
            </button>
            <button
              type="button"
              onClick={step(1)}
              aria-label="Next image"
              className={`absolute top-1/2 right-0 flex size-11 max-sm:size-9 max-sm:pointer-coarse:size-11 -translate-y-1/2 cursor-pointer items-center justify-center ${kral ? `kral-focus text-kral-fg ${KRAL_REVEAL}` : `text-fg ${REVEAL}`}`}
            >
              <span className={`flex size-8 max-sm:size-6 items-center justify-center ${kral ? 'bg-kral-bg' : `translate-x-2 rounded-full bg-canvas ${DRIFT}`}`}>
                <ChevronRightIcon />
              </span>
            </button>
            <p className="sr-only" aria-live="polite">
              Image {current + 1} of {images.length}
            </p>
            <ol aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5 ${
                kral ? KRAL_REVEAL : `translate-y-1.5 group-hover/img:translate-y-0 group-has-focus-visible/img:translate-y-0 pointer-coarse:translate-y-0 ${REVEAL}`
              }`}>
              {images.map((src, i) => (
                <li
                  key={src}
                  className={`size-1.5 transition-opacity duration-200 ${kral ? 'bg-kral-bg' : 'rounded-full bg-canvas'} ${i === current ? 'opacity-100' : 'opacity-50'}`}
                />
              ))}
            </ol>
          </>
        )}
      </div>

      {/* Spacing follows proximity: 4px inside a group, 12px between groups, 16px before the actions. */}
      <div className={`flex min-w-0 flex-1 flex-col gap-3 ${list ? '' : 'mt-3'}`}>
        <div className="flex flex-col gap-1">
          <h3
            className={
              kral
                ? 'font-kral-display text-sm leading-tight font-extrabold text-kral-fg uppercase [overflow-wrap:anywhere] xl:text-base'
                : 'text-sm leading-snug font-semibold text-fg sm:text-base'
            }
          >
            <Link
              to={href}
              className={
                kral
                  ? 'tap kral-focus underline decoration-1 underline-offset-4 decoration-transparent transition-colors duration-150 ease-out hover:decoration-kral-red-ink group-hover/card:decoration-kral-red-ink motion-reduce:transition-none'
                  : 'tap hover:underline'
              }
            >
              {name}
            </Link>
          </h3>
          {product.reviews > 0 && (
            <p className={`flex items-center gap-1 text-xs tabular-nums sm:text-sm ${kral ? 'font-kral-mono text-kral-muted' : 'text-fg-muted'}`}>
              <StarIcon className={kral ? 'text-kral-fg' : 'text-fg'} />
              <span aria-hidden="true">
                {product.rating.toFixed(1)} ({product.reviews.toLocaleString('en-PH')})
              </span>
              <span className="sr-only">
                Rated {product.rating.toFixed(1)} out of 5 from {product.reviews.toLocaleString('en-PH')} reviews
              </span>
            </p>
          )}
          {savedOn && <p className={`text-xs ${kral ? 'font-kral-mono text-kral-muted' : 'font-ui text-fg-muted'}`}>Saved {SAVED_ON.format(new Date(savedOn))}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            {product.colors.length > 0 && (
              <p>
                <span className="sr-only">Available in {product.colors.map((c) => c.name).join(', ')}</span>
                <span aria-hidden="true" className="flex gap-1">
                  {product.colors.map((c) => (
                    <span
                      key={c.name}
                      className={`size-3 border sm:size-4 ${kral ? 'border-kral-muted' : 'rounded-full border-fg-muted'}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </span>
              </p>
            )}
            <p
              className={`ml-auto flex flex-wrap justify-end gap-x-2 tabular-nums ${
                kral ? 'font-kral-mono text-base font-medium text-kral-fg md:text-sm' : 'text-sm font-semibold text-fg sm:text-base'
              }`}
            >
              {salePrice !== undefined ? (
                <>
                  <span className="sr-only">Original price </span>
                  <s className={`font-normal ${kral ? 'text-kral-muted' : 'text-fg-muted'}`}>{formatPeso(product.price)}</s>
                  <span className="sr-only">Sale price </span>
                  <span>{formatPeso(salePrice)}</span>
                </>
              ) : (
                <span>
                  {product.priceMax !== undefined && 'From '}
                  {formatPeso(product.price)}
                </span>
              )}
            </p>
          </div>
          {stock <= LOW_STOCK && (
            <p className={`text-xs ${kral ? 'font-kral-mono tracking-[0.08em] text-kral-muted uppercase' : 'font-ui text-fg-muted'}`}>
              <span className={kral ? 'font-medium text-danger' : 'font-semibold text-danger'}>{soldOut ? 'Sold out' : `Only ${stock} left`}</span>
            </p>
          )}
        </div>
        {/* Pinned to the bottom so cards in a row end together; stacked until there is room for two. */}
        <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row">
          <button
            type="button"
            aria-disabled={soldOut}
            title={soldOut ? 'Sold out' : undefined}
            aria-label={soldOut ? `Add ${name} to cart, sold out` : `Add ${name} to cart`}
            onClick={() => !soldOut && onAddToCart(product)}
            className={kral ? KRAL_ADD : ADD_BUTTON}
          >
            <CartIcon size={16} />
            Add to cart
          </button>
          <button
            type="button"
            aria-disabled={soldOut}
            title={soldOut ? 'Sold out' : undefined}
            aria-label={soldOut ? `Buy ${name}, sold out` : `Buy ${name}`}
            onClick={() => !soldOut && onBuy(product)}
            className={kral ? KRAL_BUY : BUY_BUTTON}
          >
            <BagIcon size={16} />
            Buy
          </button>
        </div>
      </div>
    </article>
  )
}
