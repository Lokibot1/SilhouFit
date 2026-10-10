import { useState } from 'react'
import { LOW_STOCK, type Product } from '../../data/products'
import { HeartIcon, StarIcon } from '../form/icons'
import { SilhouetteMark } from '../landing/SilhouetteMark'

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

const CHANNEL_LABEL = { both: 'Online and in store', online: 'Online only', store: 'In store only' } as const

interface ProductCardProps {
  product: Product
  /** Position in the grid; the first few images load eagerly. */
  index: number
  list?: boolean
  saved: boolean
  onToggleSaved: (product: Product) => void
}

export function ProductCard({ product, index, list = false, saved, onToggleSaved }: ProductCardProps) {
  const [failed, setFailed] = useState(false)
  const { name, salePrice, stock } = product
  const channel = product.channels.length === 2 ? CHANNEL_LABEL.both : CHANNEL_LABEL[product.channels[0]]

  return (
    <article className={list ? 'flex gap-4' : 'flex flex-col'}>
      <div
        className={`relative aspect-3/4 shrink-0 overflow-hidden rounded-2xl border border-line bg-canvas-sub ${
          list ? 'w-28 sm:w-44' : 'w-full'
        }`}
      >
        {failed ? (
          <div
            role="img"
            aria-label={`${name} (photo unavailable)`}
            className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-fg-muted"
          >
            <SilhouetteMark className="w-10 text-fg-muted" />
            <span className="font-ui text-xs">{name}</span>
          </div>
        ) : (
          <img
            src={product.image}
            alt={product.alt}
            loading={index < 4 ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setFailed(true)}
            className="photo-mono size-full object-cover"
          />
        )}

        <ul className="absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1">
          {product.badges.map((badge) => (
            <li key={badge} className="font-ui rounded-full bg-canvas px-2 py-0.5 text-[11px] text-fg">
              {badge}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => onToggleSaved(product)}
          aria-pressed={saved}
          aria-label={`Save ${name} to wishlist`}
          className="absolute top-0 right-0 flex size-11 items-center justify-center text-fg"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-canvas">
            <HeartIcon filled={saved} />
          </span>
        </button>

        {stock <= LOW_STOCK && (
          <p className="font-ui absolute bottom-2 left-2 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-fg">
            {stock === 0 ? 'Sold out' : `Only ${stock} left`}
          </p>
        )}
      </div>

      <div className={`min-w-0 ${list ? 'flex-1' : 'mt-3'}`}>
        <p className="font-ui text-[11px] tracking-[0.16em] text-fg-muted uppercase">
          {product.category} · {product.boutique}
        </p>
        <h3 className="mt-1 text-base leading-snug font-semibold text-fg">{name}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-fg-muted tabular-nums">
          <StarIcon className="text-fg" />
          <span aria-hidden="true">
            {product.rating.toFixed(1)} ({product.reviews.toLocaleString('en-PH')})
          </span>
          <span className="sr-only">
            Rated {product.rating.toFixed(1)} out of 5 from {product.reviews.toLocaleString('en-PH')} reviews
          </span>
        </p>
        <p className="mt-2 flex flex-wrap justify-end gap-x-2 text-base font-semibold text-fg tabular-nums">
          {salePrice !== undefined ? (
            <>
              <span className="sr-only">Original price </span>
              <s className="font-normal text-fg-muted">{PESO.format(product.price)}</s>
              <span className="sr-only">Sale price </span>
              <span>{PESO.format(salePrice)}</span>
            </>
          ) : (
            <span>{PESO.format(product.price)}</span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p>
            <span className="sr-only">Available in {product.colors.map((c) => c.name).join(', ')}</span>
            <span aria-hidden="true" className="flex gap-1">
              {product.colors.map((c) => (
                <span
                  key={c.name}
                  className="size-4 rounded-full border border-fg-muted"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </span>
          </p>
          <p className="font-ui text-right text-xs text-fg-muted">{channel}</p>
        </div>
      </div>
    </article>
  )
}
