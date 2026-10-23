import { useState } from 'react'
import type { ProductListItem } from '../../service/fetchProductList'
import { formatPeso } from '../../utils/format'
import { Tooltip } from '../ui/Tooltip'

export function ProductRow({ product }: { product: ProductListItem }) {
  const [failed, setFailed] = useState(false)
  const image = product.primaryImage
  const empty = product.totalStock <= 0

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:min-h-20 sm:flex-nowrap">
      {image && !failed ? (
        <img
          src={image.url}
          alt={image.altText ?? product.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-14 shrink-0 rounded-xl bg-line object-cover"
        />
      ) : (
        <div aria-hidden="true" className="size-14 shrink-0 rounded-xl bg-line" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-fg">{product.name}</p>
        <p className="truncate text-sm text-fg-muted">
          {product.category}
          {product.brand ? `, ${product.brand}` : ''}
        </p>
        <Tooltip label={product.id}>
          <span tabIndex={0} aria-label={`Product ID ${product.id}`} className="rounded-sm font-mono text-sm text-fg-muted">
            {product.id.slice(0, 8)}
          </span>
        </Tooltip>
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 text-right tabular-nums sm:block sm:w-auto sm:shrink-0">
        <p className={`text-base font-semibold ${empty ? 'text-danger' : 'text-fg'}`}>
          {product.totalStock}
          <span className="text-sm font-normal text-fg-muted"> in stock</span>
        </p>
        <p className="text-sm text-fg-muted">
          <span className="whitespace-nowrap">{formatPeso(product.minPrice)}</span>
          {product.maxPrice > product.minPrice && (
            <>
              {' – '}
              <span className="whitespace-nowrap">{formatPeso(product.maxPrice)}</span>
            </>
          )}
        </p>
      </div>
    </li>
  )
}
